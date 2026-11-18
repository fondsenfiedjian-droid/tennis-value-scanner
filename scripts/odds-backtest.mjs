#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";

const number = value => Number(value);
const timestamp = value => {
  const text = String(value ?? "").trim();
  // Require an explicit timezone so host locale cannot silently shift historical match times.
  if (!/(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(text)) return null;
  const parsed = Date.parse(text);
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
    const tour = String(row.tour || "").trim().toLowerCase();
    const surface = String(row.surface || "").trim();
    if (outcome !== "completed" || ![1, 2].includes(winnerNumber) || !id ||
        start === null || !Number.isFinite(captured) || captured <= 0 ||
        !["A", "B"].includes(side) || !validOdds(odds) ||
        !Number.isFinite(probability) || probability <= 0 || probability >= 100) {
      ignored++;
      continue;
    }
    const key = id + "|" + captured;
    if (!groups.has(key)) groups.set(key, { id, start, captured, winner: winnerNumber === 1 ? "A" : "B", tour, surface, sides: {} });
    const group = groups.get(key);
    if (group.start !== start || group.winner !== (winnerNumber === 1 ? "A" : "B") ||
        (group.tour && tour && group.tour !== tour) || (group.surface && surface && group.surface !== surface)) {
      throw new Error("Conflicting result, date, tour or surface in archive for " + id);
    }
    if (!group.tour) group.tour = tour;
    if (!group.surface) group.surface = surface;
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
      tour: group.tour,
      surface: group.surface,
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

export function simulateBankrollStrategies(selections, options = {}) {
  const startingBankroll = Number.isFinite(options.startingBankroll) && options.startingBankroll > 0
    ? Math.round(options.startingBankroll * 100) / 100 : 100;
  const maxStakePercent = 2, maxExposurePercent = 8, kellyFraction = 0.25;
  const unique = new Map();
  for (const selection of selections || []) {
    const key = String(selection.matchId);
    const previous = unique.get(key);
    if (!previous || selection.expectedValue > previous.expectedValue) unique.set(key, selection);
  }
  const byDay = new Map();
  for (const selection of unique.values()) {
    const start = timestamp(selection.matchStart);
    if (start === null || !validOdds(Number(selection.odds)) ||
        !Number.isFinite(Number(selection.modelProbability)) ||
        Number(selection.modelProbability) <= 0 || Number(selection.modelProbability) >= 1 ||
        !["A", "B"].includes(selection.winner)) continue;
    const day = new Date(start).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(selection);
  }
  const strategies = {
    flat1Euro: { label: "Flat €1", mode: "flat" },
    bankroll1Percent: { label: "1% bankroll", mode: "percent", percent: 1 },
    bankroll2Percent: { label: "2% bankroll", mode: "percent", percent: 2 },
    quarterKelly: { label: "Quarter Kelly (2% cap)", mode: "kelly" }
  };
  const reports = {};
  for (const [key, strategy] of Object.entries(strategies)) {
    let balance = startingBankroll, peak = startingBankroll, maxDrawdown = 0;
    let totalStaked = 0, wins = 0, losses = 0, bets = 0;
    for (const day of [...byDay.keys()].sort()) {
      const daily = byDay.get(day).slice().sort((a, b) =>
        Number(b.expectedValue) - Number(a.expectedValue) || String(a.matchId).localeCompare(String(b.matchId)));
      let reserved = 0;
      const placed = [];
      const equity = balance;
      for (const selection of daily) {
        const odds = Number(selection.odds), probability = Number(selection.modelProbability);
        const maxSingle = equity * maxStakePercent / 100;
        const maxPortfolio = equity * maxExposurePercent / 100;
        const remainingExposure = Math.max(0, maxPortfolio - reserved);
        let desired;
        if (strategy.mode === "flat") desired = 1;
        else if (strategy.mode === "percent") desired = equity * strategy.percent / 100;
        else {
          const b = odds - 1, q = 1 - probability;
          const fullKelly = Math.max(0, (b * probability - q) / b);
          desired = equity * fullKelly * kellyFraction;
        }
        // Apply the live per-bet cap to every strategy, including the €1 benchmark.
        const singleLimit = maxSingle;
        const stake = Math.round(Math.min(desired, singleLimit, remainingExposure, Math.max(0, balance - reserved)) * 100) / 100;
        if (stake < 0.01) continue;
        reserved += stake;
        placed.push({ selection, stake });
      }
      balance = Math.round((balance - reserved) * 100) / 100;
      for (const item of placed) {
        bets++;
        totalStaked += item.stake;
        if (item.selection.won) {
          wins++;
          balance += item.stake * Number(item.selection.odds);
        } else losses++;
      }
      balance = Math.round(balance * 100) / 100;
      peak = Math.max(peak, balance);
      if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - balance) / peak * 100);
    }
    const profit = Math.round((balance - startingBankroll) * 100) / 100;
    reports[key] = {
      label: strategy.label, bets, wins, losses,
      totalStaked: Number(totalStaked.toFixed(2)),
      endingBankroll: Number(balance.toFixed(2)),
      profit,
      roiPercent: totalStaked ? Number((profit / totalStaked * 100).toFixed(2)) : null,
      hitRatePercent: bets ? Number((wins / bets * 100).toFixed(2)) : null,
      maxDrawdownPercent: Number(maxDrawdown.toFixed(2))
    };
  }
  const report = {
    startingBankroll, distinctMatches: unique.size, strategies: reports,
    methodology: "One highest-EV selection per match. Stakes are allocated in descending EV order in calendar-day batches; every strategy, including the flat €1 benchmark, is capped at 2% of starting-day equity per bet and 8% aggregate same-day exposure, matching the live per-bet and exposure limits. Each day's outcomes are settled together. This approximates same-day exposure; intraday start/end times, commission, void rules, limits and execution slippage are not modelled."
  };
  if (!options.skipBreakdowns) {
    report.byTour = buildBankrollBreakdown([...unique.values()], "tour", startingBankroll);
    report.bySurface = buildBankrollBreakdown([...unique.values()], "surface", startingBankroll);
  }
  return report;
}

