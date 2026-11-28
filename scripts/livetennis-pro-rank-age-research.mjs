#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parseCsv } from "./backtest.mjs";
import { runRankAgeWalkForward } from "./sackmann-rank-age-research.mjs";

const validDate = value => {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + "T00:00:00.000Z");
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text
    ? null : text.replaceAll("-", "");
};
const validId = value => /^\d+$/.test(String(value ?? "")) && Number(value) > 0;
const MAIN_LEVELS = {
  atp: new Set(["G", "M", "A", "F", "D", "O"]),
  // Historical WTA source codes: Premier Mandatory, Premier, International,
  // Finals and legacy Tier I-V, in addition to Slams/team/Olympics.
  wta: new Set(["G", "PM", "P", "I", "W", "F", "D", "O", "T1", "T2", "T3", "T4", "T5", "A", "M"])
};

function parseStats(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && parsed.winner && parsed.loser ? parsed : null;
  } catch {
    return null;
  }
}

function toResearchRow(row) {
  const date = validDate(row.event_date);
  const winner = String(row.winner_player_id ?? "");
  const loser = String(row.loser_player_id ?? "");
  if (row.outcome !== "completed" || !date || !validId(winner) || !validId(loser) || winner === loser) {
    return null;
  }
  const sourceId = String(row.source_id ?? "");
  const parts = sourceId.split(":");
  const matchNum = parts.length > 1 ? parts.at(-1) : sourceId;
  const tournamentId = parts.length > 1
    ? parts.slice(0, -1).join(":")
    : String(row.tour ?? "") + ":" + date + ":" + String(row.tournament ?? "");
  return {
    tourney_date: date,
    tourney_id: tournamentId,
    match_num: matchNum || sourceId,
    round: String(row.round ?? ""),
    winner_id: winner,
    loser_id: loser,
    winner_rank: row.winner_rank ?? "",
    loser_rank: row.loser_rank ?? "",
    winner_age: row.winner_age ?? "",
    loser_age: row.loser_age ?? "",
    surface: String(row.surface ?? "").trim().toLowerCase()
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    dataDir: args[0] || "/tmp/livetennis-pro-archive",
    output: args[1] || "/tmp/livetennis-pro-rank-age-report.json",
    evaluationStart: "20130101",
    evaluationEnd: "20221231",
    minTrainingMatches: 1000,
    maxTrainingRows: 20000
  };
  const files = (await readdir(options.dataDir))
    .filter(file => /^\d{4}\.csv\.gz$/.test(file))
    .sort();
  if (!files.length) throw new Error("No yearly archive CSV.gz packages found in " + options.dataDir);

  const rowsByTour = { atp: [], wta: [] };
  const inventory = {
    source: "Live Tennis API PRO /history/packages?kind=archive",
    archiveFiles: files,
    sourceRows: 0,
    completedRows: 0,
    skippedNonMainLevels: 0,
    skippedInvalidOrNonCompleted: 0,
    serveStatsRows: 0,
    rankPairs: 0,
    agePairs: 0,
    surfaceRows: 0,
    byTour: { atp: 0, wta: 0 },
    byLevel: {},
    byTourLevel: { atp: {}, wta: {} }
  };

  for (const file of files) {
    const bytes = await readFile(join(options.dataDir, file));
    const csv = gunzipSync(bytes).toString("utf8");
    const sourceRows = parseCsv(csv);
    inventory.sourceRows += sourceRows.length;
    for (const row of sourceRows) {
      const tour = String(row.tour ?? "").toLowerCase();
      if (tour !== "atp" && tour !== "wta") continue;
      const level = String(row.level ?? "").toUpperCase();
      inventory.byLevel[level || "unknown"] = (inventory.byLevel[level || "unknown"] || 0) + 1;
      inventory.byTourLevel[tour][level || "unknown"] = (inventory.byTourLevel[tour][level || "unknown"] || 0) + 1;
      if (!MAIN_LEVELS[tour].has(level)) {
        inventory.skippedNonMainLevels++;
        continue;
      }
      if (row.outcome !== "completed") {
        inventory.skippedInvalidOrNonCompleted++;
        continue;
      }
      inventory.completedRows++;
      if (parseStats(row.stats)) inventory.serveStatsRows++;
      if (row.winner_rank && row.loser_rank) inventory.rankPairs++;
      if (row.winner_age && row.loser_age) inventory.agePairs++;
      if (row.surface) inventory.surfaceRows++;
      const normalized = toResearchRow(row);
      if (!normalized) {
        inventory.skippedInvalidOrNonCompleted++;
        continue;
      }
      rowsByTour[tour].push(normalized);
      inventory.byTour[tour]++;
    }
    process.stderr.write("Loaded " + sourceRows.length + " archive rows from " + basename(file) + "\n");
  }

  const reports = {};
  const kFactors = [32, 80];
  for (const tour of ["atp", "wta"]) {
    reports[tour] = {};
    for (const windowYears of [null, 5, 3]) {
      const label = windowYears === null ? "all_history" : String(windowYears) + "_seasons";
      reports[tour][label] = {};
      for (const kFactor of kFactors) {
        reports[tour][label]["k" + kFactor] = runRankAgeWalkForward(rowsByTour[tour], {
          tour,
          evaluationStart: options.evaluationStart,
          evaluationEnd: options.evaluationEnd,
          kFactor,
          trainingWindowYears: windowYears,
          minTrainingMatches: options.minTrainingMatches,
          maxTrainingRows: options.maxTrainingRows
        });
      }
    }
  }

  const report = {
    schemaVersion: 1,
    researchOnly: true,
    source: inventory.source,
    evaluation: {
      from: options.evaluationStart,
      to: options.evaluationEnd,
      kFactors: [32, 80],
      windows: ["all_history", "5_seasons", "3_seasons"],
      population: "ATP main-tour levels G, M, A, F, D, O; WTA main-tour levels G, PM, P, I, W, F, D, O and legacy Tier I-V; Challenger and futures excluded from this first comparison"
    },
    inventory,
    reports,
    limitations: [
      "Archive event_date is the tournament START date, not the individual match date. All matches sharing a date are predicted from the same pre-date Elo state; same-date results are applied only after prediction.",
      "Archive rank and age values are used as published at the time of the match; their exact timestamp relative to each individual match is not available.",
      "The initial model comparison uses only completed results and excludes retirements, walkovers, defaults, abandoned and unresolved rows.",
      "Challenger and futures levels are excluded from this first ATP/WTA main-tour experiment and require separate tier-aware rating research.",
      "Per-match serve statistics are inventoried but are not yet used as predictors; rolling pre-match serve/return features need a separate chronological implementation.",
      "This report is exploratory and does not change Production probabilities or betting rules."
    ]
  };
  await writeFile(options.output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    output: options.output,
    archiveFiles: files.length,
    sourceRows: inventory.sourceRows,
    completedMainTourRows: inventory.byTour.atp + inventory.byTour.wta,
    atp: inventory.byTour.atp,
    wta: inventory.byTour.wta,
    serveStatsRows: inventory.serveStatsRows,
    summary: Object.fromEntries(Object.entries(reports).map(([tour, windows]) => [
      tour, Object.fromEntries(Object.entries(windows).map(([window, byK]) => [
        window, Object.fromEntries(Object.entries(byK).map(([k, result]) => [k, result.summary]))
      ]))
    ]))
  }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
