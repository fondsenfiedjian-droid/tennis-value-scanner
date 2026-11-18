#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";

const number = value => Number(value);
const timestamp = value => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const validOdds = value => Number.isFinite(value) && value > 1 && value <= 1000;
const noVig = (oddsA, oddsB) => {
  const rawA = 1 / oddsA, rawB = 1 / oddsB;
  const total = rawA + rawB;
  return { a: rawA / total, b: rawB / total, overround: (total - 1) * 100 };
};

export function adaptScannerArchiveRows(rows) {
  const groups = new Map();
  let ignored = 0;
  for (const row of rows) {
    const outcome = String(row.resultOutcome ?? "").toLowerCase();
    const winnerNumber = Number(row.resultWinner);
    const captured = Number(row.capturedAt);
    const start = timestamp(row.matchDate);
    const side = String(row.side ?? "").toUpperCase();
    const odds = number(row.odds);
    const probability = number(row.probability);
    const id = String(row.matchId || row.matchKey || "").trim();
    if (outcome !== "completed" || ![1, 2].includes(winnerNumber) || !id ||
        start === null || !Number.isFinite(captured) || captured <= 0 ||
        !["A", "B"].includes(side) || !validOdds(odds) ||
        !Number.isFinite(probability) || probability <= 0 || probability >= 100) {
      ignored++;
      continue;
    }
    const key = id + "|" + captured;
    if (!groups.has(key)) groups.set(key, { id, start, captured, winner: winnerNumber === 1 ? "A" : "B", sides: {} });
    const group = groups.get(key);
    if (group.start !== start || group.winner !== (winnerNumber === 1 ? "A" : "B")) {
      throw new Error("Conflicting result or match date in archive for " + id);
    }
    if (group.sides[side]) {
      const previous = group.sides[side];
      if (previous.odds !== odds || previous.probability !== probability) {
        throw new Error("Conflicting duplicate side snapshot in archive for " + id);
      }
      continue;
    }
    group.sides[side] = { odds, probability: probability / 100, player: String(row.player ?? "").trim() };
  }
  const adapted = [];
  for (const group of groups.values()) {
    const a = group.sides.A, b = group.sides.B;
    if (!a || !b || !a.player || !b.player || a.player === b.player) { ignored++; continue; }
    adapted.push({
      match_id: group.id,
      match_start: new Date(group.start).toISOString(),
      odds_captured_at: new Date(group.captured).toISOString(),
      player_a: a.player,
      player_b: b.player,
      odds_a: a.odds,
      odds_b: b.odds,
      probability_a: a.probability,
      winner: group.winner
    });
  }
  return { rows: adapted, ignored };
}

