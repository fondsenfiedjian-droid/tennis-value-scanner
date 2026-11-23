#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const MAIN_FILE = /^(atp|wta)_matches_(\d{4})\.csv$/i;
const LOWER_FILE = /^(atp|wta)_matches_(futures|qual_chall|qual_itf)_(\d{4})\.csv$/i;
const SURFACES = new Set(["Hard", "Clay", "Grass", "Carpet"]);
const validDate = value => {
  const s = String(value ?? "");
  if (!/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4)), m = Number(s.slice(4, 6)), d = Number(s.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? s : null;
};
const validId = value => /^\d+$/.test(String(value ?? "")) && Number(value) > 0;
const completedScore = (value, bestOf) => {
  const s = String(value ?? "").trim();
  if (!s || /\b(?:W\/O|RET|ABD|DEF|DEFAULT|CANC)\b/i.test(s)) return false;
  const sets = [...s.matchAll(/(\d{1,2})-(\d{1,2})/g)].filter(match => {
    const a = Number(match[1]), b = Number(match[2]);
    const high = Math.max(a, b), low = Math.min(a, b);
    return (high >= 6 && high - low >= 2) || (high === 7 && low === 6);
  }).length;
  return sets >= (Number(bestOf) === 5 ? 3 : 2);
};
const pairKey = (a, b) => Number(a) < Number(b) ? a + ":" + b : b + ":" + a;
const sigmoid = delta => 1 / (1 + 10 ** (-delta / 400));
const priority = { main: 0, qual_chall: 1, qual_itf: 2, futures: 3 };

