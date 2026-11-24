#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseCsv, runBacktest } from "./backtest.mjs";

const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const K_FACTORS = [32, 80];
const EVALUATION_START = "20250101";
const ATTRIBUTION = "Valuebetennis, Tennis results and odds since 2021, https://www.valuebetennis.com/en/donnees.htm (CC BY 4.0)";

function dateKey(value) {
  const match = String(value ?? "").match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  if (!match) return null;
  const key = match.slice(1).join("");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10).replaceAll("-", "") === key ? key : null;
}

function surfaceName(value) {
  const s = String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["dur", "hard", "indoor hard", "indoor_hard"].includes(s)) return "Hard";
  if (["terre battue", "clay", "terre"].includes(s)) return "Clay";
  if (["gazon", "grass"].includes(s)) return "Grass";
  if (["moquette interieur", "carpet", "moquette"].includes(s)) return "Carpet";
  return null;
}

function toBacktestRows(rows, tour) {
  const seen = new Set();
  const output = [];
  for (const row of rows) {
    if (String(row.genre ?? "").trim().toLowerCase() !== tour) continue;
    const date = dateKey(row.date);
    const p1 = String(row.joueur1_id ?? "").trim();
    const p2 = String(row.joueur2_id ?? "").trim();
    const winner = String(row.vainqueur_id ?? "").trim();
    if (!date || !/^\d+$/.test(p1) || !/^\d+$/.test(p2) || p1 === p2 || ![p1, p2].includes(winner)) continue;
    const matchId = String(row.match_id ?? "").trim();
    const key = matchId || [date, [p1, p2].sort().join(":"), row.tournoi_id, row.tour].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const loser = winner === p1 ? p2 : p1;
    output.push({
      tourney_date: date,
      player1_id: p1,
      player2_id: p2,
      player1_name: String(row.joueur1 ?? "").trim(),
      player2_name: String(row.joueur2 ?? "").trim(),
      winner_id: winner,
      loser_id: loser,
      surface: surfaceName(row.surface),
      score: String(row.score ?? ""),
      tourney_id: String(row.tournoi_id ?? row.tournoi ?? ""),
      match_num: matchId || String(row.tour ?? ""),
      durationMinutes: row.duree_min,
      sourceOdds: {
        opening: [row.cote1_ouverture, row.cote2_ouverture],
        closing: [row.cote1_cloture, row.cote2_cloture]
      }
    });
  }
  return output;
}

function calculateRatings(matches, kFactor) {
  const overall = new Map();
  const surface = new Map();
  const counts = new Map();
  const lastPlayed = new Map();
  const names = new Map();
  const grouped = new Map();
  for (const m of matches) {
    names.set(m.player1_id, m.player1_name);
    names.set(m.player2_id, m.player2_name);
    if (!grouped.has(m.tourney_date)) grouped.set(m.tourney_date, []);
    grouped.get(m.tourney_date).push(m);
  }
  const getRating = (map, key) => map.get(key)?.rating ?? map.get(key) ?? 1500;
  for (const date of [...grouped.keys()].sort()) {
    const day = grouped.get(date);
    const overallDelta = new Map();
    const surfaceDelta = new Map();
    for (const m of day) {
      const winnerRating = getRating(overall, m.winner_id);
      const loserRating = getRating(overall, m.loser_id);
      const expected = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
      overallDelta.set(m.winner_id, (overallDelta.get(m.winner_id) ?? 0) + kFactor * (1 - expected));
      overallDelta.set(m.loser_id, (overallDelta.get(m.loser_id) ?? 0) - kFactor * (1 - expected));
      if (m.surface) {
        const wk = m.surface + ":" + m.winner_id;
        const lk = m.surface + ":" + m.loser_id;
        const wr = getRating(surface, wk), lr = getRating(surface, lk);
        const e = 1 / (1 + 10 ** ((lr - wr) / 400));
        surfaceDelta.set(wk, (surfaceDelta.get(wk) ?? 0) + kFactor * (1 - e));
        surfaceDelta.set(lk, (surfaceDelta.get(lk) ?? 0) - kFactor * (1 - e));
      }
    }
    for (const [id, delta] of overallDelta) overall.set(id, getRating(overall, id) + delta);
    for (const [key, delta] of surfaceDelta) {
      const old = surface.get(key) ?? { rating: 1500, matches: 0 };
      surface.set(key, { rating: old.rating + delta, matches: old.matches });
    }
    for (const m of day) {
      for (const id of [m.winner_id, m.loser_id]) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        lastPlayed.set(id, date);
      }
      if (m.surface) {
        for (const id of [m.winner_id, m.loser_id]) {
          const key = m.surface + ":" + id;
          const old = surface.get(key) ?? { rating: 1500, matches: 0 };
          surface.set(key, { ...old, matches: old.matches + 1 });
        }
      }
    }
  }
  return { overall, surface, counts, lastPlayed, names };
}