function buildBankrollBreakdown(selections, field, startingBankroll) {
  const groups = new Map();
  for (const selection of selections) {
    const key = String(selection[field] || "unknown").trim().toLowerCase() || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(selection);
  }
  return Object.fromEntries([...groups.entries()].map(([key, group]) => [
    key, simulateBankrollStrategies(group, { startingBankroll, skipBreakdowns: true })
  ]));
}

function wilsonInterval(wins, total, z = 1.96) {
  if (!total) return null;
  const p = wins / total, z2 = z * z, denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) / total) + z2 / (4 * total * total)) / denominator;
  return { lowerPercent: Number((Math.max(0, center - margin) * 100).toFixed(2)), upperPercent: Number((Math.min(1, center + margin) * 100).toFixed(2)) };
}

function performanceSummary(selections) {
  const n = selections.length;
  if (!n) return { bets: 0, roiPercent: null, roiConfidence95Percent: null, hitRateConfidence95Percent: null, sampleAssessment: "no-data" };
  const returns = selections.map(item => Number(item.won ? item.odds - 1 : -1));
  const mean = returns.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1 ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : null;
  const critical = n < 2 ? null : n < 30 ? ([null, null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262][Math.min(n, 10)] || 2.262) : 1.96;
  const halfWidth = critical === null ? null : critical * Math.sqrt(variance / n) * 100;
  const wins = selections.filter(item => item.won).length;
  const hit = wilsonInterval(wins, n);
  return {
    bets: n,
    roiPercent: Number((mean * 100).toFixed(2)),
    roiConfidence95Percent: halfWidth === null ? null : {
      lower: Number(((mean * 100) - halfWidth).toFixed(2)),
      upper: Number(((mean * 100) + halfWidth).toFixed(2)),
      method: n < 30 ? "t-approximation" : "normal-approximation"
    },
    hitRateConfidence95Percent: hit,
    sampleAssessment: n < 30 ? "very-small" : n < 100 ? "small" : n < 300 ? "moderate" : "larger-but-not-proof"
  };
}

