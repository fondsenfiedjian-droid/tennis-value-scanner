#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(value => value !== "")) rows.push(row);
      row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some(value => value !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows.shift();
  return rows.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ""])));
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
  const overall = new Map(), bySurface = new Map(), form = new Map(), h2h = new Map();
  const totals = Object.fromEntries(["elo", "surface", "form", "h2h", "combined"].map(name => [name, { n: 0, brier: 0, logLoss: 0, correct: 0 }]));
  const clean = matches.map(row => {
    const date = dateKey(row.tourney_date);
    const winner = String(row.winner_id ?? ""), loser = String(row.loser_id ?? "");
    const score = String(row.score ?? "");
    if (!date || !validId(winner) || !validId(loser) || winner === loser || /\b(?:W\/O|RET|ABD|DEF|DEFAULT)\b/i.test(score)) return null;
    const surface = ["Hard", "Clay", "Grass", "Carpet"].includes(row.surface) ? row.surface : null;
    return { date, winner, loser, surface };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

  let index = 0;
  while (index < clean.length) {
    const date = clean[index].date;
    const day = [];
    while (index < clean.length && clean[index].date === date) day.push(clean[index++]);

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
      for (const [name, delta] of Object.entries(features)) {
        const probability = sigmoid(1500 + delta, 1500);
        const metric = totals[name];
        metric.n++;
        metric.brier += (probability - 1) ** 2;
        metric.logLoss -= Math.log(Math.max(1e-15, probability));
        if (probability >= 0.5) metric.correct++;
      }
      updates.push(match);
    }

    // Update state only after every match on this date has been predicted.
    for (const match of updates) {
      const winnerRating = overall.get(match.winner) ?? 1500;
      const loserRating = overall.get(match.loser) ?? 1500;
      const expected = sigmoid(winnerRating, loserRating);
      overall.set(match.winner, winnerRating + k * (1 - expected));
      overall.set(match.loser, loserRating - k * (1 - expected));

      if (match.surface) {
        const keyW = match.surface + ":" + match.winner, keyL = match.surface + ":" + match.loser;
        const currentW = bySurface.get(keyW) ?? { rating: 1500, count: 0 };
        const currentL = bySurface.get(keyL) ?? { rating: 1500, count: 0 };
        const surfaceExpected = sigmoid(currentW.rating, currentL.rating);
        bySurface.set(keyW, { rating: currentW.rating + k * (1 - surfaceExpected), count: currentW.count + 1 });
        bySurface.set(keyL, { rating: currentL.rating - k * (1 - surfaceExpected), count: currentL.count + 1 });
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

  return {
    matches: clean.length,
    excluded: matches.length - clean.length,
    metrics: Object.fromEntries(Object.entries(totals).map(([name, value]) => [name, {
      matches: value.n,
      brier: value.n ? Number((value.brier / value.n).toFixed(5)) : null,
      logLoss: value.n ? Number((value.logLoss / value.n).toFixed(5)) : null,
      accuracy: value.n ? Number((value.correct / value.n * 100).toFixed(2)) : null
    }]))
  };
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("Usage: node scripts/backtest.mjs path/to/atp_matches_2025.csv [more CSV files...]");
    process.exitCode = 2;
    return;
  }
  const all = [];
  for (const file of files) {
    const rows = parseCsv(await readFile(file, "utf8"));
    all.push(...rows);
    console.error(`Loaded ${rows.length} rows from ${basename(file)}`);
  }
  const report = runBacktest(all);
  console.log(JSON.stringify(report, null, 2));
  console.error("Lower Brier/log-loss is better. Accuracy is secondary; this is not ROI.");
  console.error("The feature weights are exploratory candidates, not production model settings.");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
