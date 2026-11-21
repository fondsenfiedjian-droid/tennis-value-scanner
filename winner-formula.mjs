/**
 * Pairwise winner probability from a trained, walk-forward research model.
 * All features are A-minus-B differences. Unknown workload is neutral and
 * explicitly flagged; this function never fabricates medical or motivation data.
 */
const clamp = value => Math.min(1 - 1e-9, Math.max(1e-9, value));
const sigmoid = value => value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));
const logit = value => Math.log(clamp(value) / (1 - clamp(value)));

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function workloadFeatures(playerA, playerB) {
  const a = playerA?.workload ?? {};
  const b = playerB?.workload ?? {};
  const fields = ["matches3", "matches7", "playingDays7", "restDays", "minutes7", "durationCoverage7"];
  const result = {};
  for (const field of fields) {
    const av = finite(a[field]), bv = finite(b[field]);
    result[field] = av !== null && bv !== null ? av - bv : 0;
  }
  const knownA = finite(a.priorMatchRecords7) ?? 0;
  const knownB = finite(b.priorMatchRecords7) ?? 0;
  result.workloadAvailable = knownA + knownB > 0 ? 1 : 0;
  return result;
}

/**
 * @param {{playerA: object, playerB: object, baseProbabilityA: number, model: object}} input
 * @returns {{probabilityA:number, probabilityB:number, predictedWinner:"A"|"B", features:object, workloadAvailable:boolean}}
 */
export function predictMatchWinner({ playerA, playerB, baseProbabilityA, model }) {
  if (!playerA || !playerB || !model || !Array.isArray(model.featureNames) ||
      !Array.isArray(model.means) || !Array.isArray(model.scales) ||
      !Array.isArray(model.coefficients) ||
      model.coefficients.length !== model.featureNames.length + 1 ||
      model.means.length !== model.featureNames.length ||
      model.scales.length !== model.featureNames.length) {
    throw new TypeError("Two player profiles and a compatible trained model are required");
  }
  if (!Number.isFinite(baseProbabilityA) || baseProbabilityA <= 0 || baseProbabilityA >= 1) {
    throw new RangeError("baseProbabilityA must be between 0 and 1");
  }
  const features = {
    baseLogit: logit(baseProbabilityA),
    ...workloadFeatures(playerA, playerB)
  };
  let z = model.coefficients[0];
  for (let i = 0; i < model.featureNames.length; i++) {
    const name = model.featureNames[i];
    const value = features[name];
    if (!Number.isFinite(value)) throw new TypeError("Missing model feature: " + name);
    z += model.coefficients[i + 1] * ((value - model.means[i]) / model.scales[i]);
  }
  const probabilityA = clamp(sigmoid(z));
  return {
    probabilityA,
    probabilityB: 1 - probabilityA,
    predictedWinner: probabilityA >= 0.5 ? "A" : "B",
    features,
    workloadAvailable: features.workloadAvailable === 1
  };
}
