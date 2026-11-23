#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parseCsv } from "./backtest.mjs";
import { fitLogistic, predictLogistic } from "./sackmann-rank-age-research.mjs";

const MAIN_LEVELS = {
  atp: new Set(["G", "M", "A", "F", "D", "O"]),
  wta: new Set(["G", "PM", "P", "I", "W", "F", "D", "O", "T1", "T2", "T3", "T4", "T5", "A", "M"])
};
const BASE_FEATURES = ["eloScaled", "rankAdv", "ageDiffScaled", "avgAgeScaled"];
const SERVE_FEATURES = [
  "firstInRateDiff",
  "firstServeWinRateDiff",
  "secondServeWinRateDiff",
  "aceRateDiff",
  "doubleFaultRateDiff",
  "returnPointsWonRateDiff"
];
const FULL_FEATURES = [...BASE_FEATURES, ...SERVE_FEATURES];
const WINDOWS = [null, 5, 3];
const EVAL_FROM = 2013;
const EVAL_TO = 2022;
const ROLLING_MATCHES = 20;
const MIN_PRIOR_STATS_MATCHES = 5;

const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const validDate = value => {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + "T00:00:00.000Z");
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text
    ? null : text.replaceAll("-", "");
};
const validId = value => /^\d+$/.test(String(value ?? "")) && Number(value) > 0;

function normalizeServeStats(value) {
  if (!value) return null;
  try {
    const raw = JSON.parse(value);
    if (!raw || !raw.winner || !raw.loser) return null;
    const convert = player => {
      const s = {
        servePoints: num(player.serve_points),
        firstIn: num(player.first_in),
        firstWon: num(player.first_won),
        secondWon: num(player.second_won),
        aces: num(player.aces),
        doubleFaults: num(player.double_faults)
      };
      if (Object.values(s).some(v => v === null)) return null;
      s.secondServePoints = s.servePoints - s.firstIn - s.doubleFaults;
      if (s.servePoints <= 0 || s.firstIn < 0 || s.firstIn > s.servePoints ||
          s.firstWon < 0 || s.firstWon > s.firstIn || s.doubleFaults < 0 ||
          s.secondServePoints < 0 || s.secondWon < 0 || s.secondWon > s.secondServePoints ||
          s.aces < 0 || s.aces > s.servePoints) return null;
      return s;
    };
    const winner = convert(raw.winner);
    const loser = convert(raw.loser);
    return winner && loser ? { winner, loser } : null;
  } catch {
    return null;
  }
}

function makePlayerStatRecord(own, opponent) {
  const returnPointsWon = opponent.servePoints - opponent.firstWon - opponent.secondWon;
  if (returnPointsWon < 0 || returnPointsWon > opponent.servePoints) return null;
  return {
    servePoints: own.servePoints,
    firstIn: own.firstIn,
    firstWon: own.firstWon,
    secondWon: own.secondWon,
    secondServePoints: own.secondServePoints,
    aces: own.aces,
    doubleFaults: own.doubleFaults,
    returnPointsWon,
    returnPointsTotal: opponent.servePoints
  };
}

function rollingFeatures(history) {
  if (!history || history.length < MIN_PRIOR_STATS_MATCHES) return null;
  const rows = history.slice(-ROLLING_MATCHES);
  const sum = key => rows.reduce((total, row) => total + row[key], 0);
  const servePoints = sum("servePoints");
  const firstIn = sum("firstIn");
  const firstWon = sum("firstWon");
  const secondWon = sum("secondWon");
  const secondServePoints = sum("secondServePoints");
  const returnPointsWon = sum("returnPointsWon");
  const returnPointsTotal = sum("returnPointsTotal");
  if (servePoints <= 0 || firstIn <= 0 || secondServePoints <= 0 || returnPointsTotal <= 0) return null;
  return {
    firstInRate: firstIn / servePoints,
    firstServeWinRate: firstWon / firstIn,
    secondServeWinRate: secondWon / secondServePoints,
    aceRate: sum("aces") / servePoints,
    doubleFaultRate: sum("doubleFaults") / servePoints,
    returnPointsWonRate: returnPointsWon / returnPointsTotal,
    matches: rows.length
  };
}