export function normalizeTieredRows(files) {
  const rows = [], diagnostics = {
    sourceFiles: 0, sourceRows: 0, invalidDate: 0, invalidPlayers: 0,
    incompleteOrRetired: 0, exactDuplicateRows: 0, conflictingDuplicateGroups: 0
  };
  for (const file of files) {
    const name = basename(file.filename);
    const main = name.match(MAIN_FILE);
    const lower = name.match(LOWER_FILE);
    if (!main && !lower) throw new Error("Unexpected Sackmann match filename: " + name);
    const tour = (main?.[1] ?? lower[1]).toUpperCase();
    const sourceType = main ? "main" : lower[2].toLowerCase();
    diagnostics.sourceFiles++;
    const sourceRows = parseCsv(file.content);
    diagnostics.sourceRows += sourceRows.length;
    for (const row of sourceRows) {
      const date = validDate(row.tourney_date);
      if (!date) { diagnostics.invalidDate++; continue; }
      const winner = String(row.winner_id ?? "").trim();
      const loser = String(row.loser_id ?? "").trim();
      if (!validId(winner) || !validId(loser) || winner === loser) { diagnostics.invalidPlayers++; continue; }
      if (!completedScore(row.score, row.best_of)) { diagnostics.incompleteOrRetired++; continue; }
      const a = Number(winner) < Number(loser) ? winner : loser;
      const b = a === winner ? loser : winner;
      const surface = SURFACES.has(String(row.surface ?? "").trim()) ? String(row.surface).trim() : null;
      rows.push({
        date, tour, sourceType, winner, loser, player1: a, player2: b,
        surface, tourneyId: String(row.tourney_id ?? ""),
        matchNum: String(row.match_num ?? ""), round: String(row.round ?? ""),
        score: String(row.score ?? "").trim(), bestOf: String(row.best_of ?? "")
      });
    }
  }
  const groups = new Map();
  for (const row of rows) {
    const key = [row.tour, row.date, row.tourneyId, row.matchNum, pairKey(row.winner, row.loser), row.round].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const unique = [];
  for (const group of groups.values()) {
    const signature = row => JSON.stringify([row.winner, row.loser, row.score, row.surface, row.bestOf]);
    const signatures = new Set(group.map(signature));
    if (signatures.size > 1) { diagnostics.conflictingDuplicateGroups++; continue; }
    group.sort((a, b) => priority[a.sourceType] - priority[b.sourceType]);
    unique.push(group[0]);
    diagnostics.exactDuplicateRows += group.length - 1;
  }
  unique.sort((a, b) =>
    a.tour.localeCompare(b.tour) || a.date.localeCompare(b.date) ||
    a.tourneyId.localeCompare(b.tourneyId) || a.matchNum.localeCompare(b.matchNum) ||
    a.player1.localeCompare(b.player1) || a.player2.localeCompare(b.player2)
  );
  diagnostics.normalizedUniqueMatches = unique.length;
  diagnostics.mainMatches = unique.filter(row => row.sourceType === "main").length;
  diagnostics.lowerTierMatches = unique.length - diagnostics.mainMatches;
  return { rows: unique, diagnostics };
}

function metricBucket() {
  return { n: 0, brier: 0, logLoss: 0, correct: 0, bins: Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, wins: 0 })) };
}
function addMetric(bucket, probability, outcome) {
  const p = Math.min(1 - 1e-12, Math.max(1e-12, probability));
  bucket.n++;
  bucket.brier += (p - outcome) ** 2;
  bucket.logLoss -= outcome * Math.log(p) + (1 - outcome) * Math.log(1 - p);
  bucket.correct += p > 0.5 ? outcome : p < 0.5 ? 1 - outcome : 0.5;
  const favourite = Math.max(p, 1 - p);
  const favouriteWon = p > 0.5 ? outcome : p < 0.5 ? 1 - outcome : 0.5;
  const index = Math.min(9, Math.max(0, Math.floor((favourite - 0.5) * 20)));
  bucket.bins[index].n++;
  bucket.bins[index].predicted += favourite;
  bucket.bins[index].wins += favouriteWon;
}
function formatMetric(bucket) {
  const bins = bucket.bins.filter(bin => bin.n);
  const ece = bucket.n ? bins.reduce((sum, bin) => sum + bin.n * Math.abs(bin.predicted / bin.n - bin.wins / bin.n), 0) / bucket.n : null;
  return {
    matches: bucket.n,
    brier: bucket.n ? Number((bucket.brier / bucket.n).toFixed(6)) : null,
    logLoss: bucket.n ? Number((bucket.logLoss / bucket.n).toFixed(6)) : null,
    accuracyPct: bucket.n ? Number((bucket.correct / bucket.n * 100).toFixed(3)) : null,
    ecePct: ece == null ? null : Number((ece * 100).toFixed(3))
  };
}
function makeEvaluation() {
  return { baseline: metricBucket(), tierAware: metricBucket() };
}
function applyDayUpdates(ratings, matches, kForMatch) {
  const deltas = new Map();
  for (const match of matches) {
    const k = kForMatch(match);
    if (!(k > 0)) continue;
    const winnerRating = ratings.get(match.winner) ?? 1500;
    const loserRating = ratings.get(match.loser) ?? 1500;
    const change = k * (1 - sigmoid(winnerRating - loserRating));
    deltas.set(match.winner, (deltas.get(match.winner) ?? 0) + change);
    deltas.set(match.loser, (deltas.get(match.loser) ?? 0) - change);
  }
  for (const [id, delta] of deltas) ratings.set(id, (ratings.get(id) ?? 1500) + delta);
}

