#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export function parseCsv(text, { delimiter = "," } = {}) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], field = "", quoted = false, closedQuote = false, line = 1;
  const pushField = () => { row.push(field); field = ""; closedQuote = false; };
  const pushRow = () => {
    pushField();
    if (row.some(value => value !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closedQuote = true; }
      else { field += ch; if (ch === "\n") line++; }
      continue;
    }
    if (closedQuote && ch !== delimiter && ch !== "\n" && ch !== "\r") {
      throw new SyntaxError(`Unexpected character after closing quote on line ${line}`);
    }
    if (ch === '"') {
      if (field.length !== 0 || closedQuote) throw new SyntaxError(`Unexpected quote in unquoted field on line ${line}`);
      quoted = true;
    } else if (ch === delimiter) pushField();
    else if (ch === "\n") { pushRow(); line++; }
    else if (ch === "\r" && text[i + 1] === "\n") { /* CRLF handled by newline */ }
    else if (ch === "\r") field += ch;
    else field += ch;
  }
  if (quoted) throw new SyntaxError(`Unterminated quoted field at end of line ${line}`);
  if (field !== "" || row.length || closedQuote) pushRow();
  if (!rows.length) return [];
  const headers = rows.shift();
  if (headers.some(header => header === "")) throw new SyntaxError("CSV contains an empty header");
  if (new Set(headers).size !== headers.length) throw new SyntaxError("CSV contains duplicate headers");
  return rows.map((values, index) => {
    if (values.length > headers.length) throw new SyntaxError(`CSV row ${index + 2} has more fields than the header`);
    return Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ""]));
  });
}

const sigmoid = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
const validId = value => /^\d+$/.test(String(value ?? "")) && Number(value) > 0;
const dateKey = value => {
  const raw = String(value ?? "");
  if (!/^\d{8}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4)), month = Number(raw.slice(4, 6)), day = Number(raw.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? raw : null;
};
const pairKey = (a, b) => Number(a) < Number(b) ? a + ":" + b : b + ":" + a;

const clampProbability = value => Math.min(1 - 1e-9, Math.max(1e-9, value));
const logit = value => Math.log(clampProbability(value) / (1 - clampProbability(value)));
const logistic = value => value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));

/**
 * Fit a one-parameter, slope-only logistic recalibration on favourite probabilities.
 * The intercept is fixed at zero to preserve the 50% anchor; a weak penalty
 * shrinks the fitted slope toward the identity transform (slope 1), reducing
 * instability when the training sample is imperfect.
 */
export function fitLogisticCalibration(observations, options = {}) {
  const minMatches = Number.isInteger(options.minMatches) ? options.minMatches : 200;
  const rows = observations.filter(item =>
    Number.isFinite(item.probability) && item.probability >= 0.5 && item.probability <= 1 &&
    Number.isFinite(item.outcome) && item.outcome >= 0 && item.outcome <= 1
  ).map(item => ({ x: logit(item.probability), y: item.outcome }));
  if (rows.length < minMatches) return null;
  // Favourite calibration must preserve the 50% anchor: a level-rated match
  // cannot become a sub-50% favourite merely because of a fitted intercept.
  const penalty = Number.isFinite(options.penalty) && options.penalty >= 0 ? options.penalty : 0.01;
  let slope = 1;
  for (let iteration = 0; iteration < 60; iteration++) {
    let gradient = -penalty * (slope - 1);
    let curvature = penalty;
    for (const row of rows) {
      const fitted = logistic(slope * row.x);
      const weight = fitted * (1 - fitted);
      gradient += (row.y - fitted) * row.x;
      curvature += weight * row.x * row.x;
    }
    if (!Number.isFinite(curvature) || curvature < 1e-12) return null;
    const step = gradient / curvature;
    slope += step;
    if (!Number.isFinite(slope)) return null;
    if (Math.abs(step) < 1e-8) break;
  }
  // Keep the correction monotonic and avoid unstable extreme transformations.
  slope = Math.min(3, Math.max(0.2, slope));
  return { matches: rows.length, intercept: 0, slope: Number(slope.toFixed(6)) };
}