export function runOddsBacktest(rows, options = {}) {
  const minEv = Number.isFinite(options.minEv) ? options.minEv : 0.03;
  const minOdds = Number.isFinite(options.minOdds) ? options.minOdds : 1.9;
  const stake = Number.isFinite(options.stake) && options.stake > 0 ? options.stake : 1;
  if (minEv < 0 || minEv > 10) throw new RangeError("minEv must be between 0 and 10");
  if (minOdds <= 1 || minOdds > 1000) throw new RangeError("minOdds must be greater than 1 and no greater than 1000");
  if (!(stake > 0)) throw new RangeError("stake must be positive");

  const matches = new Map();
  let rejectedSnapshots = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const id = String(row.match_id ?? "").trim();
    const start = timestamp(row.match_start);
    const captured = timestamp(row.odds_captured_at);
    const oddsA = number(row.odds_a), oddsB = number(row.odds_b);
    const probabilityA = number(row.probability_a);
    const winner = String(row.winner ?? "").trim().toUpperCase();
    if (!id || start === null || captured === null || !validOdds(oddsA) || !validOdds(oddsB) ||
        !Number.isFinite(probabilityA) || probabilityA <= 0 || probabilityA >= 1 ||
        !["A", "B"].includes(winner) || captured > start) {
      rejectedSnapshots++;
      continue;
    }
    const playerA = String(row.player_a ?? "").trim();
    const playerB = String(row.player_b ?? "").trim();
    if (!playerA || !playerB || playerA === playerB) {
      rejectedSnapshots++;
      continue;
    }
    const existing = matches.get(id);
    if (existing && (existing.start !== start || existing.playerA !== playerA || existing.playerB !== playerB || existing.winner !== winner)) {
      throw new Error("Conflicting match metadata for match_id " + id);
    }
    if (!matches.has(id)) matches.set(id, { id, start, playerA, playerB, winner, snapshots: [] });
    matches.get(id).snapshots.push({ captured, oddsA, oddsB, probabilityA, row: index });
  }

  const bets = [];
  let totalOverround = 0, overroundCount = 0, clvTotal = 0, clvCount = 0;
  for (const match of matches.values()) {
    match.snapshots.sort((a, b) => a.captured - b.captured || a.row - b.row);
    const opening = match.snapshots[0];
    const closing = match.snapshots[match.snapshots.length - 1];
    const openingMarket = noVig(opening.oddsA, opening.oddsB);
    totalOverround += openingMarket.overround;
    overroundCount++;
    const candidates = [
      { side: "A", player: match.playerA, odds: opening.oddsA, probability: opening.probabilityA, outcome: match.winner === "A" },
      { side: "B", player: match.playerB, odds: opening.oddsB, probability: 1 - opening.probabilityA, outcome: match.winner === "B" }
    ];
    for (const candidate of candidates) {
      const ev = candidate.probability * candidate.odds - 1;
      if (candidate.odds < minOdds || ev < minEv) continue;
      const profit = candidate.outcome ? stake * (candidate.odds - 1) : -stake;
      const closeMarket = noVig(closing.oddsA, closing.oddsB);
      const closeProbability = candidate.side === "A" ? closeMarket.a : closeMarket.b;
      const clv = closing.captured > opening.captured
        ? candidate.odds * closeProbability - 1
        : null;
      if (clv !== null) { clvTotal += clv; clvCount++; }
      bets.push({
        matchId: match.id, side: candidate.side, player: candidate.player,
        odds: candidate.odds, modelProbability: Number(candidate.probability.toFixed(6)),
        expectedValue: Number((ev * 100).toFixed(2)),
        winner: match.winner, won: candidate.outcome, stake,
        profit: Number(profit.toFixed(4)),
        closingLineValue: clv === null ? null : Number((clv * 100).toFixed(2))
      });
    }
  }

  const totalStake = bets.length * stake;
  const profit = bets.reduce((sum, bet) => sum + bet.profit, 0);
  return {
    matches: matches.size,
    rejectedSnapshots,
    bets: bets.length,
    wins: bets.filter(bet => bet.won).length,
    losses: bets.filter(bet => !bet.won).length,
    stakePerBet: stake,
    totalStake: Number(totalStake.toFixed(4)),
    profit: Number(profit.toFixed(4)),
    roiPercent: totalStake ? Number((profit / totalStake * 100).toFixed(2)) : null,
    hitRatePercent: bets.length ? Number((bets.filter(bet => bet.won).length / bets.length * 100).toFixed(2)) : null,
    averageExpectedValuePercent: bets.length ? Number((bets.reduce((sum, bet) => sum + bet.expectedValue, 0) / bets.length).toFixed(2)) : null,
    averageOpeningOverroundPercent: overroundCount ? Number((totalOverround / overroundCount).toFixed(2)) : null,
    averageClosingLineValuePercent: clvCount ? Number((clvTotal / clvCount * 100).toFixed(2)) : null,
    methodology: {
      entryPrice: "earliest valid pre-match snapshot",
      closingPrice: "latest valid pre-match snapshot",
      marketProbability: "two-way proportional de-vig",
      stake: "flat stake per qualifying selection",
      selection: "model EV and minimum odds thresholds",
      warning: "Results are only as representative as the supplied historical snapshots; they exclude limits, commission, voids, and execution slippage."
    },
    selections: bets
  };
}

async function main() {
  const args = process.argv.slice(2);
  const files = [];
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (["--min-ev", "--min-odds", "--stake"].includes(args[i])) {
      if (!args[i + 1]) throw new Error("Missing value after " + args[i]);
      const key = args[i] === "--min-ev" ? "minEv" : args[i] === "--min-odds" ? "minOdds" : "stake";
      const value = Number(args[++i]);
      options[key] = key === "minEv" ? value / 100 : value;
    } else if (args[i].startsWith("--")) throw new Error("Unknown option: " + args[i]);
    else files.push(args[i]);
  }
  if (!files.length) {
    console.error("Usage: node scripts/odds-backtest.mjs [--min-ev 3] [--min-odds 1.90] [--stake 1] odds-history.csv");
    process.exitCode = 2;
    return;
  }
  const rows = [];
  let archiveIgnored = 0;
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const delimiter = raw.replace(/^\\uFEFF/, "").split(/\\r?\\n/, 1)[0].includes(";") ? ";" : ",";
    const parsed = parseCsv(raw, { delimiter });
    if (parsed.length && ["capturedAt", "matchDate", "resultOutcome", "resultWinner", "side"].every(key => key in parsed[0])) {
      const adapted = adaptScannerArchiveRows(parsed);
      rows.push(...adapted.rows);
      archiveIgnored += adapted.ignored;
    } else rows.push(...parsed);
  }
  const report = runOddsBacktest(rows, options);
  report.ignoredUnsettledOrIncompleteArchiveRows = archiveIgnored;
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === "file://" + process.argv[1]) await main();