export function runTierAwareEloResearch(rows, options = {}) {
  const mainK = Number.isFinite(options.mainK) ? options.mainK : 32;
  const lowerKs = Array.isArray(options.lowerKs) && options.lowerKs.length ? options.lowerKs : [8, 16, 24, 32];
  const evaluationStart = validDate(options.from ?? "20000101");
  const evaluationEnd = validDate(options.to ?? "20260525");
  if (!evaluationStart || !evaluationEnd || evaluationStart > evaluationEnd) throw new RangeError("Invalid evaluation date window");
  const report = {};
  for (const tour of ["ATP", "WTA"]) {
    const tourRows = rows.filter(row => row.tour === tour);
    const byDay = new Map();
    for (const row of tourRows) {
      if (!byDay.has(row.date)) byDay.set(row.date, []);
      byDay.get(row.date).push(row);
    }
    const dates = [...byDay.keys()].sort();
    const baselineRatings = new Map();
    const tierRatingsByK = new Map(lowerKs.map(k => [k, new Map()]));
    const lowerHistory = new Map();
    const summaries = new Map(lowerKs.map(k => [k, {
      overall: makeEvaluation(), byYear: new Map(), bySurface: new Map(),
      exposure: new Map([["neither", makeEvaluation()], ["one", makeEvaluation()], ["both", makeEvaluation()]])
    }]));
    let evaluatedMainMatches = 0, lowerMatchesBeforeEvaluation = 0;
    for (const date of dates) {
      const day = byDay.get(date);
      const mainToday = day.filter(row => row.sourceType === "main");
      const lowerToday = day.filter(row => row.sourceType !== "main");
      const predictions = [];
      if (date >= evaluationStart && date <= evaluationEnd) {
        for (const match of mainToday) {
          const outcome = match.winner === match.player1 ? 1 : 0;
          const baseDelta = (baselineRatings.get(match.player1) ?? 1500) - (baselineRatings.get(match.player2) ?? 1500);
          const baseProbability = sigmoid(baseDelta);
          const exposureA = lowerHistory.get(match.player1) ?? 0;
          const exposureB = lowerHistory.get(match.player2) ?? 0;
          const exposure = exposureA > 0 && exposureB > 0 ? "both" : exposureA > 0 || exposureB > 0 ? "one" : "neither";
          predictions.push({ match, outcome, baseProbability, exposure });
        }
      }
      if (predictions.length) evaluatedMainMatches += predictions.length;
      for (const k of lowerKs) {
        const ratings = tierRatingsByK.get(k);
        const summary = summaries.get(k);
        for (const item of predictions) {
          const delta = (ratings.get(item.match.player1) ?? 1500) - (ratings.get(item.match.player2) ?? 1500);
          const probability = sigmoid(delta);
          const year = date.slice(0, 4);
          const surface = item.match.surface ?? "Unknown";
          if (!summary.byYear.has(year)) summary.byYear.set(year, makeEvaluation());
          if (!summary.bySurface.has(surface)) summary.bySurface.set(surface, makeEvaluation());
          const exposureBucket = summary.exposure.get(item.exposure);
          addMetric(summary.overall.baseline, item.baseProbability, item.outcome);
          addMetric(summary.overall.tierAware, probability, item.outcome);
          addMetric(summary.byYear.get(year).baseline, item.baseProbability, item.outcome);
          addMetric(summary.byYear.get(year).tierAware, probability, item.outcome);
          addMetric(summary.bySurface.get(surface).baseline, item.baseProbability, item.outcome);
          addMetric(summary.bySurface.get(surface).tierAware, probability, item.outcome);
          addMetric(exposureBucket.baseline, item.baseProbability, item.outcome);
          addMetric(exposureBucket.tierAware, probability, item.outcome);
        }
      }
      // Same-day matches all use the pre-date state; all updates are applied only after predictions.
      applyDayUpdates(baselineRatings, mainToday, () => mainK);
      for (const k of lowerKs) {
        applyDayUpdates(tierRatingsByK.get(k), day, match => match.sourceType === "main" ? mainK : k);
      }
      for (const match of lowerToday) {
        lowerHistory.set(match.winner, (lowerHistory.get(match.winner) ?? 0) + 1);
        lowerHistory.set(match.loser, (lowerHistory.get(match.loser) ?? 0) + 1);
        if (date < evaluationStart) lowerMatchesBeforeEvaluation++;
      }
    }
    report[tour] = {
      mainK, lowerTierK: Object.fromEntries(lowerKs.map(k => [k, {
        overall: {
          baseline: formatMetric(summaries.get(k).overall.baseline),
          tierAware: formatMetric(summaries.get(k).overall.tierAware)
        },
        byYear: Object.fromEntries([...summaries.get(k).byYear].map(([year, bucket]) => [year, {
          baseline: formatMetric(bucket.baseline), tierAware: formatMetric(bucket.tierAware)
        }])),
        bySurface: Object.fromEntries([...summaries.get(k).bySurface].map(([surface, bucket]) => [surface, {
          baseline: formatMetric(bucket.baseline), tierAware: formatMetric(bucket.tierAware)
        }])),
        exposure: Object.fromEntries([...summaries.get(k).exposure].map(([group, bucket]) => [group, {
          baseline: formatMetric(bucket.baseline), tierAware: formatMetric(bucket.tierAware)
        }]))
      }])),
      evaluationMatches: evaluatedMainMatches,
      lowerTierMatchesBeforeEvaluation: lowerMatchesBeforeEvaluation,
      evaluationWindow: { from: evaluationStart, to: evaluationEnd }
    };
  }
  return {
    schemaVersion: 1,
    purpose: "Research-only comparison of main-tour Elo against a shared tier-aware Elo that also learns from lower-tier results.",
    source: "Jeff Sackmann ATP/WTA archive mirror, pinned separately by workflow",
    license: "CC BY-NC-SA 4.0; attribution required; non-commercial only; share-alike",
    updateProtocol: "Predictions use only pre-date ratings. Same-day matches are predicted from one shared pre-date state and updates are applied after all matches on that date.",
    baseline: "Main-tour matches only, fixed main-tour K.",
    candidate: "Main-tour K remains fixed; lower-tier matches update the shared player rating using the tested lower-tier K.",
    warnings: [
      "This is an aggregate research experiment, not a production model or betting ROI test.",
      "ATP and WTA are evaluated separately; player ID namespaces are never mixed.",
      "The candidate is a single shared Elo stream with a lower-tier update weight. It is not a separate tier rating or a full hierarchical model.",
      "Do not change production K or prediction logic without independent-period replication and calibration review."
    ],
    diagnostics: options.diagnostics ?? null,
    results: report
  };
}