function summarizeOddsBuckets(selections) {
  const buckets = [
    { label: "1.90–2.49", min: 1.9, max: 2.5 },
    { label: "2.50–3.49", min: 2.5, max: 3.5 },
    { label: "3.50–4.99", min: 3.5, max: 5 },
    { label: "5.00+", min: 5, max: Infinity }
  ];
  return buckets.map(bucket => {
    const rows = selections.filter(item => item.odds >= bucket.min && item.odds < bucket.max);
    const summary = performanceSummary(rows);
    const stake = rows.reduce((sum, item) => sum + item.stake, 0);
    const profit = rows.reduce((sum, item) => sum + item.profit, 0);
    return { range: bucket.label, ...summary, totalStake: Number(stake.toFixed(2)), profit: Number(profit.toFixed(2)) };
  });
}

export function runOddsBacktest(rows, options = {}) {
  const minEv = Number.isFinite(options.minEv) ? options.minEv : 0.03;
  const minOdds = Number.isFinite(options.minOdds) ? options.minOdds : 1.9;
  const stake = Number.isFinite(options.stake) && options.stake > 0 ? options.stake : 1;
  const maxSnapshotAgeMinutes = options.maxSnapshotAgeMinutes === undefined ? 24 * 60 : Number(options.maxSnapshotAgeMinutes);
  if (minEv < 0 || minEv > 10) throw new RangeError("minEv must be between 0 and 10");
  if (minOdds <= 1 || minOdds > 1000) throw new RangeError("minOdds must be greater than 1 and no greater than 1000");
  if (options.startingBankroll !== undefined && (!Number.isFinite(options.startingBankroll) || options.startingBankroll <= 0 || options.startingBankroll > 100000000)) throw new RangeError("startingBankroll must be positive and no greater than 100000000");
  if (!(stake > 0)) throw new RangeError("stake must be positive");
  if (!Number.isFinite(maxSnapshotAgeMinutes) || maxSnapshotAgeMinutes < 0 || maxSnapshotAgeMinutes > 365 * 24 * 60) throw new RangeError("maxSnapshotAgeMinutes must be between 0 and 525600");

  const matches = new Map();
  let rejectedSnapshots = 0, staleSnapshots = 0;
  const acceptedSnapshotAges = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const id = String(row.match_id ?? "").trim();
    const start = timestamp(row.match_start);
    const captured = timestamp(row.odds_captured_at);
    const oddsA = number(row.odds_a), oddsB = number(row.odds_b);
    const probabilityA = number(row.probability_a);
    const winner = String(row.winner ?? "").trim().toUpperCase();
    const tour = String(row.tour ?? "").trim().toLowerCase();
    const surface = String(row.surface ?? "").trim();
    if (!id || start === null || captured === null || !validOdds(oddsA) || !validOdds(oddsB) ||
        !Number.isFinite(probabilityA) || probabilityA <= 0 || probabilityA >= 1 ||
        !["A", "B"].includes(winner) || captured > start) {
      rejectedSnapshots++;
      continue;
    }
    const ageMinutes = (start - captured) / 60000;
    if (ageMinutes > maxSnapshotAgeMinutes) {
      rejectedSnapshots++;
      staleSnapshots++;
      continue;
    }
    acceptedSnapshotAges.push(ageMinutes);
    const playerA = String(row.player_a ?? "").trim();
    const playerB = String(row.player_b ?? "").trim();
    if (!playerA || !playerB || playerA === playerB) {
      rejectedSnapshots++;
      continue;
    }
    const existing = matches.get(id);
    if (existing && (existing.start !== start || existing.playerA !== playerA || existing.playerB !== playerB || existing.winner !== winner ||
        (existing.tour && tour && existing.tour !== tour) || (existing.surface && surface && existing.surface !== surface))) {
      throw new Error("Conflicting match metadata for match_id " + id);
    }
    if (!matches.has(id)) matches.set(id, { id, start, playerA, playerB, winner, tour, surface, snapshots: [] });
    if (!matches.get(id).tour) matches.get(id).tour = tour;
    if (!matches.get(id).surface) matches.get(id).surface = surface;
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
    const qualifying = candidates
      .map(candidate => ({ ...candidate, ev: candidate.probability * candidate.odds - 1 }))
      .filter(candidate => candidate.odds >= minOdds && candidate.ev >= minEv)
      .sort((a, b) => b.ev - a.ev || a.side.localeCompare(b.side));
    // Match the live portfolio rule: never back both sides of one match.
    const candidate = qualifying[0];
    if (!candidate) continue;
    const ev = candidate.ev;
    const profit = candidate.outcome ? stake * (candidate.odds - 1) : -stake;
    const closeMarket = noVig(closing.oddsA, closing.oddsB);
    const closeProbability = candidate.side === "A" ? closeMarket.a : closeMarket.b;
    const clv = closing.captured > opening.captured
      ? candidate.odds * closeProbability - 1
      : null;
    if (clv !== null) { clvTotal += clv; clvCount++; }
    bets.push({
      matchId: match.id, matchStart: new Date(match.start).toISOString(), tour: match.tour, surface: match.surface, side: candidate.side, player: candidate.player,
      odds: candidate.odds, modelProbability: Number(candidate.probability.toFixed(6)),
      entrySnapshotAgeMinutes: Number(((match.start - opening.captured) / 60000).toFixed(1)),
      closingSnapshotAgeMinutes: Number(((match.start - closing.captured) / 60000).toFixed(1)),
      expectedValue: Number((ev * 100).toFixed(2)),
      winner: match.winner, won: candidate.outcome, stake,
      profit: Number(profit.toFixed(4)),
      closingLineValue: clv === null ? null : Number((clv * 100).toFixed(2))
    });
  }

  const totalStake = bets.length * stake;
  const profit = bets.reduce((sum, bet) => sum + bet.profit, 0);
  return {
    matches: matches.size,
    rejectedSnapshots,
    staleSnapshots,
    maxSnapshotAgeMinutes,
    snapshotAgeMinutes: acceptedSnapshotAges.length ? {
      count: acceptedSnapshotAges.length,
      min: Number(Math.min(...acceptedSnapshotAges).toFixed(1)),
      median: Number(acceptedSnapshotAges.slice().sort((a,b)=>a-b)[Math.floor((acceptedSnapshotAges.length-1)/2)].toFixed(1)),
      max: Number(Math.max(...acceptedSnapshotAges).toFixed(1))
    } : null,
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
    statisticalSummary: performanceSummary(bets),
    byOddsRange: summarizeOddsBuckets(bets),
    methodology: {
      entryPrice: "earliest valid pre-match snapshot within the configured maximum snapshot age",
      closingPrice: "latest valid pre-match snapshot",
      marketProbability: "two-way proportional de-vig",
      stake: "flat stake per qualifying selection",
      selection: "model EV and minimum odds thresholds",
      maxSnapshotAgeMinutes,
      warning: "Results are only as representative as the supplied historical snapshots; stale snapshots beyond the configured age are excluded. Limits, commission, voids, and execution slippage are not modelled."
    },
    bankrollSimulation: simulateBankrollStrategies(bets, { startingBankroll: options.startingBankroll }),
    selections: bets
  };
}

async function main() {
  const args = process.argv.slice(2);
  const files = [];
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (["--min-ev", "--min-odds", "--stake", "--bankroll", "--max-snapshot-age-minutes"].includes(args[i])) {
      if (!args[i + 1]) throw new Error("Missing value after " + args[i]);
      const key = args[i] === "--min-ev" ? "minEv" : args[i] === "--min-odds" ? "minOdds" : args[i] === "--bankroll" ? "startingBankroll" : args[i] === "--max-snapshot-age-minutes" ? "maxSnapshotAgeMinutes" : "stake";
      const value = Number(args[++i]);
      options[key] = key === "minEv" ? value / 100 : value;
    } else if (args[i].startsWith("--")) throw new Error("Unknown option: " + args[i]);
    else files.push(args[i]);
  }
  if (!files.length) {
    console.error("Usage: node scripts/odds-backtest.mjs [--min-ev 3] [--min-odds 1.90] [--stake 1] [--bankroll 100] [--max-snapshot-age-minutes 1440] odds-history.csv");
    process.exitCode = 2;
    return;
  }
  const rows = [];
  let archiveIgnored = 0;
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const delimiter = raw.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
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
