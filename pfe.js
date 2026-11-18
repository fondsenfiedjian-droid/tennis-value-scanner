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

  function fusePredictions(predictions, options = {}) {
    const rows = Array.isArray(predictions) ? predictions : [];
    const groups = new Map();
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
      const dependencyGroup = typeof row.dependencyGroup === "string" && row.dependencyGroup.trim()
        ? row.dependencyGroup.trim() : id;
      const quality = row.quality === undefined ? 1 : Number(row.quality);
      const calibratedWeight = row.calibratedWeight === undefined ? 1 : Number(row.calibratedWeight);
      if (!Number.isFinite(quality) || quality < 0 || quality > 1 ||
          !Number.isFinite(calibratedWeight) || calibratedWeight <= 0 || calibratedWeight > 10) {
        rejected.push({ id, reason: "invalid_weight_or_quality" });
        continue;
      }
      const weight = quality * calibratedWeight;
      if (!groups.has(dependencyGroup)) groups.set(dependencyGroup, []);
      groups.get(dependencyGroup).push({
        id, probability, weight, quality,
        uncertainty: Number.isFinite(Number(row.uncertainty)) && Number(row.uncertainty) >= 0 && Number(row.uncertainty) <= 0.5
          ? Number(row.uncertainty) : null
      });
    }

    const independent = [];
    for (const [dependencyGroup, members] of groups) {
      const usable = members.filter(member => member.weight > 0);
      if (!usable.length) continue;
      const totalWeight = usable.reduce((sum, member) => sum + member.weight, 0);
      independent.push({
        dependencyGroup,
        probability: usable.reduce((sum, member) => sum + member.probability * member.weight, 0) / totalWeight,
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

  return { fusePredictions, runMonteCarlo };
});