async function main() {
  const args = process.argv.slice(2), options = {}, files = [];
  for (let i = 0; i < args.length; i++) {
    if (["--input-dir", "--from", "--to", "--main-k", "--lower-k", "--out"].includes(args[i])) {
      const key = args[i].slice(2), value = args[++i];
      if (!value) throw new Error("Missing value for " + args[i - 1]);
      options[key] = value;
    } else if (args[i].startsWith("--")) throw new Error("Unknown option: " + args[i]);
    else files.push(args[i]);
  }
  if (options["input-dir"]) {
    const dir = options["input-dir"];
    const names = (await readdir(dir)).filter(name => MAIN_FILE.test(name) || LOWER_FILE.test(name)).sort();
    if (!names.length) throw new Error("No main-tour or lower-tier Sackmann CSV files found");
    for (const name of names) files.push(join(dir, name));
  }
  if (!files.length) throw new Error("Usage: node scripts/sackmann-tier-aware-elo-research.mjs --input-dir DIR [--from YYYYMMDD] [--to YYYYMMDD] [--main-k 32] [--lower-k 8,16,24,32] [--out report.json]");
  const inputs = [];
  for (const file of files) inputs.push({ filename: basename(file), content: await readFile(file, "utf8") });
  const normalized = normalizeTieredRows(inputs);
  const lowerKs = String(options["lower-k"] ?? "8,16,24,32").split(",").map(Number);
  if (lowerKs.some(value => !Number.isFinite(value) || value < 0 || value > 100)) throw new RangeError("--lower-k values must be between 0 and 100");
  const report = runTierAwareEloResearch(normalized.rows, {
    mainK: Number(options["main-k"] ?? 32), lowerKs,
    from: options.from ?? "20000101", to: options.to ?? "20260525",
    diagnostics: normalized.diagnostics
  });
  const json = JSON.stringify(report, null, 2) + "\n";
  if (options.out) await writeFile(options.out, json, "utf8");
  console.log(json);
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  main().catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