function addMetric(bucket, probability, outcome) {
  const p = Math.max(1e-6, Math.min(1 - 1e-6, probability));
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
function finishComparison(bucket) {
  const baseline = finishMetric(bucket.baseline);
  const candidate = finishMetric(bucket.candidate);
  return {
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

function makeFeatureMatch(match, ratings, histories) {
  const player1 = Number(match.winner) < Number(match.loser) ? match.winner : match.loser;
  const player2 = player1 === match.winner ? match.loser : match.winner;
  const outcome = player1 === match.winner ? 1 : 0;
  const winnerRating = ratings.get(match.winner) ?? 1500;
  const loserRating = ratings.get(match.loser) ?? 1500;
  const rating1 = ratings.get(player1) ?? 1500;
  const rating2 = ratings.get(player2) ?? 1500;
  const rank1 = player1 === match.winner ? match.winnerRank : match.loserRank;
  const rank2 = player2 === match.winner ? match.winnerRank : match.loserRank;
  const age1 = player1 === match.winner ? match.winnerAge : match.loserAge;
  const age2 = player2 === match.winner ? match.winnerAge : match.loserAge;
  if (!(rank1 > 0 && rank2 > 0 && age1 >= 13 && age1 <= 60 && age2 >= 13 && age2 <= 60)) return null;
  const p1 = rollingFeatures(histories.get(player1));
  const p2 = rollingFeatures(histories.get(player2));
  if (!p1 || !p2) return null;
  return {
    date: match.date,
    year: Number(match.date.slice(0, 4)),
    outcome,
    eloScaled: (rating1 - rating2) / 400,
    rankAdv: Math.log(rank2) - Math.log(rank1),
    ageDiffScaled: (age1 - age2) / 10,
    avgAgeScaled: ((age1 + age2) / 2 - 25) / 10,
    firstInRateDiff: p1.firstInRate - p2.firstInRate,
    firstServeWinRateDiff: p1.firstServeWinRate - p2.firstServeWinRate,
    secondServeWinRateDiff: p1.secondServeWinRate - p2.secondServeWinRate,
    aceRateDiff: p1.aceRate - p2.aceRate,
    doubleFaultRateDiff: p1.doubleFaultRate - p2.doubleFaultRate,
    returnPointsWonRateDiff: p1.returnPointsWonRate - p2.returnPointsWonRate
  };
}

function loadMatches(rows, tour, inventory) {
  const matches = [];
  const seen = new Set();
  for (const row of rows) {
    if (String(row.tour ?? "").toLowerCase() !== tour) continue;
    if (!MAIN_LEVELS[tour].has(String(row.level ?? "").toUpperCase())) continue;
    if (row.outcome !== "completed") continue;
    const date = validDate(row.event_date);
    const winner = String(row.winner_player_id ?? "");
    const loser = String(row.loser_player_id ?? "");
    if (!date || !validId(winner) || !validId(loser) || winner === loser) continue;
    const sourceId = String(row.source_id ?? "");
    if (sourceId && seen.has(sourceId)) continue;
    if (sourceId) seen.add(sourceId);
    const winnerRank = num(row.winner_rank);
    const loserRank = num(row.loser_rank);
    const winnerAge = num(row.winner_age);
    const loserAge = num(row.loser_age);
    const stats = normalizeServeStats(row.stats);
    if (stats) inventory.statsMatchesByTour[tour]++;
    const parts = sourceId.split(":");
    const matchNum = parts.length > 1 ? parts.at(-1) : sourceId;
    const tournamentId = parts.length > 1 ? parts.slice(0, -1).join(":") :
      tour + ":" + date + ":" + String(row.tournament ?? "");
    matches.push({
      date,
      tournamentId,
      matchNum,
      winner,
      loser,
      winnerRank,
      loserRank,
      winnerAge,
      loserAge,
      surface: String(row.surface ?? "").trim().toLowerCase(),
      stats
    });
    inventory.completedMatchesByTour[tour]++;
  }
  matches.sort((a, b) => a.date.localeCompare(b.date) ||
    a.tournamentId.localeCompare(b.tournamentId) ||
    a.matchNum.localeCompare(b.matchNum));
  return matches;
}

function runTour(matches, tour, kFactor) {
  const ratings = new Map();
  const histories = new Map();
  const featureRows = [];
  let i = 0;
  while (i < matches.length) {
    let j = i + 1;
    while (j < matches.length && matches[j].date === matches[i].date) j++;
    const group = matches.slice(i, j);
    const ratingDeltas = new Map();
    const pendingStats = [];
    for (const match of group) {
      const feature = makeFeatureMatch(match, ratings, histories);
      if (feature) featureRows.push(feature);
      const winnerRating = ratings.get(match.winner) ?? 1500;
      const loserRating = ratings.get(match.loser) ?? 1500;
      const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
      const delta = kFactor * (1 - expectedWinner);
      ratingDeltas.set(match.winner, (ratingDeltas.get(match.winner) ?? 0) + delta);
      ratingDeltas.set(match.loser, (ratingDeltas.get(match.loser) ?? 0) - delta);
      if (match.stats) {
        const winnerRecord = makePlayerStatRecord(match.stats.winner, match.stats.loser);
        const loserRecord = makePlayerStatRecord(match.stats.loser, match.stats.winner);
        if (winnerRecord && loserRecord) {
          pendingStats.push([match.winner, winnerRecord], [match.loser, loserRecord]);
        }
      }
    }
    for (const [player, delta] of ratingDeltas) ratings.set(player, (ratings.get(player) ?? 1500) + delta);
    for (const [player, record] of pendingStats) {
      const history = histories.get(player) ?? [];
      history.push(record);
      if (history.length > ROLLING_MATCHES) history.splice(0, history.length - ROLLING_MATCHES);
      histories.set(player, history);
    }
    i = j;
  }
  return featureRows;
}

function evaluate(featureRows, tour, kFactor) {
  const byWindow = {};
  for (const windowYears of WINDOWS) {
    const label = windowYears === null ? "all_history" : String(windowYears) + "_seasons";
    const total = {
      baseline: { n: 0, brier: 0, logLoss: 0, correct: 0 },
      candidate: { n: 0, brier: 0, logLoss: 0, correct: 0 }
    };
    const byYear = {};
    for (let year = EVAL_FROM; year <= EVAL_TO; year++) {
      const training = featureRows.filter(row => row.year < year &&
        (windowYears === null || row.year >= year - windowYears));
      const evaluation = featureRows.filter(row => row.year === year);
      if (training.length < 1000 || evaluation.length < 100) {
        byYear[year] = { trainingMatches: training.length, evaluationMatches: evaluation.length, status: "insufficient_sample" };
        continue;
      }
      const seed = tour + ":" + year + ":" + label + ":k" + kFactor;
      const baseline = fitLogistic(training, BASE_FEATURES, { minMatches: 1000, maxRows: 10000, seed: seed + ":base" });
      const candidate = fitLogistic(training, FULL_FEATURES, { minMatches: 1000, maxRows: 10000, seed: seed + ":serve" });
      if (!baseline || !candidate) {
        byYear[year] = { trainingMatches: training.length, evaluationMatches: evaluation.length, status: "model_fit_failed" };
        continue;
      }
      const yearMetrics = {
        baseline: { n: 0, brier: 0, logLoss: 0, correct: 0 },
        candidate: { n: 0, brier: 0, logLoss: 0, correct: 0 }
      };
      for (const row of evaluation) {
        addMetric(yearMetrics.baseline, predictLogistic(baseline, row), row.outcome);
        addMetric(yearMetrics.candidate, predictLogistic(candidate, row), row.outcome);
      }
      for (const key of ["baseline", "candidate"]) {
        for (const metric of ["n", "brier", "logLoss", "correct"]) total[key][metric] += yearMetrics[key][metric];
      }
      byYear[year] = {
        trainingMatches: training.length,
        trainingSample: baseline.trainingSample,
        evaluationMatches: evaluation.length,
        baseline: finishMetric(yearMetrics.baseline),
        candidate: finishMetric(yearMetrics.candidate),
        delta: {
          brier: Number((finishMetric(yearMetrics.candidate).brier - finishMetric(yearMetrics.baseline).brier).toFixed(6)),
          logLoss: Number((finishMetric(yearMetrics.candidate).logLoss - finishMetric(yearMetrics.baseline).logLoss).toFixed(6))
        }
      };
    }
    byWindow[label] = {
      tour,
      kFactor,
      trainingWindowYears: windowYears,
      rollingMatches: ROLLING_MATCHES,
      minimumPriorStatsMatches: MIN_PRIOR_STATS_MATCHES,
      featureRows: featureRows.filter(row => row.year >= EVAL_FROM && row.year <= EVAL_TO).length,
      comparison: finishComparison(total),
      byYear
    };
  }
  return byWindow;
}

async function main() {
  const args = process.argv.slice(2);
  const dataDir = args[0] || "/tmp/livetennis-pro-archive";
  const output = args[1] || "/tmp/livetennis-pro-serve-return-report.json";
  const files = (await readdir(dataDir)).filter(file => /^\d{4}\.csv\.gz$/.test(file)).sort();
  if (!files.length) throw new Error("No yearly archive CSV.gz packages found in " + dataDir);

  const allRows = [];
  for (const file of files) {
    const bytes = await readFile(join(dataDir, file));
    allRows.push(...parseCsv(gunzipSync(bytes).toString("utf8")));
  }
  const inventory = {
    source: "Live Tennis API PRO /history/packages?kind=archive",
    archiveFiles: files.length,
    sourceRows: allRows.length,
    completedMatchesByTour: { atp: 0, wta: 0 },
    statsMatchesByTour: { atp: 0, wta: 0 },
    rollingFeatureRowsByTour: { atp: 0, wta: 0 }
  };
  const reports = {};
  for (const tour of ["atp", "wta"]) {
    const matches = loadMatches(allRows, tour, inventory);
    const kFactor = tour === "atp" ? 32 : 80;
    const featureRows = runTour(matches, tour, kFactor);
    inventory.rollingFeatureRowsByTour[tour] = featureRows.length;
    reports[tour] = evaluate(featureRows, tour, kFactor);
  }
  const report = {
    schemaVersion: 1,
    researchOnly: true,
    source: inventory.source,
    evaluation: {
      from: String(EVAL_FROM),
      to: String(EVAL_TO),
      kFactorByTour: { atp: 32, wta: 80 },
      windows: ["all_history", "5_seasons", "3_seasons"],
      rollingStatsWindow: ROLLING_MATCHES,
      minimumPriorStatsMatches: MIN_PRIOR_STATS_MATCHES,
      baselineFeatures: BASE_FEATURES,
      addedFeatures: SERVE_FEATURES,
      population: "ATP/WTA main-tour levels only; Challenger and futures excluded"
    },
    inventory,
    reports,
    limitations: [
      "Archive event_date is the tournament START date, not the individual match date. All same-date matches use the same pre-date Elo and rolling-stat state; same-date outcomes are applied only after prediction.",
      "Rolling serve/return features use only previous completed matches with valid serve-stat records; a target match is excluded unless both players have at least five prior stats-bearing matches.",
      "Return points won are derived from the opponent's serve_points minus first_won and second_won. This derivation must be validated against the provider's denominators before production use.",
      "Only the last 20 stats-bearing matches are used, without surface filtering or recency decay.",
      "K=32 for ATP and K=80 for WTA are research settings selected from the preceding rank-age comparison; neither changes Production.",
      "This experiment uses historical match results and statistics, not bookmaker odds or betting ROI."
    ]
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    output,
    inventory,
    summary: Object.fromEntries(Object.entries(reports).map(([tour, windows]) => [
      tour, Object.fromEntries(Object.entries(windows).map(([window, result]) => [window, result.comparison]))
    ]))
  }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
