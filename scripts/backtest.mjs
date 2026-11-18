#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export function parseCsv(text) {
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
    if (closedQuote && ch !== "," && ch !== "\n" && ch !== "\r") {
      throw new SyntaxError(`Unexpected character after closing quote on line ${line}`);
    }
    if (ch === '"') {
      if (field.length !== 0 || closedQuote) throw new SyntaxError(`Unexpected quote in unquoted field on line ${line}`);
      quoted = true;
    } else if (ch === ",") pushField();
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
  const totals = Object.fromEntries(["elo", "surface", "form", "h2h", "combined"].map(name => [name, { n: 0, brier: 0, logLoss: 0, correct: 0, calibration: Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, wins: 0 })) }]));
  const byYear = new Map(), bySurfaceMetrics = new Map();
  const addMetric = (bucket, probability) => {
    bucket.n++;
    bucket.brier += (probability - 1) ** 2;
    bucket.logLoss -= Math.log(Math.max(1e-15, probability));
    bucket.correct += probability > 0.5 ? 1 : probability === 0.5 ? 0.5 : 0;
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
  const makeMetricBucket = () => Object.fromEntries(["elo", "surface", "form", "h2h", "combined"].map(name => [name, { n: 0, brier: 0, logLoss: 0, correct: 0, calibration: Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, wins: 0 })) }]));
  const addCalibration = (bucket, probability, favouriteWon) => {
    const index = Math.min(9, Math.max(0, Math.floor((probability - 0.5) * 20)));
    const bin = bucket.calibration[index];
    bin.n++;
    bin.predicted += probability;
    bin.wins += favouriteWon;
  };
  const formatCalibration = bucket => {
    const bins = bucket.calibration.map((bin, index) => ({
      range: `${(50 + index * 5)}-${(55 + index * 5)}%`,
      matches: bin.n,
      predicted: bin.n ? Number((bin.predicted / bin.n * 100).toFixed(2)) : null,
      actual: bin.n ? Number((bin.wins / bin.n * 100).toFixed(2)) : null,
      gap: bin.n ? Number(((bin.predicted / bin.n - bin.wins / bin.n) * 100).toFixed(2)) : null
    }));
    const used = bins.filter(bin => bin.matches);
    const ece = used.reduce((sum, bin) => sum + bin.matches * Math.abs(bin.gap) / 100, 0) / (bucket.n || 1);
    return { expectedCalibrationError: Number((ece * 100).toFixed(2)), bins };
  };
  const clean = matches.map(row => {
    const date = dateKey(row.tourney_date);
    const winner = String(row.winner_id ?? ""), loser = String(row.loser_id ?? "");
    const score = String(row.score ?? "");
    if (!date || !validId(winner) || !validId(loser) || winner === loser || /\b(?:W\/O|RET|ABD|DEF|DEFAULT)\b/i.test(score)) return null;
    const surface = ["Hard", "Clay", "Grass", "Carpet"].includes(row.surface) ? row.surface : null;
    return { date, winner, loser, surface, tourneyId: String(row.tourney_id ?? ""), matchNum: String(row.match_num ?? "") };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

  const seenMatches = new Set();
  const uniqueClean = clean.filter(match => {
    const key = match.tourneyId && match.matchNum
      ? match.tourneyId + ":" + match.matchNum
      : match.date + ":" + pairKey(match.winner, match.loser) + ":" + (match.surface ?? "unknown");
    if (seenMatches.has(key)) return false;
    seenMatches.add(key);
    return true;
  });

  let index = 0;
  while (index < uniqueClean.length) {
    const date = uniqueClean[index].date;
    const day = [];
    while (index < uniqueClean.length && uniqueClean[index].date === date) day.push(uniqueClean[index++]);

    const updates = [];
    for (const match of day) {
      const ra = overall.get(match.winner) ?? 1500;
      const rb = overall.get(match.loser) ?? 1500;
      const sA = match.surface ? bySurface.get(match.surface + ":" + match.winner) : null;
      const sB = match.surface ? bySurface.get(match.surface + ":" + match.loser) : null;
      const surfaceA = sA?.rating ?? ra, surfaceB = sB?.rating ?? rb;
      const useSurface = Boolean(match.surface && (sA?.count ?? 0) >= minSurfaceMatches && (sB?.count ?? 0) >= minSurfaceMatches);
      const historyA = form.get(match.winner) ?? [], historyB = form.get(match.loser) ?? [];
      const formA = (historyA.reduce((sum, item) => sum + (item.won ? 1 : 0), 0) + 2) / (historyA.length + 4);
      const formB = (historyB.reduce((sum, item) => sum + (item.won ? 1 : 0), 0) + 2) / (historyB.length + 4);
      const h = h2h.get(pairKey(match.winner, match.loser)) ?? { a: 0, b: 0 };
      const lowerIdWonDiff = h.a - h.b;
      const h2hDiff = (Number(match.winner) < Number(match.loser) ? lowerIdWonDiff : -lowerIdWonDiff) / (h.a + h.b + 4);
      const features = {
        elo: ra - rb,
        surface: useSurface ? 0.7 * (ra - rb) + 0.3 * (surfaceA - surfaceB) : ra - rb,
        form: (ra - rb) + 80 * (formA - formB),
        h2h: (ra - rb) + 60 * h2hDiff,
        combined: (ra - rb) + (useSurface ? 0.3 * ((surfaceA - surfaceB) - (ra - rb)) : 0) + 80 * (formA - formB) + 60 * h2hDiff
      };
      const insideEvaluationWindow = (!evaluationStart || date >= evaluationStart) && (!evaluationEnd || date <= evaluationEnd);
      if (insideEvaluationWindow) {
        const year = date.slice(0, 4);
        if (!byYear.has(year)) byYear.set(year, makeMetricBucket());
        const surfaceKey = match.surface ?? "Unknown";
        if (!bySurfaceMetrics.has(surfaceKey)) bySurfaceMetrics.set(surfaceKey, makeMetricBucket());
        for (const [name, delta] of Object.entries(features)) {
          const probability = sigmoid(1500 + delta, 1500);
          addMetric(totals[name], probability);
          addMetric(byYear.get(year)[name], probability);
          addMetric(bySurfaceMetrics.get(surfaceKey)[name], probability);
          const favouriteProbability = Math.max(probability, 1 - probability);
          const favouriteWon = probability > 0.5 ? 1 : probability < 0.5 ? 0 : 0.5;
          addCalibration(totals[name], favouriteProbability, favouriteWon);
          addCalibration(byYear.get(year)[name], favouriteProbability, favouriteWon);
          addCalibration(bySurfaceMetrics.get(surfaceKey)[name], favouriteProbability, favouriteWon);
        }
      }
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
  return {
    matches: uniqueClean.length,
    excluded: matches.length - clean.length,
    duplicateRows: clean.length - uniqueClean.length,
    unknownSurfaceMatches: uniqueClean.filter(match => match.surface == null).length,
    evaluationStart,
    evaluationEnd,
    evaluatedMatches,
    warmupMatches: evaluationStart ? uniqueClean.filter(match => match.date < evaluationStart).length : 0,
    metrics: formatMetrics(totals),
    calibration: Object.fromEntries(Object.entries(totals).map(([name, bucket]) => [name, formatCalibration(bucket)])),
    breakdowns: {
      byYear: Object.fromEntries([...byYear.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => [key, formatMetrics(bucket)])),
      bySurface: Object.fromEntries([...bySurfaceMetrics.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => [key, formatMetrics(bucket)]))
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
