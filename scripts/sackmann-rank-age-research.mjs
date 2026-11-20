#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const clamp = value => Math.min(1 - 1e-9, Math.max(1e-9, value));
const sigmoid = value => value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));
const validId = value => /^\d+$/.test(String(value ?? "")) && Number(value) > 0;
const validDate = value => {
  const raw = String(value ?? "");
  if (!/^\d{8}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4)), month = Number(raw.slice(4, 6)), day = Number(raw.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? raw : null;
};
const pairKey = (a, b) => Number(a) < Number(b) ? a + ":" + b : b + ":" + a;
const numberOrNull = value => {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const validRank = value => Number.isFinite(value) && value > 0 && value <= 10000;
const validAge = value => Number.isFinite(value) && value >= 13 && value <= 60;

function solveLinear(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map(row => row[n]);
}

function deterministicSample(rows, limit, seedText) {
  if (rows.length <= limit) return rows;
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const sample = rows.slice(0, limit);
  for (let i = limit; i < rows.length; i++) {
    const j = Math.floor(random() * (i + 1));
    if (j < limit) sample[j] = rows[i];
  }
  return sample;
}

export function fitLogistic(rows, featureNames, options = {}) {
  const minMatches = Number.isInteger(options.minMatches) ? options.minMatches : 1000;
  const maxRows = Number.isInteger(options.maxRows) ? options.maxRows : 50000;
  const penalty = Number.isFinite(options.penalty) && options.penalty >= 0 ? options.penalty : 1;
  if (rows.length < minMatches) return null;
  const training = deterministicSample(rows, maxRows, String(options.seed ?? "rank-age"));
  const means = [], scales = [];
  for (const name of featureNames) {
    const mean = training.reduce((sum, row) => sum + row[name], 0) / training.length;
    const variance = training.reduce((sum, row) => sum + (row[name] - mean) ** 2, 0) / training.length;
    means.push(mean);
    scales.push(Math.sqrt(variance) > 1e-9 ? Math.sqrt(variance) : 1);
  }
  const dimension = featureNames.length + 1;
  let beta = Array(dimension).fill(0);
  for (let iteration = 0; iteration < 30; iteration++) {
    const gradient = Array(dimension).fill(0);
    const hessian = Array.from({ length: dimension }, () => Array(dimension).fill(0));
    for (const row of training) {
      const x = [1, ...featureNames.map((name, i) => (row[name] - means[i]) / scales[i])];
      const z = beta.reduce((sum, coefficient, i) => sum + coefficient * x[i], 0);
      const probability = sigmoid(z);
      const weight = Math.max(1e-8, probability * (1 - probability));
      const residual = row.outcome - probability;
      for (let i = 0; i < dimension; i++) {
        gradient[i] += residual * x[i];
        for (let j = 0; j < dimension; j++) hessian[i][j] += weight * x[i] * x[j];
      }
    }
    for (let i = 1; i < dimension; i++) {
      gradient[i] -= penalty * beta[i];
      hessian[i][i] += penalty;
    }
    const step = solveLinear(hessian, gradient);
    if (!step || step.some(value => !Number.isFinite(value))) return null;
    beta = beta.map((value, i) => value + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  if (beta.some(value => !Number.isFinite(value))) return null;
  return {
    featureNames,
    means,
    scales,
    coefficients: beta,
    trainingMatches: rows.length,
    trainingSample: training.length
  };
}

export function predictLogistic(model, row) {
  if (!model) return null;
  let z = model.coefficients[0];
  for (let i = 0; i < model.featureNames.length; i++) {
    z += model.coefficients[i + 1] * ((row[model.featureNames[i]] - model.means[i]) / model.scales[i]);
  }
  return clamp(sigmoid(z));
}

function blankMetric() {
  return { n: 0, brier: 0, logLoss: 0, correct: 0 };
}
function addMetric(bucket, probability, outcome) {
  const p = clamp(probability);
  bucket.n++;
  bucket.brier += (p - outcome) ** 2;
  bucket.logLoss -= outcome * Math.log(p) + (1 - outcome) * Math.log(1 - p);
  bucket.correct += p > 0.5 ? outcome : p < 0.5 ? 1 - outcome : 0.5;
}
function finishMetric(bucket) {
  if (!bucket.n) return { matches: 0, brier: null, logLoss: null, accuracy: null };
  return {
    matches: bucket.n,
    brier: Number((bucket.brier / bucket.n).toFixed(6)),
    logLoss: Number((bucket.logLoss / bucket.n).toFixed(6)),
    accuracy: Number((100 * bucket.correct / bucket.n).toFixed(2))
  };
}
function comparisonBucket(trainingMatches, trainingSample) {
  return {
    trainingMatches,
    trainingSample,
    baseline: blankMetric(),
    candidate: blankMetric()
  };
}
function finishComparison(bucket) {
  const baseline = finishMetric(bucket.baseline);
  const candidate = finishMetric(bucket.candidate);
  return {
    trainingMatches: bucket.trainingMatches,
    trainingSample: bucket.trainingSample,
    matches: candidate.matches,
    baseline,
    candidate,
    delta: {
      brier: baseline.brier == null || candidate.brier == null ? null : Number((candidate.brier - baseline.brier).toFixed(6)),
      logLoss: baseline.logLoss == null || candidate.logLoss == null ? null : Number((candidate.logLoss - baseline.logLoss).toFixed(6)),
      accuracy: baseline.accuracy == null || candidate.accuracy == null ? null : Number((candidate.accuracy - baseline.accuracy).toFixed(2))
    }
  };
}

function prepareRows(rows) {
  const clean = [];
  for (const row of rows) {
    const date = validDate(row.tourney_date);
    const winner = String(row.winner_id ?? ""), loser = String(row.loser_id ?? "");
    if (!date || !validId(winner) || !validId(loser) || winner === loser) continue;
    const winnerIsPlayer1 = Number(winner) < Number(loser);
    const player1 = winnerIsPlayer1 ? winner : loser;
    const player2 = winnerIsPlayer1 ? loser : winner;
    const winnerRank = numberOrNull(row.winner_rank), loserRank = numberOrNull(row.loser_rank);
    const winnerAge = numberOrNull(row.winner_age), loserAge = numberOrNull(row.loser_age);
    const rank1 = winnerIsPlayer1 ? winnerRank : loserRank;
    const rank2 = winnerIsPlayer1 ? loserRank : winnerRank;
    const age1 = winnerIsPlayer1 ? winnerAge : loserAge;
    const age2 = winnerIsPlayer1 ? loserAge : winnerAge;
    const rankAvailable = validRank(rank1) && validRank(rank2);
    const ageAvailable = validAge(age1) && validAge(age2);
    clean.push({
      date, year: date.slice(0, 4), winner, loser, player1, player2,
      outcome: winnerIsPlayer1 ? 1 : 0,
      rank1: rankAvailable ? rank1 : null,
      rank2: rankAvailable ? rank2 : null,
      age1: ageAvailable ? age1 : null,
      age2: ageAvailable ? age2 : null,
      rankAdv: rankAvailable ? Math.log(rank2) - Math.log(rank1) : null,
      ageDiffScaled: ageAvailable ? (age1 - age2) / 10 : null,
      avgAgeScaled: ageAvailable ? ((age1 + age2) / 2 - 25) / 10 : null,
      tourneyId: String(row.tourney_id ?? ""),
      matchNum: String(row.match_num ?? ""),
      round: String(row.round ?? ""),
      surface: String(row.surface ?? "")
    });
  }
  clean.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.tourneyId.localeCompare(b.tourneyId) ||
    a.matchNum.localeCompare(b.matchNum) ||
    a.player1.localeCompare(b.player1) ||
    a.player2.localeCompare(b.player2)
  );
  const groups = new Map();
  for (const match of clean) {
    const key = match.tourneyId && match.matchNum
      ? [match.tourneyId, match.date, match.matchNum, pairKey(match.winner, match.loser), match.round].join(":")
      : [match.date, pairKey(match.winner, match.loser), match.surface].join(":");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  const unique = [];
  let duplicateRows = 0, conflictingDuplicateMatches = 0, conflictingDuplicateRows = 0;
  for (const group of groups.values()) {
    const signature = item => JSON.stringify([item.date, item.winner, item.loser, item.surface]);
    if (new Set(group.map(signature)).size > 1) {
      conflictingDuplicateMatches++;
      conflictingDuplicateRows += group.length;
      continue;
    }
    unique.push(group[0]);
    duplicateRows += group.length - 1;
  }
  unique.sort((a, b) => a.date.localeCompare(b.date) ||
    a.tourneyId.localeCompare(b.tourneyId) || a.matchNum.localeCompare(b.matchNum) ||
    a.player1.localeCompare(b.player1) || a.player2.localeCompare(b.player2));
  return { rows: unique, sourceRows: rows.length, excludedRows: rows.length - clean.length + conflictingDuplicateRows, duplicateRows, conflictingDuplicateMatches, conflictingDuplicateRows };
}

const DEFINITIONS = {
  rank: { filter: row => row.rankAdv != null, features: ["eloScaled", "rankAdv"] },
  age: { filter: row => row.ageDiffScaled != null, features: ["eloScaled", "ageDiffScaled", "avgAgeScaled"] },
  rankAge: { filter: row => row.rankAdv != null && row.ageDiffScaled != null, features: ["eloScaled", "rankAdv", "ageDiffScaled", "avgAgeScaled"] }
};

export function runRankAgeWalkForward(inputRows, options = {}) {
  const tour = options.tour ?? "atp";
  if (!["atp", "wta"].includes(tour)) throw new RangeError("tour must be atp or wta");
  const kFactor = Number.isFinite(options.kFactor) ? options.kFactor : 32;
  const evaluationStart = validDate(options.evaluationStart ?? "20000101");
  const evaluationEnd = validDate(options.evaluationEnd ?? "20261231");
  if (!evaluationStart || !evaluationEnd || evaluationStart > evaluationEnd) {
    throw new RangeError("evaluationStart/evaluationEnd must be valid ordered YYYYMMDD dates");
  }
  const minTrainingMatches = Number.isInteger(options.minTrainingMatches) ? options.minTrainingMatches : 1000;
  const maxTrainingRows = Number.isInteger(options.maxTrainingRows) ? options.maxTrainingRows : 50000;
  const prepared = prepareRows(inputRows);
  const matches = prepared.rows;
  const overall = new Map();
  const history = [];
  const aggregate = Object.fromEntries(Object.keys(DEFINITIONS).map(name => [name, comparisonBucket(0, 0)]));
  const byYear = {};
  let index = 0, evaluatedMatches = 0, yearsWithModels = 0;
  let currentYear = null, yearModels = null, yearReport = null;

  const buildModels = year => {
    const models = {};
    for (const [name, definition] of Object.entries(DEFINITIONS)) {
      const training = history.filter(definition.filter);
      const baseline = fitLogistic(training, ["eloScaled"], {
        minMatches: minTrainingMatches, maxRows: maxTrainingRows, seed: tour + year + name
      });
      const candidate = fitLogistic(training, definition.features, {
        minMatches: minTrainingMatches, maxRows: maxTrainingRows, seed: tour + year + name
      });
      if (baseline && candidate) models[name] = { baseline, candidate, trainingMatches: training.length };
    }
    return models;
  };

  while (index < matches.length) {
    const date = matches[index].date;
    const year = date.slice(0, 4);
    if (year !== currentYear) {
      currentYear = year;
      yearModels = year >= evaluationStart.slice(0, 4) && year <= evaluationEnd.slice(0, 4) ? buildModels(year) : {};
      yearReport = {
        models: Object.fromEntries(Object.entries(yearModels).map(([name, model]) => [
          name, comparisonBucket(model.trainingMatches,
            Math.min(model.baseline.trainingSample, model.candidate.trainingSample))
        ]))
      };
      byYear[year] = yearReport;
      if (Object.keys(yearModels).length) yearsWithModels++;
      for (const [name, model] of Object.entries(yearModels)) {
        aggregate[name].trainingMatches += model.trainingMatches;
        aggregate[name].trainingSample += Math.min(model.baseline.trainingSample, model.candidate.trainingSample);
      }
    }
    const day = [];
    while (index < matches.length && matches[index].date === date) day.push(matches[index++]);
    const updates = [];
    const newHistory = [];
    for (const match of day) {
      const rating1 = overall.get(match.player1) ?? 1500;
      const rating2 = overall.get(match.player2) ?? 1500;
      const observation = {
        ...match,
        eloDiff: rating1 - rating2,
        eloScaled: (rating1 - rating2) / 400
      };
      newHistory.push(observation);
      if (date >= evaluationStart && date <= evaluationEnd) {
        evaluatedMatches++;
        for (const [name, definition] of Object.entries(DEFINITIONS)) {
          const models = yearModels[name];
          if (!models || !definition.filter(observation)) continue;
          const baselineProbability = predictLogistic(models.baseline, observation);
          const candidateProbability = predictLogistic(models.candidate, observation);
          const bucket = yearReport.models[name];
          addMetric(bucket.baseline, baselineProbability, observation.outcome);
          addMetric(bucket.candidate, candidateProbability, observation.outcome);
          const total = aggregate[name];
          addMetric(total.baseline, baselineProbability, observation.outcome);
          addMetric(total.candidate, candidateProbability, observation.outcome);
        }
      }
      updates.push(match);
    }

    // All matches on a calendar date are predicted from the same pre-date Elo state.
    const deltas = new Map();
    for (const match of updates) {
      const winnerRating = overall.get(match.winner) ?? 1500;
      const loserRating = overall.get(match.loser) ?? 1500;
      const expected = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
      const delta = kFactor * (1 - expected);
      deltas.set(match.winner, (deltas.get(match.winner) ?? 0) + delta);
      deltas.set(match.loser, (deltas.get(match.loser) ?? 0) - delta);
    }
    for (const [id, delta] of deltas) overall.set(id, (overall.get(id) ?? 1500) + delta);
    history.push(...newHistory);
  }

  const summary = Object.fromEntries(Object.entries(aggregate).map(([name, bucket]) => [
    name,
    finishComparison({
      trainingMatches: bucket.trainingMatches,
      trainingSample: bucket.trainingSample,
      baseline: bucket.baseline,
      candidate: bucket.candidate
    })
  ]));
  const yearly = Object.fromEntries(Object.entries(byYear).map(([year, report]) => [
    year,
    Object.fromEntries(Object.entries(report.models).map(([name, bucket]) => [name, finishComparison(bucket)]))
  ]));
  return {
    schemaVersion: 1,
    researchOnly: true,
    tour,
    kFactor,
    evaluationStart,
    evaluationEnd,
    sourceRows: prepared.sourceRows,
    eligibleMatches: matches.length,
    excludedRows: prepared.excludedRows,
    duplicateRows: prepared.duplicateRows,
    conflictingDuplicateMatches: prepared.conflictingDuplicateMatches,
    conflictingDuplicateRows: prepared.conflictingDuplicateRows,
    evaluatedMatches,
    yearsWithModels,
    featureDefinitions: {
      rank: "log(rank of player 2 / rank of player 1), positive means player 1 has the better ranking",
      age: "age difference and average age, both measured at the tournament date",
      rankAge: "ranking and age features together"
    },
    summary,
    byYear: yearly,
    limitations: [
      "Each evaluation year is predicted using coefficients fitted only on earlier calendar years.",
      "All matches on the same date use the same pre-date Elo state; same-day results do not leak into other same-day predictions.",
      "Each candidate is compared with an Elo-only logistic baseline on the exact same eligible matches.",
      "Training is deterministically capped per model/year for runtime; evaluation uses all eligible matches.",
      "Sackmann ranking fields are tournament-date snapshots and are not guaranteed to be exact match-start snapshots. Verify timing before interpreting them as strictly pre-match.",
      "This is non-commercial research under CC BY-NC-SA 4.0, not a production model or evidence of profitability."
    ]
  };
}

async function main() {
  const args = process.argv.slice(2), options = {}, files = [];
  for (let i = 0; i < args.length; i++) {
    if (["--tour", "--from", "--to", "--k", "--min-training", "--max-training", "--out"].includes(args[i])) {
      if (!args[i + 1]) throw new Error("Missing value after " + args[i]);
      const key = args[i].slice(2), value = args[++i];
      if (key === "tour") options.tour = value;
      else if (key === "from") options.evaluationStart = value;
      else if (key === "to") options.evaluationEnd = value;
      else if (key === "k") options.kFactor = Number(value);
      else if (key === "min-training") options.minTrainingMatches = Number(value);
      else if (key === "max-training") options.maxTrainingRows = Number(value);
      else if (key === "out") options.output = value;
    } else if (args[i].startsWith("--")) throw new Error("Unknown option: " + args[i]);
    else files.push(args[i]);
  }
  if (!files.length || !options.tour) throw new Error("Usage: node scripts/sackmann-rank-age-research.mjs --tour atp|wta [--from YYYYMMDD] [--to YYYYMMDD] [--k 32] normalized.csv");
  const all = [];
  for (const file of files) {
    const rows = parseCsv(await readFile(file, "utf8"));
    for (const row of rows) all.push(row);
    console.error("Loaded " + rows.length + " normalized rows from " + basename(file));
  }
  const report = runRankAgeWalkForward(all, options);
  const json = JSON.stringify(report, null, 2) + "\n";
  if (options.output) await writeFile(options.output, json, "utf8");
  console.log(json);
  console.error("Research only. Lower Brier/LogLoss is better; positive delta means the added factor worsened the metric.");
}
if (import.meta.url === "file://" + process.argv[1]) await main();
