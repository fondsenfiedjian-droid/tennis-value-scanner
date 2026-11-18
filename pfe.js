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

  // Exact probability of holding a standard advantage-scoring service game from point-win probability.
  function calculateHoldProbability(pointWinProbability) {
    const p = Number(pointWinProbability);
    if (!Number.isFinite(p) || p < 0 || p > 1) return null;
    const q = 1 - p;
    const beforeDeuce = Math.pow(p, 4) * (1 + 4 * q + 10 * q * q);
    const reachDeuce = 20 * Math.pow(p, 3) * Math.pow(q, 3);
    const winFromDeuce = (p === 0 && q === 0) ? 0.5 : (p * p) / (p * p + q * q || 1);
    return clamp(beforeDeuce + reachDeuce * winFromDeuce, 0, 1);
  }

  function calculateTiebreakWinProbability(pointWinA, pointWinB, firstServerA = true) {
    const pA = Number(pointWinA), pB = Number(pointWinB);
    if (![pA, pB].every(value => Number.isFinite(value) && value >= 0 && value <= 1) ||
        typeof firstServerA !== "boolean") return null;
    const pointProbability = pointIndex => {
      const phase = pointIndex % 4;
      const serverA = phase === 0 || phase === 3 ? firstServerA : !firstServerA;
      return serverA ? pA : 1 - pB;
    };
    const deuce = phase => {
      const x1 = pointProbability(phase), x2 = pointProbability(phase + 1);
      const winBoth = x1 * x2;
      const loseBoth = (1 - x1) * (1 - x2);
      const split = x1 * (1 - x2) + (1 - x1) * x2;
      return { winBoth, split, loseBoth };
    };
    const d0 = deuce(0), d2 = deuce(2);
    const denominator = 1 - d0.split * d2.split;
    const deuce0 = denominator > 0
      ? (d0.winBoth + d0.split * d2.winBoth) / denominator
      : 0.5;
    const deuce2 = d2.winBoth + d2.split * deuce0;
    const memo = new Map();
    const solve = (a, b) => {
      if (a >= 7 && a - b >= 2) return 1;
      if (b >= 7 && b - a >= 2) return 0;
      const nextPoint = a + b;
      if (a === b && a >= 6) return nextPoint % 4 === 0 ? deuce0 : deuce2;
      const key = a + ":" + b;
      if (memo.has(key)) return memo.get(key);
      const probability = pointProbability(nextPoint);
      const result = probability * solve(a + 1, b) + (1 - probability) * solve(a, b + 1);
      memo.set(key, result);
      return result;
    };
    return clamp(solve(0, 0), 0, 1);
  }

  function calculateSetWinOutcomes(pointWinA, pointWinB, firstServerA) {
    const holdA = calculateHoldProbability(pointWinA);
    const holdB = calculateHoldProbability(pointWinB);
    const tiebreakA = calculateTiebreakWinProbability(pointWinA, pointWinB, firstServerA);
    const memo = new Map();
    const solve = (gamesA, gamesB) => {
      if (gamesA >= 6 && gamesA - gamesB >= 2) return { aRegular: 1, bRegular: 0, aTiebreak: 0, bTiebreak: 0 };
      if (gamesB >= 6 && gamesB - gamesA >= 2) return { aRegular: 0, bRegular: 1, aTiebreak: 0, bTiebreak: 0 };
      if (gamesA === 6 && gamesB === 6) return { aRegular: 0, bRegular: 0, aTiebreak: tiebreakA, bTiebreak: 1 - tiebreakA };
      const key = gamesA + ":" + gamesB;
      if (memo.has(key)) return memo.get(key);
      const serverA = (gamesA + gamesB) % 2 === 0 ? firstServerA : !firstServerA;
      const gameWinA = serverA ? holdA : 1 - holdB;
      const won = solve(gamesA + 1, gamesB), lost = solve(gamesA, gamesB + 1);
      const result = {};
      for (const field of ["aRegular", "bRegular", "aTiebreak", "bTiebreak"]) {
        result[field] = gameWinA * won[field] + (1 - gameWinA) * lost[field];
      }
      memo.set(key, result);
      return result;
    };
    return solve(0, 0);
  }

  function calculateSetWinProbability(pointWinA, pointWinB, firstServerA = true) {
    const pA = Number(pointWinA), pB = Number(pointWinB);
    if (![pA, pB].every(value => Number.isFinite(value) && value >= 0 && value <= 1) ||
        typeof firstServerA !== "boolean") return null;
    const holdA = calculateHoldProbability(pA);
    const holdB = calculateHoldProbability(pB);
    const tiebreak = calculateTiebreakWinProbability(pA, pB, firstServerA);
    const memo = new Map();
    const solve = (gamesA, gamesB) => {
      if (gamesA >= 6 && gamesA - gamesB >= 2) return 1;
      if (gamesB >= 6 && gamesB - gamesA >= 2) return 0;
      if (gamesA === 6 && gamesB === 6) return tiebreak;
      const totalGames = gamesA + gamesB;
      const serverA = totalGames % 2 === 0 ? firstServerA : !firstServerA;
      const gameWinA = serverA ? holdA : 1 - holdB;
      const key = gamesA + ":" + gamesB;
      if (memo.has(key)) return memo.get(key);
      const result = gameWinA * solve(gamesA + 1, gamesB) + (1 - gameWinA) * solve(gamesA, gamesB + 1);
      memo.set(key, result);
      return result;
    };
    return clamp(solve(0, 0), 0, 1);
  }

  function calculateMatchWinProbability(pointWinA, pointWinB, options = {}) {
    const pA = Number(pointWinA), pB = Number(pointWinB);
    const bestOf = options.bestOf === undefined ? 3 : Number(options.bestOf);
    if (![3, 5].includes(bestOf)) return { status: "invalid", probabilityA: null, reason: "unsupported_match_format" };
    if (![pA, pB].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      return { status: "invalid", probabilityA: null, reason: "invalid_point_probabilities" };
    }
    const outcomes = [true, false].map(firstServerA => calculateSetWinOutcomes(pA, pB, firstServerA));
    const setsToWin = bestOf === 3 ? 2 : 3;
    const memo = new Map();
    const solve = (setsA, setsB, firstServerA) => {
      if (setsA >= setsToWin) return 1;
      if (setsB >= setsToWin) return 0;
      const key = setsA + ":" + setsB + ":" + (firstServerA ? "A" : "B");
      if (memo.has(key)) return memo.get(key);
      const set = outcomes[firstServerA ? 0 : 1];
      const result =
        set.aRegular * solve(setsA + 1, setsB, firstServerA) +
        set.bRegular * solve(setsA, setsB + 1, firstServerA) +
        set.aTiebreak * solve(setsA + 1, setsB, !firstServerA) +
        set.bTiebreak * solve(setsA, setsB + 1, !firstServerA);
      memo.set(key, result);
      return result;
    };
    const probabilityStartingA = solve(0, 0, true);
    const probabilityStartingB = solve(0, 0, false);
    const setProbabilityA = (outcomes[0].aRegular + outcomes[0].aTiebreak +
      outcomes[1].aRegular + outcomes[1].aTiebreak) / 2;
    return {
      status: "provisional",
      probabilityA: clamp((probabilityStartingA + probabilityStartingB) / 2, 0, 1),
      setProbabilityA, bestOf, setsToWin,
      firstServerProbabilities: { startA: probabilityStartingA, startB: probabilityStartingB },
      assumptions: ["standard_advantage_scoring", "tiebreak_at_6_all", "service_order_continues_between_sets", "randomized_initial_server", "no_fatigue_or_injury_adjustment"],
      note: "Расчёт учитывает переход подачи между сетами, включая правило приёма после тай-брейка. Не учитывает усталость, травмы, смену условий и изменение вероятностей по ходу матча."
    };
  }

  function createRandom(seed) {
    let state = (Number(seed) >>> 0) || 0x9e3779b9;
    return function () {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function simulateServiceGame(pointWinA, pointWinB, serverA, random) {
    let pointsA = 0, pointsB = 0;
    while (true) {
      const probabilityA = serverA ? pointWinA : 1 - pointWinB;
      if (random() < probabilityA) pointsA++;
      else pointsB++;
      if ((pointsA >= 4 || pointsB >= 4) && Math.abs(pointsA - pointsB) >= 2) return pointsA > pointsB;
    }
  }

  function simulateTiebreak(pointWinA, pointWinB, firstServerA, random) {
    let pointsA = 0, pointsB = 0, pointIndex = 0;
    while (true) {
      const serverA = pointIndex === 0
        ? firstServerA
        : Math.floor((pointIndex - 1) / 2) % 2 === 0 ? !firstServerA : firstServerA;
      const probabilityA = serverA ? pointWinA : 1 - pointWinB;
      if (random() < probabilityA) pointsA++;
      else pointsB++;
      pointIndex++;
      if ((pointsA >= 7 || pointsB >= 7) && Math.abs(pointsA - pointsB) >= 2) return pointsA > pointsB;
    }
  }

  function simulateSet(pointWinA, pointWinB, firstServerA, random) {
    let gamesA = 0, gamesB = 0, serverA = firstServerA;
    while (true) {
      if (gamesA === 6 && gamesB === 6) {
        const firstTiebreakServerA = serverA;
        const winnerA = simulateTiebreak(pointWinA, pointWinB, firstTiebreakServerA, random);
        if (winnerA) gamesA++;
        else gamesB++;
        return {
          winnerA, gamesA, gamesB, totalGames: gamesA + gamesB,
          nextSetFirstServerA: !firstTiebreakServerA, tiebreak: true
        };
      }
      const winnerA = simulateServiceGame(pointWinA, pointWinB, serverA, random);
      if (winnerA) gamesA++;
      else gamesB++;
      serverA = !serverA;
      if ((gamesA >= 6 || gamesB >= 6) && Math.abs(gamesA - gamesB) >= 2) {
        return {
          winnerA: gamesA > gamesB, gamesA, gamesB, totalGames: gamesA + gamesB,
          nextSetFirstServerA: (gamesA + gamesB) % 2 === 0 ? firstServerA : !firstServerA,
          tiebreak: false
        };
      }
    }
  }

  // Point-by-point Monte Carlo with standard advantage games and a 7-point tiebreak at 6-6.
  // It is a scenario model, not a live score feed or an automatically trusted match probability.
  function runMatchMonteCarlo(pointWinA, pointWinB, options = {}) {
    const pA = Number(pointWinA), pB = Number(pointWinB);
    const bestOf = options.bestOf === undefined ? 3 : Number(options.bestOf);
    if (![pA, pB].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      return { status: "invalid", reason: "invalid_point_probabilities", iterations: 0 };
    }
    if (![3, 5].includes(bestOf)) {
      return { status: "invalid", reason: "unsupported_match_format", iterations: 0 };
    }
    const iterations = Number.isInteger(options.iterations) ? clamp(options.iterations, 100, 100000) : 10000;
    const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 20261118;
    const random = createRandom(seed);
    const setsToWin = bestOf === 3 ? 2 : 3;
    let winsA = 0, totalGames = 0, totalSets = 0;
    const scorelines = new Map();
    for (let i = 0; i < iterations; i++) {
      let setsA = 0, setsB = 0, firstServerA = random() < 0.5, games = 0;
      const setScores = [];
      while (setsA < setsToWin && setsB < setsToWin) {
        const set = simulateSet(pA, pB, firstServerA, random);
        if (set.winnerA) setsA++;
        else setsB++;
        games += set.totalGames;
        setScores.push(set.gamesA + "-" + set.gamesB);
        firstServerA = set.nextSetFirstServerA;
      }
      if (setsA > setsB) winsA++;
      totalGames += games;
      totalSets += setsA + setsB;
      const key = setsA + "-" + setsB + " (" + setScores.join(", ") + ")";
      scorelines.set(key, (scorelines.get(key) || 0) + 1);
    }
    const probabilityA = winsA / iterations;
    const z = 1.96, denominator = 1 + z * z / iterations;
    const center = (probabilityA + z * z / (2 * iterations)) / denominator;
    const margin = z * Math.sqrt(probabilityA * (1 - probabilityA) / iterations +
      z * z / (4 * iterations * iterations)) / denominator;
    const topScorelines = [...scorelines.entries()]
      .map(([score, count]) => ({ score, count, probability: count / iterations }))
      .sort((a, b) => b.count - a.count || a.score.localeCompare(b.score))
      .slice(0, 8);
    return {
      status: "scenario",
      iterations, seed, bestOf, setsToWin,
      probabilityA, probabilityB: 1 - probabilityA,
      confidenceInterval95A: [Math.max(0, center - margin), Math.min(1, center + margin)],
      averageTotalGames: totalGames / iterations,
      averageSets: totalSets / iterations,
      topScorelines,
      assumptions: ["constant_point_probabilities", "standard_advantage_scoring", "7_point_tiebreak_at_6_all", "alternating_service_order", "no_fatigue_or_injury_adjustment"],
      note: "Симуляция розыгрышей при постоянных вероятностях очка на подаче. Результат сценарный и не заменяет проверенную модель матча."
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
    { id: "market-consensus", name: "Рыночная оценка", category: "market", dependencyGroup: "bookmaker-market", dependencyGroups: ["bookmaker-market"], status: "active", currentlyIntegrated: true, requires: ["fresh same-bookmaker two-sided odds"] }
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

  function normalizeServeReturnProfile(payload, options = {}) {
    const minMatches = Number.isInteger(options.minMatches) ? clamp(options.minMatches, 1, 1000) : 8;
    const root = payload && typeof payload === "object" ? payload : null;
    const data = root && root.serve_return && typeof root.serve_return === "object"
      ? root.serve_return : root;
    if (!data || typeof data !== "object" ||
        (!Object.prototype.hasOwnProperty.call(data, "serve") && !Object.prototype.hasOwnProperty.call(data, "return"))) {
      return { status: "unavailable", reason: "serve_return_requires_ultra", matches: 0, matchesWithStats: 0, metrics: {}, availableMetrics: 0 };
    }
    const nonNegativeInteger = value =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
    const ratio = value => {
      if (!value || typeof value !== "object") return null;
      const numerator = nonNegativeInteger(value.numerator);
      const denominator = nonNegativeInteger(value.denominator);
      const matches = nonNegativeInteger(value.matches);
      const providerPct = typeof value.pct === "number" && Number.isFinite(value.pct) && value.pct >= 0 && value.pct <= 100
        ? value.pct : null;
      if (numerator === null || denominator === null || denominator <= 0 || numerator > denominator ||
          matches === null || providerPct === null) return null;
      const calculatedPct = numerator / denominator * 100;
      if (Math.abs(calculatedPct - providerPct) > 0.2) return null;
      return { numerator, denominator, matches, pct: calculatedPct, providerPct };
    };
    const matches = nonNegativeInteger(data.matches);
    const matchesWithStats = nonNegativeInteger(data.matches_with_stats);
    const matchesIncomplete = nonNegativeInteger(data.matches_incomplete);
    if (matches === null || matchesWithStats === null || matchesIncomplete === null ||
        matchesWithStats > matches || matchesIncomplete > matches) {
      return { status: "invalid", reason: "invalid_sample_counts", matches: null, matchesWithStats: null, metrics: {}, availableMetrics: 0 };
    }
    const definitions = {
      firstServeIn: ["serve", "first_serve_in"],
      firstServePointsWon: ["serve", "first_serve_points_won"],
      secondServePointsWon: ["serve", "second_serve_points_won"],
      serviceGamesWon: ["serve", "service_games_won"],
      breakPointsSaved: ["serve", "break_points_saved"],
      firstServeReturnPointsWon: ["return", "first_serve_return_points_won"],
      secondServeReturnPointsWon: ["return", "second_serve_return_points_won"],
      returnGamesWon: ["return", "return_games_won"],
      breakPointsConverted: ["return", "break_points_converted"]
    };
    const metrics = {};
    for (const [name, [family, field]] of Object.entries(definitions)) {
      const normalized = ratio(data?.[family]?.[field]);
      if (normalized) metrics[name] = normalized;
    }
    const required = ["firstServePointsWon", "secondServePointsWon", "serviceGamesWon",
      "firstServeReturnPointsWon", "secondServeReturnPointsWon", "returnGamesWon"];
    const requiredPresent = required.every(name => Boolean(metrics[name]));
    const requiredSampleReady = requiredPresent && required.every(name => metrics[name].matches >= minMatches);
    const ready = requiredSampleReady;
    const insufficientMetricSample = requiredPresent && !requiredSampleReady;
    const status = matchesWithStats < minMatches || insufficientMetricSample
      ? "insufficient_sample" : ready ? "ready_for_modeling" : "partial";
    return {
      status, reason: status === "insufficient_sample"
        ? insufficientMetricSample ? "insufficient_metric_sample" : "insufficient_match_sample"
        : status === "partial" ? "required_serve_return_metrics_missing" : null,
      matches, matchesWithStats, matchesIncomplete, availableMetrics: Object.keys(metrics).length,
      requiredMetrics: required.length, minMatches, metrics,
      source: "Live Tennis API PlayerServeReturn",
      note: "Нормализованные агрегаты ULTRA; сами по себе не являются вероятностью победы."
    };
  }

  function normalizeRecentFormProfile(payload, options = {}) {
    const minMatches = Number.isInteger(options.minMatches) ? clamp(options.minMatches, 1, 100) : 5;
    const maxAgeDays = Number.isFinite(Number(options.maxAgeDays)) ? clamp(Number(options.maxAgeDays), 7, 365) : 180;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const root = payload && typeof payload === "object" ? payload : null;
    const playerId = Number(root?.player?.id);
    const recent = root?.records?.recent;
    if (!Number.isSafeInteger(playerId) || playerId <= 0 || !Array.isArray(recent)) {
      return { status: "unavailable", reason: "player_stats_recent_unavailable", playerId: null, sampleSize: 0, records: [], bySurface: {} };
    }
    if (options.playerId !== undefined && Number(options.playerId) !== playerId) {
      return { status: "invalid", reason: "player_identity_mismatch", playerId, sampleSize: 0, records: [], bySurface: {} };
    }
    const seen = new Set();
    const records = [];
    const excluded = { invalid: 0, duplicate: 0, non_completed: 0, outside_window: 0 };
    for (const row of recent) {
      const matchId = Number(row?.match_id);
      const date = typeof row?.date === "string" ? Date.parse(row.date) : NaN;
      if (!Number.isSafeInteger(matchId) || matchId <= 0 || !Number.isFinite(date) ||
          typeof row?.won !== "boolean" || typeof row?.outcome !== "string") {
        excluded.invalid++;
        continue;
      }
      if (seen.has(matchId)) { excluded.duplicate++; continue; }
      seen.add(matchId);
      if (row.outcome !== "completed") { excluded.non_completed++; continue; }
      const ageDays = (now - date) / 86400000;
      if (ageDays < 0 || ageDays > maxAgeDays) { excluded.outside_window++; continue; }
      const surface = ["hard", "clay", "grass"].includes(String(row.surface || "").toLowerCase())
        ? String(row.surface).toLowerCase() : "unknown";
      records.push({
        matchId, date: new Date(date).toISOString(), won: row.won,
        ageDays, surface,
        level: ["atp", "wta", "challenger", "itf", "juniors"].includes(String(row.level || "").toLowerCase())
          ? String(row.level).toLowerCase() : "unknown"
      });
    }
    records.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const weighted = records.reduce((acc, row) => {
      const weight = Math.pow(0.5, row.ageDays / 30);
      acc.weight += weight;
      acc.wins += row.won ? weight : 0;
      return acc;
    }, { wins: 0, weight: 0 });
    const bySurface = {};
    for (const surface of ["hard", "clay", "grass", "unknown"]) {
      const rows = records.filter(row => row.surface === surface);
      if (rows.length) bySurface[surface] = {
        matches: rows.length, wins: rows.filter(row => row.won).length,
        winRate: rows.filter(row => row.won).length / rows.length
      };
    }
    const status = records.length >= minMatches ? "ready_for_modeling" : "insufficient_sample";
    return {
      status, reason: status === "insufficient_sample" ? "insufficient_recent_completed_matches" : null,
      playerId, sampleSize: records.length, wins: records.filter(row => row.won).length,
      losses: records.filter(row => !row.won).length,
      winRate: records.length ? records.filter(row => row.won).length / records.length : null,
      recencyWeightedWinRate: weighted.weight ? weighted.wins / weighted.weight : null,
      halfLifeDays: 30, maxAgeDays, minMatches, records, bySurface, excluded,
      source: "Live Tennis API PlayerStats.records.recent",
      note: "Только завершённые матчи; травмы, снятия, walkover и матчи вне окна исключены. Это характеристика формы, не вероятность победы."
    };
  }

  function deriveServeReturnMatchInputs(profileA, profileB, options = {}) {
    const maxDisagreement = Number.isFinite(Number(options.maxDisagreement))
      ? clamp(Number(options.maxDisagreement), 0.01, 0.3) : 0.08;
    if (!profileA || !profileB || profileA.status !== "ready_for_modeling" || profileB.status !== "ready_for_modeling") {
      return { status: "insufficient_data", playerA: null, playerB: null, reason: "both_profiles_must_be_ready" };
    }
    if (!Number.isSafeInteger(profileA.playerId) || !Number.isSafeInteger(profileB.playerId) || profileA.playerId === profileB.playerId) {
      return { status: "invalid", playerA: null, playerB: null, reason: "player_identity_mismatch" };
    }
    const pointWin = (serving, returning) => {
      const firstIn = serving?.firstServeIn?.pct;
      const firstWon = serving?.firstServePointsWon?.pct;
      const secondWon = serving?.secondServePointsWon?.pct;
      const returnFirstWon = returning?.firstServeReturnPointsWon?.pct;
      const returnSecondWon = returning?.secondServeReturnPointsWon?.pct;
      const values = [firstIn, firstWon, secondWon, returnFirstWon, returnSecondWon];
      if (!values.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100)) return null;
      const firstShare = firstIn / 100;
      const direct = firstShare * (firstWon / 100) + (1 - firstShare) * (secondWon / 100);
      const opponentReturnCrossCheck = firstShare * (1 - returnFirstWon / 100) +
        (1 - firstShare) * (1 - returnSecondWon / 100);
      const disagreement = Math.abs(direct - opponentReturnCrossCheck);
      return {
        directServeEstimate: direct,
        opponentReturnCrossCheck,
        disagreement,
        servicePointWin: disagreement <= maxDisagreement ? (direct + opponentReturnCrossCheck) / 2 : null
      };
    };
    const a = pointWin(profileA.metrics, profileB.metrics);
    const b = pointWin(profileB.metrics, profileA.metrics);
    if (!a || !b) return { status: "insufficient_data", playerA: null, playerB: null, reason: "required_point_metrics_missing" };
    const status = a.disagreement > maxDisagreement || b.disagreement > maxDisagreement ? "review" : "ready_for_score_simulation";
    return {
      status,
      playerA: { playerId: profileA.playerId, ...a },
      playerB: { playerId: profileB.playerId, ...b },
      maxDisagreement,
      note: status === "review"
        ? "Собственные показатели подачи и показатели приёма соперника расходятся; входы нельзя использовать без проверки."
        : "Подготовлены оценки вероятности выигрыша очка на своей подаче. Это ещё не вероятность победы в матче."
    };
  }

  function buildMarketHistoryRecords(archiveRows) {
    const rows = Array.isArray(archiveRows) ? archiveRows : [];
    const byMatch = new Map();
    const rejected = [];
    const parseTime = value => typeof value === "number" ? value : Date.parse(value);
    const normalizeName = value => typeof value === "string"
      ? value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
      : "";
    for (const row of rows) {
      const matchId = String(row?.matchId ?? "").trim();
      const bookmaker = typeof row?.bookmaker === "string" ? row.bookmaker.trim() : "";
      const side = row?.side;
      const odds = Number(row?.odds);
      const capturedAt = parseTime(row?.capturedAt);
      const matchStart = Date.parse(row?.matchDate);
      if (!matchId || !Number.isSafeInteger(Number(matchId)) || Number(matchId) <= 0 ||
          !bookmaker || !["A", "B"].includes(side) || !Number.isFinite(odds) || odds <= 1 ||
          !Number.isFinite(capturedAt) || !Number.isFinite(matchStart) || capturedAt >= matchStart ||
          (row?.captureStatus && row.captureStatus !== "upcoming")) continue;
      if (!byMatch.has(matchId)) byMatch.set(matchId, new Map());
      const providers = byMatch.get(matchId);
      const providerKey = bookmaker.toLocaleLowerCase();
      if (!providers.has(providerKey)) providers.set(providerKey, { bookmaker, quotes: new Map() });
      const provider = providers.get(providerKey);
      const timestampKey = String(capturedAt);
      if (!provider.quotes.has(timestampKey)) provider.quotes.set(timestampKey, { capturedAt, A: [], B: [] });
      provider.quotes.get(timestampKey)[side].push(row);
    }

    const records = [];
    for (const [matchId, providers] of byMatch) {
      const providerProbabilities = [];
      const providerNames = [];
      let latestCapture = 0, earliestMatchStart = Infinity, selectedIdentity = null, selectedResult = null, rejectionReason = null;
      for (const provider of providers.values()) {
        const timestamps = [...provider.quotes.values()].sort((a, b) => b.capturedAt - a.capturedAt);
        let selected = null;
        for (const quote of timestamps) {
          if (!quote.A.length || !quote.B.length) continue;
          const oddsA = [...new Set(quote.A.map(row => Number(row.odds)))];
          const oddsB = [...new Set(quote.B.map(row => Number(row.odds)))];
          if (oddsA.length !== 1 || oddsB.length !== 1) {
            rejectionReason = "ambiguous_same_time_quote";
            selected = null;
            break;
          }
          const rowA = quote.A[0], rowB = quote.B[0];
          const identityA = [normalizeName(rowA.player), normalizeName(rowA.opponent)];
          const identityB = [normalizeName(rowB.opponent), normalizeName(rowB.player)];
          if (!identityA[0] || !identityA[1] || identityA[0] === identityA[1] ||
              identityA[0] !== identityB[0] || identityA[1] !== identityB[1]) {
            rejectionReason = "player_identity_mismatch";
            selected = null;
            break;
          }
          if (rowA.resultOutcome !== "completed" || rowB.resultOutcome !== "completed" ||
              ![1, 2].includes(Number(rowA.resultWinner)) ||
              Number(rowA.resultWinner) !== Number(rowB.resultWinner) ||
              !Number.isFinite(Number(rowA.resultCheckedAt)) || Number(rowA.resultCheckedAt) <= 0 ||
              !Number.isFinite(Number(rowB.resultCheckedAt)) || Number(rowB.resultCheckedAt) <= 0) {
            rejectionReason = "result_not_verified";
            selected = null;
            break;
          }
          if (selectedIdentity && (selectedIdentity[0] !== identityA[0] || selectedIdentity[1] !== identityA[1])) {
            rejectionReason = "cross_bookmaker_identity_mismatch";
            selected = null;
            break;
          }
          const impliedA = 1 / oddsA[0], impliedB = 1 / oddsB[0];
          const probabilityA = impliedA / (impliedA + impliedB);
          if (!Number.isFinite(probabilityA) || probabilityA <= 0 || probabilityA >= 1) {
            rejectionReason = "invalid_market_probability";
            selected = null;
            break;
          }
          selected = {
            probabilityA, capturedAt: quote.capturedAt,
            matchStart: Date.parse(rowA.matchDate),
            winner: Number(rowA.resultWinner),
            identity: identityA
          };
          break;
        }
        if (!selected) continue;
        selectedIdentity ||= selected.identity;
        if (selectedResult && selectedResult.winner !== selected.winner) {
          rejectionReason = "conflicting_verified_result";
          providerProbabilities.length = 0;
          break;
        }
        selectedResult ||= selected;
        providerProbabilities.push(selected.probabilityA);
        providerNames.push(provider.bookmaker);
        latestCapture = Math.max(latestCapture, selected.capturedAt);
        earliestMatchStart = Math.min(earliestMatchStart, selected.matchStart);
      }
      if (latestCapture >= earliestMatchStart) {
        rejected.push({ matchId, reason: "post_start_capture" });
        continue;
      }
      if (!providerProbabilities.length || !selectedResult) {
        rejected.push({ matchId, reason: rejectionReason || "no_complete_same_bookmaker_pair" });
        continue;
      }
      const sorted = providerProbabilities.slice().sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const probability = sorted.length % 2
        ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      records.push({
        modelId: "market-consensus", matchId, probability,
        outcome: selectedResult.winner === 1 ? 1 : 0,
        capturedAt: new Date(latestCapture).toISOString(),
        matchStart: new Date(earliestMatchStart).toISOString(),
        resultVerified: true, bookmakerCount: providerProbabilities.length,
        bookmakers: providerNames
      });
    }
    return {
      records: records.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) || a.matchId.localeCompare(b.matchId)),
      rejected
    };
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

  return { fusePredictions, runMonteCarlo, getModelRegistry, normalizeServeReturnProfile, normalizeRecentFormProfile, deriveServeReturnMatchInputs, calculateHoldProbability, calculateTiebreakWinProbability, calculateSetWinProbability, calculateMatchWinProbability, runMatchMonteCarlo, buildModelHistoryRecords, buildMarketHistoryRecords, evaluateModelHistory };
});