export function scoreFavouriteCalibration(observations) {
  if (!observations.length) return { matches: 0, brier: null, logLoss: null, ece: null };
  const bins = Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, wins: 0, winsSquared: 0, fractionalVariance: 0 }));
  let brier = 0, logLoss = 0;
  for (const item of observations) {
    const p = clampProbability(item.probability);
    const y = item.outcome;
    brier += (p - y) ** 2;
    logLoss -= y * Math.log(p) + (1 - y) * Math.log(1 - p);
    const index = Math.min(9, Math.max(0, Math.floor((p - 0.5) * 20)));
    bins[index].n++;
    bins[index].predicted += p;
    bins[index].wins += y;
  }
  const ece = bins.reduce((sum, bin) => sum + (bin.n
    ? bin.n * Math.abs(bin.predicted / bin.n - bin.wins / bin.n)
    : 0), 0) / observations.length;
  return {
    matches: observations.length,
    brier: Number((brier / observations.length).toFixed(5)),
    logLoss: Number((logLoss / observations.length).toFixed(5)),
    ece: Number((ece * 100).toFixed(2))
  };
}


function addResult(map, id, won, surface) {
  if (!map.has(id)) map.set(id, []);
  map.get(id).push({ won, surface });
}

export function runBacktest(matches, options = {}) {
  const k = Number.isFinite(options.kFactor) ? options.kFactor : 32;
  const minSurfaceMatches = Number.isInteger(options.minSurfaceMatches) ? options.minSurfaceMatches : 5;
  const evaluationStart = options.evaluationStart == null ? null : dateKey(options.evaluationStart);
  const evaluationEnd = options.evaluationEnd == null ? null : dateKey(options.evaluationEnd);
  if (options.evaluationStart != null && !evaluationStart) throw new RangeError("Invalid evaluationStart; expected a real YYYYMMDD date");
  if (options.evaluationEnd != null && !evaluationEnd) throw new RangeError("Invalid evaluationEnd; expected a real YYYYMMDD date");
  if (evaluationStart && evaluationEnd && evaluationStart > evaluationEnd) throw new RangeError("evaluationStart must not be after evaluationEnd");
  const overall = new Map(), bySurface = new Map(), form = new Map(), h2h = new Map();
  const totals = Object.fromEntries(["elo", "surface", "form", "h2h", "combined"].map(name => [name, { n: 0, brier: 0, logLoss: 0, correct: 0, calibration: Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, wins: 0, winsSquared: 0, fractionalVariance: 0 })) }]));
  const byYear = new Map(), bySurfaceMetrics = new Map(), byYearAndSurface = new Map();
  const yearlyObservations = new Map();
  const yearlyEvaluationObservations = new Map();
  const predictions = [];
  const addMetric = (bucket, probability, outcome) => {
    bucket.n++;
    const p = clampProbability(probability);
    bucket.brier += (p - outcome) ** 2;
    bucket.logLoss -= outcome * Math.log(p) + (1 - outcome) * Math.log(1 - p);
    bucket.correct += p > 0.5 ? outcome : p < 0.5 ? 1 - outcome : 0.5;
  };
  const formatMetrics = bucket => Object.fromEntries(["elo", "surface", "form", "h2h", "combined"].map(name => {
    const value = bucket[name];
    return [name, {
      matches: value.n,
      brier: value.n ? Number((value.brier / value.n).toFixed(5)) : null,
      logLoss: value.n ? Number((value.logLoss / value.n).toFixed(5)) : null,
      accuracy: value.n ? Number((value.correct / value.n * 100).toFixed(2)) : null
    }];
  }));
  const makeMetricBucket = () => Object.fromEntries(["elo", "surface", "form", "h2h", "combined"].map(name => [name, { n: 0, brier: 0, logLoss: 0, correct: 0, calibration: Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, wins: 0, winsSquared: 0, fractionalVariance: 0 })) }]));
  const addCalibration = (bucket, probability, favouriteWon) => {
    const index = Math.min(9, Math.max(0, Math.floor((probability - 0.5) * 20)));
    const bin = bucket.calibration[index];
    bin.n++;
    bin.predicted += probability;
    bin.wins += favouriteWon;
    bin.winsSquared += favouriteWon * favouriteWon;
    // A half-win is an expected Bernoulli outcome, not a certain result.
    bin.fractionalVariance += favouriteWon * (1 - favouriteWon);
  };
  const formatCalibration = bucket => {
    const bins = bucket.calibration.map((bin, index) => {
      const actualRate = bin.n ? bin.wins / bin.n : null;
      // Sample standard error also handles the existing half-win convention for exact Elo ties.
      const variance = bin.n > 1
        ? Math.max(0, (bin.winsSquared - bin.n * actualRate * actualRate + bin.fractionalVariance) / (bin.n - 1))
        : null;
      const margin = variance === null ? null : 1.96 * Math.sqrt(variance / bin.n);
      return {
        range: String(50 + index * 5) + "-" + String(55 + index * 5) + "%",
        matches: bin.n,
        predicted: bin.n ? Number((bin.predicted / bin.n * 100).toFixed(2)) : null,
        actual: bin.n ? Number((actualRate * 100).toFixed(2)) : null,
        gap: bin.n ? Number(((bin.predicted / bin.n - actualRate) * 100).toFixed(2)) : null,
        actualLower95: margin === null ? null : Number((Math.max(0, actualRate - margin) * 100).toFixed(2)),
        actualUpper95: margin === null ? null : Number((Math.min(1, actualRate + margin) * 100).toFixed(2)),
        sampleQuality: bin.n < 30 ? "low" : bin.n < 100 ? "limited" : "larger_sample"
      };
    });
    const used = bins.filter(bin => bin.matches);
    const ece = used.reduce((sum, bin) => sum + bin.matches * Math.abs(bin.gap) / 100, 0) / (bucket.n || 1);
    return { expectedCalibrationError: Number((ece * 100).toFixed(2)), bins };
  };
  const stableOddsKey = value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value ?? null);
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
  };
  const clean = matches.map(row => {
    const date = dateKey(row.tourney_date);
    const winner = String(row.winner_id ?? ""), loser = String(row.loser_id ?? "");
    const score = String(row.score ?? "");
    if (!date || !validId(winner) || !validId(loser) || winner === loser || /\b(?:W\/O|RET|ABD|DEF|DEFAULT)\b/i.test(score)) return null;
    const surface = ["Hard", "Clay", "Grass", "Carpet"].includes(row.surface) ? row.surface : null;
    const player1 = Number(winner) < Number(loser) ? winner : loser;
    const player2 = player1 === winner ? loser : winner;
    const duration = Number(row.durationMinutes);
    const durationMinutes = Number.isFinite(duration) && duration >= 1 && duration <= 600 ? duration : null;
    return { date, winner, loser, player1, player2, surface, durationMinutes, tourneyId: String(row.tourney_id ?? ""), matchNum: String(row.match_num ?? ""), sourceOdds: row.sourceOdds ?? null };
  }).filter(Boolean).sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.tourneyId.localeCompare(b.tourneyId) ||
    a.matchNum.localeCompare(b.matchNum) ||
    a.player1.localeCompare(b.player1) ||
    a.player2.localeCompare(b.player2) ||
    a.winner.localeCompare(b.winner) ||
    a.loser.localeCompare(b.loser) ||
    String(a.surface ?? "").localeCompare(String(b.surface ?? "")) ||
    stableOddsKey(a.sourceOdds).localeCompare(stableOddsKey(b.sourceOdds))
  );

  const matchGroups = new Map();
  for (const match of clean) {
    const key = match.tourneyId && match.matchNum
      ? match.tourneyId + ":" + match.matchNum
      : match.date + ":" + pairKey(match.winner, match.loser) + ":" + (match.surface ?? "unknown");
    if (!matchGroups.has(key)) matchGroups.set(key, []);
    matchGroups.get(key).push(match);
  }
  const uniqueClean = [];
  let duplicateRows = 0, conflictingDuplicateMatches = 0, conflictingDuplicateRows = 0;
  for (const group of matchGroups.values()) {
    const signature = match => JSON.stringify([
      match.date, match.winner, match.loser, match.surface, stableOddsKey(match.sourceOdds)
    ]);
    if (new Set(group.map(signature)).size > 1) {
      conflictingDuplicateMatches++;
      conflictingDuplicateRows += group.length;
      continue;
    }
    uniqueClean.push(group[0]);
    duplicateRows += group.length - 1;
  }
  uniqueClean.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.tourneyId.localeCompare(b.tourneyId) ||
    a.matchNum.localeCompare(b.matchNum) ||
    a.player1.localeCompare(b.player1) ||
    a.player2.localeCompare(b.player2)
  );

  let index = 0;
  while (index < uniqueClean.length) {
    const date = uniqueClean[index].date;
    const day = [];
    while (index < uniqueClean.length && uniqueClean[index].date === date) day.push(uniqueClean[index++]);

    const updates = [];
    for (const match of day) {
      const ra = overall.get(match.player1) ?? 1500;
      const rb = overall.get(match.player2) ?? 1500;
      const sA = match.surface ? bySurface.get(match.surface + ":" + match.player1) : null;
      const sB = match.surface ? bySurface.get(match.surface + ":" + match.player2) : null;
      const surfaceA = sA?.rating ?? ra, surfaceB = sB?.rating ?? rb;
      const useSurface = Boolean(match.surface && (sA?.count ?? 0) >= minSurfaceMatches && (sB?.count ?? 0) >= minSurfaceMatches);
      const historyA = form.get(match.player1) ?? [], historyB = form.get(match.player2) ?? [];
      const formA = (historyA.reduce((sum, item) => sum + (item.won ? 1 : 0), 0) + 2) / (historyA.length + 4);
      const formB = (historyB.reduce((sum, item) => sum + (item.won ? 1 : 0), 0) + 2) / (historyB.length + 4);
      const h = h2h.get(pairKey(match.winner, match.loser)) ?? { a: 0, b: 0 };
      // player1 is always the lower numeric ID, matching the H2H record's a-side.
      const h2hDiff = (h.a - h.b) / (h.a + h.b + 4);
      const features = {
        elo: ra - rb,
        surface: useSurface ? 0.7 * (ra - rb) + 0.3 * (surfaceA - surfaceB) : ra - rb,
        form: (ra - rb) + 80 * (formA - formB),
        h2h: (ra - rb) + 60 * h2hDiff,
        combined: (ra - rb) + (useSurface ? 0.3 * ((surfaceA - surfaceB) - (ra - rb)) : 0) + 80 * (formA - formB) + 60 * h2hDiff
      };
      const year = date.slice(0, 4);
      const insideEvaluationWindow = (!evaluationStart || date >= evaluationStart) && (!evaluationEnd || date <= evaluationEnd);
      if (!yearlyObservations.has(year)) yearlyObservations.set(year, Object.fromEntries(["elo", "surface", "form", "h2h", "combined"].map(name => [name, []])));
      if (insideEvaluationWindow) {
        if (!byYear.has(year)) byYear.set(year, makeMetricBucket());
        if (!yearlyEvaluationObservations.has(year)) yearlyEvaluationObservations.set(year, Object.fromEntries(["elo", "surface", "form", "h2h", "combined"].map(name => [name, []])));
        const surfaceKey = match.surface ?? "Unknown";
        if (!bySurfaceMetrics.has(surfaceKey)) bySurfaceMetrics.set(surfaceKey, makeMetricBucket());
        const yearSurfaceKey = year + "|" + surfaceKey;
        if (!byYearAndSurface.has(yearSurfaceKey)) byYearAndSurface.set(yearSurfaceKey, { matches: 0, metrics: makeMetricBucket() });
        const yearSurfaceBucket = byYearAndSurface.get(yearSurfaceKey);
        yearSurfaceBucket.matches++;
      }
      const modelProbabilities = {};
      for (const [name, delta] of Object.entries(features)) {
        const probability = sigmoid(1500 + delta, 1500);
        modelProbabilities[name] = probability;
        const player1Won = match.winner === match.player1 ? 1 : 0;
        const favouriteProbability = Math.max(probability, 1 - probability);
        const favouriteWon = probability > 0.5 ? player1Won : probability < 0.5 ? 1 - player1Won : 0.5;
        yearlyObservations.get(year)[name].push({ probability: favouriteProbability, outcome: favouriteWon, surface: match.surface ?? "Unknown" });
        if (insideEvaluationWindow) {
          const surfaceKey = match.surface ?? "Unknown";
          const yearSurfaceBucket = byYearAndSurface.get(year + "|" + surfaceKey);
          addMetric(totals[name], probability, player1Won);
          addMetric(byYear.get(year)[name], probability, player1Won);
          addMetric(bySurfaceMetrics.get(surfaceKey)[name], probability, player1Won);
          addMetric(yearSurfaceBucket.metrics[name], probability, player1Won);
          addCalibration(totals[name], favouriteProbability, favouriteWon);
          addCalibration(byYear.get(year)[name], favouriteProbability, favouriteWon);
          addCalibration(bySurfaceMetrics.get(surfaceKey)[name], favouriteProbability, favouriteWon);
          addCalibration(yearSurfaceBucket.metrics[name], favouriteProbability, favouriteWon);
          yearlyEvaluationObservations.get(year)[name].push({ probability: favouriteProbability, outcome: favouriteWon, surface: surfaceKey });
        }
      }
      if (insideEvaluationWindow && options.includePredictions === true) predictions.push({
        date, winnerId: match.winner, loserId: match.loser,
        player1Id: match.player1, player2Id: match.player2, surface: match.surface,
        h2hMeetings: h.a + h.b,
        durationMinutes: match.durationMinutes,
        sourceOdds: match.sourceOdds, probabilities: modelProbabilities
      });
      updates.push(match);
    }

    updates.sort((a, b) => a.tourneyId.localeCompare(b.tourneyId) || a.matchNum.localeCompare(b.matchNum) || a.winner.localeCompare(b.winner) || a.loser.localeCompare(b.loser));
    // Batch all rating updates from the same pre-date state. This makes
    // next-day ratings independent of CSV row order when players have
    // multiple matches recorded on the same date.
    const overallDeltas = new Map();
    const surfaceDeltas = new Map();
    for (const match of updates) {
      const winnerRating = overall.get(match.winner) ?? 1500;
      const loserRating = overall.get(match.loser) ?? 1500;
      const expected = sigmoid(winnerRating, loserRating);
      overallDeltas.set(match.winner, (overallDeltas.get(match.winner) ?? 0) + k * (1 - expected));
      overallDeltas.set(match.loser, (overallDeltas.get(match.loser) ?? 0) - k * (1 - expected));

      if (match.surface) {
        const keyW = match.surface + ":" + match.winner, keyL = match.surface + ":" + match.loser;
        const currentW = bySurface.get(keyW) ?? { rating: 1500, count: 0 };
        const currentL = bySurface.get(keyL) ?? { rating: 1500, count: 0 };
        const surfaceExpected = sigmoid(currentW.rating, currentL.rating);
        const delta = k * (1 - surfaceExpected);
        surfaceDeltas.set(keyW, (surfaceDeltas.get(keyW) ?? 0) + delta);
        surfaceDeltas.set(keyL, (surfaceDeltas.get(keyL) ?? 0) - delta);
      }
    }
    for (const [id, delta] of overallDeltas) overall.set(id, (overall.get(id) ?? 1500) + delta);
    for (const [key, delta] of surfaceDeltas) {
      const current = bySurface.get(key) ?? { rating: 1500, count: 0 };
      bySurface.set(key, { rating: current.rating + delta, count: current.count });
    }
    for (const match of updates) {
      if (match.surface) {
        for (const id of [match.winner, match.loser]) {
          const key = match.surface + ":" + id;
          const current = bySurface.get(key) ?? { rating: 1500, count: 0 };
          bySurface.set(key, { ...current, count: current.count + 1 });
        }
      }
      addResult(form, match.winner, true, match.surface);
      addResult(form, match.loser, false, match.surface);
      const key = pairKey(match.winner, match.loser);
      const record = h2h.get(key) ?? { a: 0, b: 0 };
      if (Number(match.winner) < Number(match.loser)) record.a++;
      else record.b++;
      h2h.set(key, record);
      for (const id of [match.winner, match.loser]) {
        const history = form.get(id);
        if (history.length > 10) history.splice(0, history.length - 10);
      }
    }
  }

  const evaluatedMatches = totals.elo.n;

  const calibrationValidation = [];
  const trainingYearsAvailable = [...yearlyObservations.keys()].sort();
  const evaluationYears = [...yearlyEvaluationObservations.keys()].sort();
  for (const evaluationYear of evaluationYears) {
    const trainingYears = trainingYearsAvailable.filter(year => year < evaluationYear);
    if (!trainingYears.length) continue;
    const trainingYear = trainingYears.at(-1);
    for (const name of ["elo", "surface", "form", "h2h", "combined"]) {
      const training = trainingYears.flatMap(year => yearlyObservations.get(year)[name]);
      const evaluation = yearlyEvaluationObservations.get(evaluationYear)[name];
      const calibrator = fitLogisticCalibration(training);
      const raw = scoreFavouriteCalibration(evaluation);
      if (!calibrator) {
        calibrationValidation.push({
          trainingYear, trainingYears, evaluationYear, candidate: name, scope: "tour",
          status: "insufficient_training_data",
          trainingMatches: training.length,
          trainingSampleQuality: training.length < 30 ? "low" : training.length < 100 ? "limited" : "larger_sample",
          evaluationSampleQuality: evaluation.length < 30 ? "low" : evaluation.length < 100 ? "limited" : "larger_sample",
          raw
        });
      } else {
        const calibratedObservations = evaluation.map(item => ({
          probability: logistic(calibrator.intercept + calibrator.slope * logit(item.probability)),
          outcome: item.outcome
        }));
        calibrationValidation.push({
          trainingYear, trainingYears, evaluationYear, candidate: name, scope: "tour",
          trainingMatches: training.length,
          trainingSampleQuality: training.length < 30 ? "low" : training.length < 100 ? "limited" : "larger_sample",
          evaluationSampleQuality: evaluation.length < 30 ? "low" : evaluation.length < 100 ? "limited" : "larger_sample",
          calibrator,
          raw, calibrated: scoreFavouriteCalibration(calibratedObservations)
        });
      }

      const surfaces = [...new Set([...training, ...evaluation].map(item => item.surface))].sort();
      for (const surfaceName of surfaces) {
        const surfaceTraining = training.filter(item => item.surface === surfaceName);
        const surfaceEvaluation = evaluation.filter(item => item.surface === surfaceName);
        if (surfaceEvaluation.length === 0) continue;
        const rawSurface = scoreFavouriteCalibration(surfaceEvaluation);
        const surfaceCalibrator = fitLogisticCalibration(surfaceTraining);
        const surfaceBase = {
          trainingYear, trainingYears, evaluationYear, candidate: name, scope: "surface",
          surface: surfaceName, trainingMatches: surfaceTraining.length,
          trainingSampleQuality: surfaceTraining.length < 30 ? "low" : surfaceTraining.length < 100 ? "limited" : surfaceTraining.length < 200 ? "limited_for_fit" : "larger_sample",
          evaluationSampleQuality: surfaceEvaluation.length < 30 ? "low" : surfaceEvaluation.length < 100 ? "limited" : "larger_sample",
          raw: rawSurface
        };
        if (!surfaceCalibrator) {
          calibrationValidation.push({
            ...surfaceBase,
            status: surfaceTraining.length < 200 ? "insufficient_surface_training_data" : "surface_calibration_fit_failed"
          });
          continue;
        }
        const transformed = surfaceEvaluation.map(item => ({
          probability: logistic(surfaceCalibrator.intercept + surfaceCalibrator.slope * logit(item.probability)),
          outcome: item.outcome
        }));
        calibrationValidation.push({
          ...surfaceBase,
          calibrated: scoreFavouriteCalibration(transformed),
          calibrator: surfaceCalibrator
        });
      }
    }
  }
  const byYearAndSurfaceReport = {};
  for (const [key, bucket] of [...byYearAndSurface.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const parts = key.split("|");
    const year = parts[0], surface = parts.slice(1).join("|");
    if (!byYearAndSurfaceReport[year]) byYearAndSurfaceReport[year] = {};
    byYearAndSurfaceReport[year][surface] = {
      matches: bucket.matches,
      sampleQuality: bucket.matches < 30 ? "low" : bucket.matches < 100 ? "limited" : "larger_sample",
      metrics: formatMetrics(bucket.metrics),
      calibration: Object.fromEntries(Object.entries(bucket.metrics).map(([name, metric]) => [name, formatCalibration(metric)]))
    };
  }

  return {
    matches: uniqueClean.length,
    excluded: matches.length - clean.length + conflictingDuplicateRows,
    duplicateRows,
    conflictingDuplicateMatches,
    conflictingDuplicateRows,
    unknownSurfaceMatches: uniqueClean.filter(match => match.surface == null).length,
    evaluationStart,
    evaluationEnd,
    evaluatedMatches,
    warmupMatches: evaluationStart ? uniqueClean.filter(match => match.date < evaluationStart).length : 0,
    metrics: formatMetrics(totals),
    calibration: Object.fromEntries(Object.entries(totals).map(([name, bucket]) => [name, formatCalibration(bucket)])),
    calibrationValidation,
    ...(options.includePredictions === true ? { predictions } : {}),
    breakdowns: {
      byYear: Object.fromEntries([...byYear.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => [key, formatMetrics(bucket)])),
      bySurface: Object.fromEntries([...bySurfaceMetrics.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => [key, formatMetrics(bucket)])),
      byYearAndSurface: byYearAndSurfaceReport
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" || args[i] === "--to") {
      const key = args[i] === "--from" ? "evaluationStart" : "evaluationEnd";
      if (!args[i + 1]) throw new Error(`Missing date after ${args[i]}`);
      options[key] = args[++i];
    } else if (args[i].startsWith("--from=")) options.evaluationStart = args[i].slice(7);
    else if (args[i].startsWith("--to=")) options.evaluationEnd = args[i].slice(5);
    else if (args[i].startsWith("--")) throw new Error(`Unknown option: ${args[i]}`);
    else files.push(args[i]);
  }
  if (!files.length) {
    console.error("Usage: node scripts/backtest.mjs [--from YYYYMMDD] [--to YYYYMMDD] path/to/atp_matches_2025.csv [more CSV files...]");
    process.exitCode = 2;
    return;
  }
  const all = [];
  for (const file of files) {
    const rows = parseCsv(await readFile(file, "utf8"));
    all.push(...rows);
    console.error(`Loaded ${rows.length} rows from ${basename(file)}`);
  }
  const report = runBacktest(all, options);
  console.log(JSON.stringify(report, null, 2));
  console.error("Lower Brier/log-loss is better. Accuracy is secondary; this is not ROI.");
  console.error("Matches before --from are warm-up only and do not enter evaluation metrics.");
  console.error("The feature weights are exploratory candidates, not production model settings.");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