async function main() {
  const rows = [];
  for (const year of YEARS) {
    const path = `data/valuebetennis-matchs-${year}.csv`;
    const csv = await readFile(path, "utf8");
    const parsed = parseCsv(csv, { delimiter: ";" });
    if (!parsed.length || !("joueur1_id" in parsed[0]) || !("vainqueur_id" in parsed[0])) {
      throw new Error(`Unexpected Valuebetennis CSV schema in ${path}`);
    }
    rows.push(...parsed);
    console.log(`Loaded ${parsed.length} rows from ${path}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: ATTRIBUTION,
    evaluationStart: EVALUATION_START,
    note: "Research/preview output only. K=32 is the conservative baseline; K=80 remains a candidate until walk-forward results are reviewed. Ratings are not production probabilities.",
    tours: {}
  };

  for (const tour of ["atp", "wta"]) {
    const matches = toBacktestRows(rows, tour).sort((a, b) =>
      a.tourney_date.localeCompare(b.tourney_date) ||
      a.tourney_id.localeCompare(b.tourney_id) ||
      a.match_num.localeCompare(b.match_num)
    );
    if (!matches.length) { const sample = rows.find(row => String(row.genre ?? "").trim().toLowerCase() === tour); throw new Error(`No valid ${tour.toUpperCase()} matches found; sample source row: ${JSON.stringify(sample)}`); }
    report.tours[tour] = { inputMatches: matches.length, candidates: {}, snapshots: {} };
    for (const k of K_FACTORS) {
      const backtest = runBacktest(matches, {
        kFactor: k,
        evaluationStart: EVALUATION_START,
        includePredictions: false
      });
      const state = calculateRatings(matches, k);
      const players = [...state.overall.entries()]
        .map(([id, rating]) => ({
          playerId: id,
          playerName: state.names.get(id) ?? null,
          rating: Number(rating.toFixed(2)),
          matches: state.counts.get(id) ?? 0,
          lastPlayed: state.lastPlayed.get(id) ?? null,
          surfaceRatings: Object.fromEntries(["Hard", "Clay", "Grass", "Carpet"].flatMap(s => {
            const value = state.surface.get(s + ":" + id);
            return value && value.matches >= 5
              ? [[s, { rating: Number(value.rating.toFixed(2)), matches: value.matches }]]
              : [];
          }))
        }))
        .sort((a, b) => a.playerId.localeCompare(b.playerId));
      report.tours[tour].candidates[`k${k}`] = {
        evaluatedMatches: backtest.evaluatedMatches,
        warmupMatches: backtest.warmupMatches,
        metrics: backtest.metrics,
        calibration: backtest.calibration,
        calibrationValidation: backtest.calibrationValidation
      };
      report.tours[tour].snapshots[`k${k}`] = {
        asOf: matches.at(-1).tourney_date,
        playerCount: players.length,
        players
      };
    }
  }

  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/player-elo-research.json", JSON.stringify(report));
  await writeFile("artifacts/player-elo-research-summary.json", JSON.stringify({
    generatedAt: report.generatedAt,
    source: report.source,
    evaluationStart: report.evaluationStart,
    tours: Object.fromEntries(Object.entries(report.tours).map(([tour, value]) => [tour, {
      inputMatches: value.inputMatches,
      candidates: Object.fromEntries(Object.entries(value.candidates).map(([k, v]) => [k, {
        evaluatedMatches: v.evaluatedMatches,
        warmupMatches: v.warmupMatches,
        metrics: v.metrics,
        calibrationValidation: v.calibrationValidation
      }])),
      snapshotPlayerCounts: Object.fromEntries(Object.entries(value.snapshots).map(([k, v]) => [k, v.playerCount]))
    }]))
  }, null, 2));
  console.log("Research artifacts written; no production endpoint or app data was changed.");
}

await main();
