(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TVSPFE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function finiteProbability(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n < 1 ? n : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeDependencyGroups(row, id) {
    const supplied = Array.isArray(row?.dependencyGroups)
      ? row.dependencyGroups
      : [row?.dependencyGroup];
    const groups = [...new Set(supplied
      .filter(value => typeof value === "string" && value.trim())
      .map(value => value.trim()))];
    return groups.length ? groups : [id];
  }

  function fusePredictions(predictions, options = {}) {
    const rows = Array.isArray(predictions) ? predictions : [];
    const accepted = [];
    const seenIds = new Set();
    const rejected = [];
    for (const row of rows) {
      const id = typeof row?.id === "string" ? row.id.trim() : "";
      const probability = finiteProbability(row?.probability);
      if (!id || seenIds.has(id) || probability === null) {
        rejected.push({ id: id || null, reason: !id ? "missing_id" : seenIds.has(id) ? "duplicate_id" : "invalid_probability" });
        continue;
      }
      seenIds.add(id);
      const quality = row.quality === undefined ? 1 : Number(row.quality);
      const calibratedWeight = row.calibratedWeight === undefined ? 1 : Number(row.calibratedWeight);
      if (!Number.isFinite(quality) || quality < 0 || quality > 1 ||
          !Number.isFinite(calibratedWeight) || calibratedWeight <= 0 || calibratedWeight > 10) {
        rejected.push({ id, reason: "invalid_weight_or_quality" });
        continue;
      }
      accepted.push({
        id, probability, quality, weight: quality * calibratedWeight,
        dependencyGroups: normalizeDependencyGroups(row, id),
        uncertainty: Number.isFinite(Number(row.uncertainty)) && Number(row.uncertainty) >= 0 && Number(row.uncertainty) <= 0.5
          ? Number(row.uncertainty) : null
      });
    }

    // Connected components prevent indirect overlap from being counted as independent evidence.
    const parent = accepted.map((_, index) => index);
    const find = index => {
      while (parent[index] !== index) {
        parent[index] = parent[parent[index]];
        index = parent[index];
      }
      return index;
    };
    const unite = (a, b) => {
      const rootA = find(a), rootB = find(b);
      if (rootA !== rootB) parent[rootB] = rootA;
    };
    const firstByDependency = new Map();
    accepted.forEach((model, index) => {
      for (const dependency of model.dependencyGroups) {
        if (firstByDependency.has(dependency)) unite(index, firstByDependency.get(dependency));
        else firstByDependency.set(dependency, index);
      }
    });

    const components = new Map();
    accepted.forEach((model, index) => {
      const root = find(index);
      if (!components.has(root)) components.set(root, []);
      components.get(root).push(model);
    });

    const independent = [];
    for (const members of components.values()) {
      const usable = members.filter(member => member.weight > 0);
      if (!usable.length) continue;
      const totalWeight = usable.reduce((sum, member) => sum + member.weight, 0);
      const dependencies = [...new Set(usable.flatMap(member => member.dependencyGroups))].sort();
      independent.push({
        dependencyGroup: dependencies.join(" + "),
        dependencyGroups: dependencies,
        probability: usable.reduce((sum, member) => sum + member.probability * member.weight, 0) / totalWeight,
        // A correlated component contributes its strongest model weight, not the sum.
        weight: Math.max(...usable.map(member => member.weight)),
        modelIds: usable.map(member => member.id),
        uncertainty: usable.every(member => member.uncertainty !== null)
          ? Math.sqrt(usable.reduce((sum, member) => sum + Math.pow(member.uncertainty * member.weight, 2), 0)) / totalWeight
          : null
      });
    }

    if (!independent.length) {
      return { status: "no_data", probability: null, modelCount: 0, independentGroups: 0, disagreement: null,
        dispersion: null, groups: [], rejected };
    }
    const totalWeight = independent.reduce((sum, group) => sum + group.weight, 0);
    const probability = independent.reduce((sum, group) => sum + group.probability * group.weight, 0) / totalWeight;
    const disagreement = Math.max(...independent.map(group => group.probability)) -
      Math.min(...independent.map(group => group.probability));
    const dispersion = Math.sqrt(independent.reduce((sum, group) =>
      sum + group.weight * Math.pow(group.probability - probability, 2), 0) / totalWeight);
    const conflictThreshold = Number.isFinite(Number(options.conflictThreshold))
      ? clamp(Number(options.conflictThreshold), 0.01, 0.5) : 0.15;
    const status = independent.length < 2 ? "provisional" :
      disagreement >= conflictThreshold ? "conflict" : "consensus";
    return {
      status, probability, modelCount: independent.reduce((sum, group) => sum + group.modelIds.length, 0),
      independentGroups: independent.length, disagreement, dispersion,
      groups: independent, rejected,
      note: status === "provisional" ? "Недостаточно независимых моделей для полноценного объединения." :
        status === "conflict" ? "Модели существенно расходятся; требуется проверка причин." :
        "Независимые группы моделей согласуются в пределах заданного порога."
    };
  }

  function createRandom(seed) {
    let state = (Number(seed) >>> 0) || 0x9e3779b9;
    return function () {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function quantile(values, q) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const position = (sorted.length - 1) * q;
    const lower = Math.floor(position), upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  // Monte Carlo stress test: uncertainty is supplied per model in probability points (0..0.5).
  // This is not a point-by-point tennis score simulator and does not create missing match data.
  function runMonteCarlo(predictions, options = {}) {
    const iterations = Number.isInteger(options.iterations) ? clamp(options.iterations, 100, 100000) : 10000;
    const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 20261118;
    const random = createRandom(seed);
    const base = fusePredictions(predictions, options);
    if (base.probability === null) return { ...base, iterations: 0, reason: "no_valid_models" };
    const models = (Array.isArray(predictions) ? predictions : []).filter(row =>
      finiteProbability(row?.probability) !== null &&
      Number.isFinite(Number(row.uncertainty)) && Number(row.uncertainty) >= 0 && Number(row.uncertainty) <= 0.5);
    const hasUncertainty = models.length > 0;
    const forecastSamples = [], outcomeWins = [];
    const gaussian = () => {
      const u1 = Math.max(Number.EPSILON, random()), u2 = random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };
    for (let i = 0; i < iterations; i++) {
      const sampled = (Array.isArray(predictions) ? predictions : []).map(row => {
        const p = finiteProbability(row?.probability);
        if (p === null) return row;
        const sigma = Number.isFinite(Number(row.uncertainty)) ? Number(row.uncertainty) : 0;
        return { ...row, probability: clamp(p + gaussian() * sigma, 0.001, 0.999) };
      });
      const fused = fusePredictions(sampled, options);
      const p = fused.probability === null ? base.probability : fused.probability;
      forecastSamples.push(p);
      outcomeWins.push(random() < p ? 1 : 0);
    }
    const meanForecast = forecastSamples.reduce((sum, value) => sum + value, 0) / iterations;
    const simulatedWinRate = outcomeWins.reduce((sum, value) => sum + value, 0) / iterations;
    return {
      status: base.status, iterations, seed, baseProbability: base.probability,
      meanForecastProbability: meanForecast,
      forecastInterval90: [quantile(forecastSamples, 0.05), quantile(forecastSamples, 0.95)],
      simulatedWinRate, hasUncertaintyInputs: hasUncertainty,
      uncertaintyModelCount: models.length,
      note: hasUncertainty
        ? "Сценарный Monte Carlo по указанной неопределённости моделей; не симуляция розыгрышей или счёта."
        : "Нет оценок неопределённости моделей: рассчитан только разброс исходов при фиксированной вероятности. Интервал прогноза неинформативен."
    };
  }


  const MODEL_REGISTRY = Object.freeze([
    { id: "general-elo-v2", name: "Общий Elo", category: "rating", dependencyGroup: "elo-ratings", dependencyGroups: ["elo-ratings"], status: "active", currentlyIntegrated: true, requires: ["player Elo ratings"] },
    { id: "surface-elo", name: "Elo покрытия", category: "rating", dependencyGroup: "elo-ratings", dependencyGroups: ["elo-ratings"], status: "planned", currentlyIntegrated: false, requires: ["surface-specific player ratings"] },
    { id: "serve-return", name: "Подача и приём", category: "point-model", dependencyGroup: "serve-return-stats", dependencyGroups: ["serve-return-stats"], status: "planned", currentlyIntegrated: false, requires: ["verified serve and return statistics"] },
    { id: "recent-form", name: "Недавняя форма", category: "form", dependencyGroup: "recent-match-results", dependencyGroups: ["recent-match-results", "elo-ratings"], status: "planned", currentlyIntegrated: false, requires: ["timestamped recent match results"] },
    { id: "physical-load", name: "Физическая нагрузка", category: "physical", dependencyGroup: "match-load", dependencyGroups: ["match-load", "recent-match-results"], status: "planned", currentlyIntegrated: false, requires: ["verified match duration and schedule"] },
    { id: "market-consensus", name: "Рыночная оценка", category: "market", dependencyGroup: "bookmaker-market", dependencyGroups: ["bookmaker-market"], status: "planned", currentlyIntegrated: false, requires: ["same-bookmaker two-sided odds"] }
  ]);

  function getModelRegistry() {
    return MODEL_REGISTRY.map(model => ({ ...model, requires: model.requires.slice(), dependencyGroups: model.dependencyGroups.slice() }));
  }

  function scorePredictions(records) {
    const n = records.length;
    if (!n) return { sampleSize: 0, brierScore: null, logLoss: null };
    let brier = 0, logLoss = 0;
    for (const row of records) {
      const p = clamp(row.probability, 1e-6, 1 - 1e-6);
      brier += Math.pow(p - row.outcome, 2);
      logLoss += -(row.outcome * Math.log(p) + (1 - row.outcome) * Math.log(1 - p));
    }
    return { sampleSize: n, brierScore: brier / n, logLoss: logLoss / n };
  }

  function buildModelHistoryRecords(archiveRows) {
    const rows = Array.isArray(archiveRows) ? archiveRows : [];
    const byModelMatch = new Map();
    const rejected = [];
    for (const row of rows) {
      const modelId = typeof row?.model === "string" ? row.model.trim() : "";
      const matchId = String(row?.matchId ?? "").trim();
      const probabilityPercent = Number(row?.probability);
      const capturedAtMs = typeof row?.capturedAt === "number" ? row.capturedAt : Date.parse(row?.capturedAt);
      const matchStartMs = Date.parse(row?.matchDate);
      const resultCheckedAt = Number(row?.resultCheckedAt);
      const winner = Number(row?.resultWinner);
      let reason = null;
      if (!MODEL_REGISTRY.some(model => model.id === modelId)) reason = "unknown_model";
      else if (!matchId || !Number.isSafeInteger(Number(matchId)) || Number(matchId) <= 0) reason = "missing_match_id";
      else if (!Number.isFinite(probabilityPercent) || probabilityPercent <= 0 || probabilityPercent >= 100) reason = "invalid_probability";
      else if (!Number.isFinite(capturedAtMs) || !Number.isFinite(matchStartMs) || capturedAtMs >= matchStartMs) reason = "not_pre_match";
      else if (row?.captureStatus && row.captureStatus !== "upcoming") reason = "not_upcoming_capture";
      else if (row?.resultOutcome !== "completed" || ![1, 2].includes(winner) || !Number.isFinite(resultCheckedAt) || resultCheckedAt <= 0) reason = "result_not_verified";
      else if (!["A", "B"].includes(row?.side) || typeof row?.player !== "string" || !row.player.trim() ||
        typeof row?.opponent !== "string" || !row.opponent.trim() || row.player.trim() === row.opponent.trim()) reason = "invalid_player_identity";
      if (reason) { rejected.push({ modelId: modelId || null, matchId: matchId || null, reason }); continue; }
      const key = modelId + "::" + matchId;
      const record = {
        modelId, matchId, probability: probabilityPercent / 100,
        outcome: (row.side === "A" ? winner === 1 : winner === 2) ? 1 : 0,
        capturedAt: new Date(capturedAtMs).toISOString(),
        matchStart: new Date(matchStartMs).toISOString(),
        resultVerified: true,
        side: row.side,
        playerId: Number.isSafeInteger(Number(row.playerId)) && Number(row.playerId) > 0 ? Number(row.playerId) : null,
        opponentId: Number.isSafeInteger(Number(row.opponentId)) && Number(row.opponentId) > 0 ? Number(row.opponentId) : null,
        modelVersion: typeof row.modelVersion === "string" ? row.modelVersion : null
      };
      const previous = byModelMatch.get(key);
      if (!previous || Date.parse(record.capturedAt) < Date.parse(previous.capturedAt)) byModelMatch.set(key, record);
    }
    return { records: [...byModelMatch.values()].sort((a, b) =>
      a.modelId.localeCompare(b.modelId) || Date.parse(a.capturedAt) - Date.parse(b.capturedAt)),
      rejected };
  }

  function evaluateModelHistory(records, options = {}) {
    const source = Array.isArray(records) ? records : [];
    const minTraining = Number.isInteger(options.minTraining) ? clamp(options.minTraining, 5, 1000) : 30;
    const minValidation = Number.isInteger(options.minValidation) ? clamp(options.minValidation, 5, 1000) : 10;
    const registry = new Map(MODEL_REGISTRY.map(model => [model.id, model]));
    const grouped = new Map(), rejected = [], seen = new Set();
    for (const row of source) {
      const modelId = typeof row?.modelId === "string" ? row.modelId.trim() : "";
      const matchId = String(row?.matchId ?? "").trim();
      const probability = finiteProbability(row?.probability);
      const outcome = row?.outcome;
      const capturedAt = Date.parse(row?.capturedAt);
      const matchStart = Date.parse(row?.matchStart);
      let reason = null;
      if (!registry.has(modelId)) reason = "unknown_model";
      else if (!matchId) reason = "missing_match_id";
      else if (probability === null) reason = "invalid_probability";
      else if (outcome !== 0 && outcome !== 1) reason = "invalid_outcome";
      else if (row?.resultVerified !== true) reason = "unverified_result";
      else if (!Number.isFinite(capturedAt) || !Number.isFinite(matchStart) || capturedAt >= matchStart) reason = "not_pre_match";
      const key = modelId + "::" + matchId;
      if (!reason && seen.has(key)) reason = "duplicate_match_model";
      if (reason) { rejected.push({ modelId: modelId || null, matchId: matchId || null, reason }); continue; }
      seen.add(key);
      if (!grouped.has(modelId)) grouped.set(modelId, []);
      grouped.get(modelId).push({ probability, outcome, capturedAt, matchId });
    }
    const models = [];
    for (const model of MODEL_REGISTRY) {
      const rows = (grouped.get(model.id) || []).sort((a, b) => a.capturedAt - b.capturedAt || a.matchId.localeCompare(b.matchId));
      if (!rows.length) continue;
      const splitAt = Math.floor(rows.length * 0.7);
      const training = rows.slice(0, splitAt), validation = rows.slice(splitAt);
      const trainingScore = scorePredictions(training), validationScore = scorePredictions(validation);
      const enoughData = training.length >= minTraining && validation.length >= minValidation;
      const rawWeight = trainingScore.brierScore === null ? 1 : clamp(1 + (0.25 - trainingScore.brierScore) * 8, 0.5, 1.5);
      const shrinkage = enoughData ? training.length / (training.length + 30) : 0;
      models.push({
        modelId: model.id, name: model.name, dependencyGroup: model.dependencyGroup,
        training: trainingScore, validation: validationScore,
        calibratedWeight: enoughData ? 1 + (rawWeight - 1) * shrinkage : 1,
        rawWeight: enoughData ? rawWeight : null,
        status: enoughData ? "validated" : "insufficient_sample",
        trainingShare: 0.7
      });
    }
    return {
      status: models.some(model => model.status === "validated") ? "evaluated" : "insufficient_data",
      split: "chronological_70_30", minTraining, minValidation, models, rejected,
      note: "Вес рассчитан по ранней обучающей части; поздняя часть используется только для отдельной проверки. При малой выборке вес остаётся нейтральным."
    };
  }

  return { fusePredictions, runMonteCarlo, getModelRegistry, buildModelHistoryRecords, evaluateModelHistory };
});
