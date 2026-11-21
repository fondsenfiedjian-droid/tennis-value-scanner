#!/usr/bin/env node
/**
 * Research-only walk-forward comparison of Elo vs Elo + weekly ranking.
 * Uses only snapshots strictly earlier than tournament_date and excludes stale snapshots.
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";
import { runRankAgeWalkForward } from "./sackmann-rank-age-research.mjs";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function ageDays(earlier, later) {
  const a = Date.UTC(+earlier.slice(0,4), +earlier.slice(4,6)-1, +earlier.slice(6,8));
  const b = Date.UTC(+later.slice(0,4), +later.slice(4,6)-1, +later.slice(6,8));
  return Math.floor((b-a)/86400000);
}
async function main() {
  const tour = arg("--tour");
  const input = process.argv.at(-1);
  const maxAge = Number(arg("--max-rank-age-days", "45"));
  const from = arg("--from", "20000101");
  const to = arg("--to", "20261231");
  const k = Number(arg("--k", "32"));
  const out = arg("--out");
  if (!["atp","wta"].includes(tour) || !input || input.startsWith("--")) {
    throw new Error("Usage: node scripts/sackmann-weekly-rank-research.mjs --tour atp|wta [--max-rank-age-days 45] [--from YYYYMMDD] [--to YYYYMMDD] [--k 32] [--out report.json] enriched-matches.csv");
  }
  if (!Number.isInteger(maxAge) || maxAge < 0) throw new Error("--max-rank-age-days must be a non-negative integer");
  const rows = parseCsv(await readFile(input, "utf8"));
  let sameDayExcluded = 0, stalePlayerSnapshots = 0, missingRankPlayers = 0;
  const prepared = rows.map(row => {
    const date = String(row.tourney_date ?? "");
    function rank(prefix) {
      const rankValue = row[prefix + "_weekly_rank"];
      const rankDate = String(row[prefix + "_weekly_rank_date"] ?? "");
      if (!/^\d{8}$/.test(date) || !/^\d{8}$/.test(rankDate) || !rankValue) {
        missingRankPlayers++;
        return "";
      }
      if (rankDate >= date) {
        if (rankDate === date) sameDayExcluded++;
        missingRankPlayers++;
        return "";
      }
      if (ageDays(rankDate, date) > maxAge) {
        stalePlayerSnapshots++;
        missingRankPlayers++;
        return "";
      }
      return rankValue;
    }
    return { ...row, winner_rank: rank("winner"), loser_rank: rank("loser") };
  });
  const report = runRankAgeWalkForward(prepared, {
    tour, evaluationStart: from, evaluationEnd: to, kFactor: k
  });
  report.rankSource = "weekly rankings joined by exact ID; strictly earlier than tournament date";
  report.maxRankAgeDays = maxAge;
  report.sameDayPlayerSnapshotsExcluded = sameDayExcluded;
  report.stalePlayerSnapshotsExcluded = stalePlayerSnapshots;
  report.missingRankPlayerObservations = missingRankPlayers;
  report.input = input;
  report.timingPolicy = "ranking_date < tourney_date; snapshots older than maxRankAgeDays excluded";
  const json = JSON.stringify(report, null, 2) + "\n";
  if (out) await writeFile(out, json, "utf8");
  console.log(json);
}
main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
