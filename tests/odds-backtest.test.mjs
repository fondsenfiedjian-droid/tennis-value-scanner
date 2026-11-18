import test from "node:test";
import assert from "node:assert/strict";
import { adaptScannerArchiveRows, runOddsBacktest, simulateBankrollStrategies } from "../scripts/odds-backtest.mjs";
import { parseCsv } from "../scripts/backtest.mjs";

const base = {
  match_id: "m1",
  match_start: "2025-01-01T12:00:00Z",
  player_a: "Player A",
  player_b: "Player B",
  odds_a: "2.20",
  odds_b: "1.80",
  probability_a: "0.50",
  winner: "A",
  tour: "atp",
  surface: "Hard"
};

test("odds backtest uses earliest pre-match price, flat stakes and reports ROI", () => {
  const rows = [
    { ...base, odds_captured_at: "2025-01-01T10:00:00Z" },
    { ...base, odds_captured_at: "2025-01-01T11:30:00Z", odds_a: "2.00", odds_b: "1.90" }
  ];
  const report = runOddsBacktest(rows, { minEv: 0.03, minOdds: 1.9, stake: 2 });
  assert.equal(report.matches, 1);
  assert.equal(report.bets, 1);
  assert.equal(report.selections[0].odds, 2.2);
  assert.equal(report.selections[0].won, true);
  assert.equal(report.totalStake, 2);
  assert.equal(report.profit, 2.4);
  assert.equal(report.roiPercent, 120);
  assert.notEqual(report.averageClosingLineValuePercent, null);
});

test("odds backtest selects only the highest-EV side per match", () => {
  const report = runOddsBacktest([{
    ...base,
    odds_captured_at: "2025-01-01T10:00:00Z",
    odds_a: "2.20",
    odds_b: "2.20",
    probability_a: "0.50"
  }], { minEv: 0.03, minOdds: 1.9 });
  assert.equal(report.bets, 1);
  assert.equal(report.selections.length, 1);
  assert.equal(report.selections[0].side, "A");
  assert.equal(report.selections[0].expectedValue, 10);
});

test("odds backtest reports confidence intervals and transparent odds buckets", () => {
  const rows = [
    { ...base, match_id: "ci-win", odds_captured_at: "2025-01-01T10:00:00Z", odds_a: "2.20", odds_b: "1.80", probability_a: "0.50", winner: "A" },
    { ...base, match_id: "ci-loss", match_start: "2025-01-02T12:00:00Z", odds_captured_at: "2025-01-02T10:00:00Z", odds_a: "2.20", odds_b: "1.80", probability_a: "0.50", winner: "B" }
  ];
  const report = runOddsBacktest(rows, { minEv: 0.03, minOdds: 1.9, stake: 1 });
  assert.equal(report.statisticalSummary.bets, 2);
  assert.equal(report.statisticalSummary.roiPercent, 10);
  assert.equal(report.statisticalSummary.roiConfidence95Percent.method, "t-approximation");
  assert.equal(report.statisticalSummary.sampleAssessment, "very-small");
  assert.ok(report.statisticalSummary.roiConfidence95Percent.lower < 10);
  assert.ok(report.statisticalSummary.roiConfidence95Percent.upper > 10);
  assert.equal(report.statisticalSummary.hitRateConfidence95Percent.lowerPercent, 9.45);
  assert.equal(report.byOddsRange[0].bets, 2);
  assert.equal(report.byOddsRange[0].roiPercent, 10);
  assert.equal(report.byOddsRange[1].bets, 0);
  assert.equal(report.byOddsRange[1].roiPercent, null);
});

test("empty odds backtest reports unavailable intervals instead of zero profitability", () => {
  const report = runOddsBacktest([]);
  assert.equal(report.statisticalSummary.roiPercent, null);
  assert.equal(report.statisticalSummary.roiConfidence95Percent, null);
  assert.equal(report.statisticalSummary.sampleAssessment, "no-data");
  assert.ok(report.byOddsRange.every(bucket => bucket.roiPercent === null));
});

test("odds backtest ignores post-start and malformed snapshots", () => {
  const rows = [
    { ...base, odds_captured_at: "2025-01-01T12:01:00Z" },
    { ...base, odds_captured_at: "not-a-date" }
  ];
  const report = runOddsBacktest(rows);
  assert.equal(report.matches, 0);
  assert.equal(report.rejectedSnapshots, 2);
  assert.equal(report.bets, 0);
  assert.equal(report.roiPercent, null);
});

test("odds backtest does not create bets below the EV threshold", () => {
  const report = runOddsBacktest([{ ...base, odds_captured_at: "2025-01-01T10:00:00Z", odds_a: "1.90", odds_b: "1.90" }], { minEv: 0.05 });
  assert.equal(report.bets, 0);
  assert.equal(report.profit, 0);
  assert.equal(report.averageExpectedValuePercent, null);
});

test("odds backtest rejects conflicting results for one match ID", () => {
  assert.throws(() => runOddsBacktest([
    { ...base, odds_captured_at: "2025-01-01T10:00:00Z" },
    { ...base, odds_captured_at: "2025-01-01T11:00:00Z", winner: "B" }
  ]), /Conflicting match metadata/);
});

test("scanner semicolon CSV archive is paired into pre-match snapshots and settled outcomes", () => {
  const csv = [
    "capturedAt;matchDate;matchId;tour;surface;player;opponent;side;odds;probability;resultOutcome;resultWinner",
    "1735725600000;2025-01-01T12:00:00.000Z;77;atp;Hard;Player A;Player B;A;2.20;50;completed;1",
    "1735725600000;2025-01-01T12:00:00.000Z;77;atp;Hard;Player B;Player A;B;1.80;50;completed;1",
    "1735729200000;2025-01-01T12:00:00.000Z;77;atp;Hard;Player A;Player B;A;2.00;50;completed;1",
    "1735729200000;2025-01-01T12:00:00.000Z;77;atp;Hard;Player B;Player A;B;1.90;50;completed;1",
    "1735725600000;2025-01-01T12:00:00.000Z;88;wta;Clay;Other A;Other B;A;2.10;50;retired;1"
  ].join("\n");
  const parsed = parseCsv(csv, { delimiter: ";" });
  const adapted = adaptScannerArchiveRows(parsed);
  assert.equal(adapted.rows.length, 2);
  assert.equal(adapted.ignored, 1);
  assert.equal(adapted.rows[0].probability_a, 0.5);
  assert.equal(adapted.rows[0].tour, "atp");
  assert.equal(adapted.rows[0].surface, "Hard");
  const report = runOddsBacktest(adapted.rows, { minEv: 0.03, minOdds: 1.9 });
  assert.equal(report.matches, 1);
  assert.equal(report.bets, 1);
  assert.equal(report.selections[0].odds, 2.2);
});

test("bankroll strategy simulation compares fixed, percentage and quarter-Kelly staking", () => {
  const selections = Array.from({ length: 5 }, (_, index) => ({
    matchId: "m" + index,
    matchStart: "2025-01-0" + (index + 1) + "T12:00:00Z",
    odds: 2,
    modelProbability: 0.6,
    expectedValue: 20,
    winner: "A",
    won: true
  }));
  const report = simulateBankrollStrategies(selections, { startingBankroll: 100 });
  assert.equal(report.startingBankroll, 100);
  assert.equal(report.distinctMatches, 5);
  assert.equal(report.strategies.flat1Euro.endingBankroll, 105);
  assert.equal(report.strategies.bankroll1Percent.endingBankroll, 105.1);
  assert.equal(report.strategies.bankroll2Percent.endingBankroll, 110.4);
  assert.equal(report.strategies.quarterKelly.endingBankroll, 110.4);
  assert.equal(report.strategies.quarterKelly.bets, 5);
});

test("bankroll simulation limits same-day open exposure and skips duplicate match sides", () => {
  const selections = Array.from({ length: 6 }, (_, index) => ({
    matchId: "same-day-" + index,
    matchStart: "2025-01-01T12:00:00Z",
    odds: 2,
    modelProbability: 0.6,
    expectedValue: 20 + index,
    winner: "B",
    won: false
  }));
  selections.push({ ...selections[0], side: "B", expectedValue: 99 });
  const report = simulateBankrollStrategies(selections, { startingBankroll: 100 });
  assert.equal(report.distinctMatches, 6);
  assert.equal(report.strategies.bankroll2Percent.bets, 4);
  assert.equal(report.strategies.bankroll2Percent.totalStaked, 8);
  assert.equal(report.strategies.bankroll2Percent.endingBankroll, 92);
  assert.equal(report.strategies.bankroll2Percent.maxDrawdownPercent, 8);
});

test("historical bankroll results are separated by tour and playing surface", () => {
  const rows = [
    { ...base, match_id: "atp-hard", match_start: "2025-01-01T12:00:00Z", odds_captured_at: "2025-01-01T10:00:00Z" },
    { ...base, match_id: "wta-clay", match_start: "2025-01-02T12:00:00Z", odds_captured_at: "2025-01-02T10:00:00Z", tour: "wta", surface: "Clay" }
  ];
  const report = runOddsBacktest(rows);
  assert.equal(report.bankrollSimulation.byTour.atp.strategies.flat1Euro.bets, 1);
  assert.equal(report.bankrollSimulation.byTour.wta.strategies.flat1Euro.bets, 1);
  assert.equal(report.bankrollSimulation.bySurface.hard.strategies.flat1Euro.bets, 1);
  assert.equal(report.bankrollSimulation.bySurface.clay.strategies.flat1Euro.bets, 1);
});

test("flat one-euro benchmark obeys the live two-percent per-bet cap on small bankrolls", () => {
  const selections = Array.from({ length: 10 }, (_, index) => ({
    matchId: "small-bank-" + index,
    matchStart: "2025-01-01T12:00:00Z",
    odds: 2,
    modelProbability: 0.6,
    expectedValue: 20 + index,
    winner: "A",
    won: true
  }));
  const report = simulateBankrollStrategies(selections, { startingBankroll: 20 });
  assert.equal(report.strategies.flat1Euro.bets, 4);
  assert.equal(report.strategies.flat1Euro.totalStaked, 1.6);
  assert.equal(report.strategies.flat1Euro.endingBankroll, 21.6);
  assert.match(report.methodology, /capped at 2%/);
});


test("odds backtest excludes stale snapshots by default and reports snapshot age", () => {
  const rows = [
    { ...base, match_id: "fresh", odds_captured_at: "2025-01-01T11:30:00Z" },
    { ...base, match_id: "stale", odds_captured_at: "2024-12-30T11:59:00Z" }
  ];
  const report = runOddsBacktest(rows);
  assert.equal(report.matches, 1);
  assert.equal(report.staleSnapshots, 1);
  assert.equal(report.rejectedSnapshots, 1);
  assert.equal(report.snapshotAgeMinutes.count, 1);
  assert.equal(report.snapshotAgeMinutes.min, 30);
  assert.equal(report.selections[0].entrySnapshotAgeMinutes, 30);
  assert.equal(report.selections[0].closingSnapshotAgeMinutes, null);
  assert.equal(report.closingLineValueSample.measured, 0);
  assert.equal(report.closingLineValueSample.missingQualifyingClose, 1);
});

test("odds backtest allows an explicit wider snapshot age and validates the option", () => {
  const row = { ...base, odds_captured_at: "2024-12-30T11:59:00Z" };
  const report = runOddsBacktest([row], { maxSnapshotAgeMinutes: 3000 });
  assert.equal(report.matches, 1);
  assert.equal(report.staleSnapshots, 0);
  assert.throws(() => runOddsBacktest([], { maxSnapshotAgeMinutes: -1 }), /maxSnapshotAgeMinutes/);
});


test("odds backtest rejects timezone-less timestamps instead of using machine locale", () => {
  const report = runOddsBacktest([{ ...base, match_start: "2025-01-01T12:00:00", odds_captured_at: "2025-01-01T10:00:00Z" }]);
  assert.equal(report.matches, 0);
  assert.equal(report.rejectedSnapshots, 1);
});


test("CLV is unavailable without a later snapshot inside the closing window", () => {
  const report = runOddsBacktest([
    { ...base, odds_captured_at: "2025-01-01T10:00:00Z" },
    { ...base, odds_captured_at: "2025-01-01T10:30:00Z", odds_a: "2.10", odds_b: "1.85" }
  ]);
  assert.equal(report.bets, 1);
  assert.equal(report.averageClosingLineValuePercent, null);
  assert.equal(report.closingLineValueSample.measured, 0);
  assert.equal(report.closingLineValueSample.missingQualifyingClose, 1);
  assert.equal(report.selections[0].closingSnapshotAgeMinutes, null);
});

test("CLV uses the latest snapshot within 60 minutes, not a later stale snapshot", () => {
  const report = runOddsBacktest([
    { ...base, odds_captured_at: "2025-01-01T09:00:00Z" },
    { ...base, odds_captured_at: "2025-01-01T11:30:00Z", odds_a: "2.00", odds_b: "1.90" },
    { ...base, odds_captured_at: "2025-01-01T11:55:00Z", odds_a: "1.95", odds_b: "1.95" }
  ]);
  assert.equal(report.closingLineValueSample.measured, 1);
  assert.equal(report.selections[0].closingSnapshotAgeMinutes, 5);
  assert.ok(report.selections[0].closingLineValue !== null);
});

test("timezone offsets with digits are accepted", () => {
  const report = runOddsBacktest([{
    ...base,
    match_start: "2025-01-01T13:00:00+01:00",
    odds_captured_at: "2025-01-01T11:00:00Z"
  }]);
  assert.equal(report.matches, 1);
  assert.equal(report.rejectedSnapshots, 0);
});


test("odds backtest rejects mixed bookmaker prices within one match", () => {
  assert.throws(() => runOddsBacktest([
    { ...base, bookmaker: "Winamax", odds_captured_at: "2025-01-01T10:00:00Z" },
    { ...base, bookmaker: "Betclic", odds_captured_at: "2025-01-01T11:00:00Z" }
  ]), /Conflicting match metadata/);
});

test("odds backtest keeps bookmaker provenance in selections", () => {
  const report = runOddsBacktest([{
    ...base, bookmaker: "Winamax", odds_captured_at: "2025-01-01T10:00:00Z"
  }]);
  assert.equal(report.selections[0].bookmaker, "winamax");
});

test("odds backtest deduplicates identical snapshots captured at the same instant", () => {
  const row = { ...base, odds_captured_at: "2025-01-01T10:00:00Z" };
  const report = runOddsBacktest([row, { ...row }]);
  assert.equal(report.matches, 1);
  assert.equal(report.bets, 1);
  assert.equal(report.selections[0].entrySnapshotAgeMinutes, 120);
});

test("odds backtest rejects conflicting prices at the same snapshot timestamp", () => {
  assert.throws(() => runOddsBacktest([
    { ...base, odds_captured_at: "2025-01-01T10:00:00Z" },
    { ...base, odds_captured_at: "2025-01-01T10:00:00Z", odds_a: "2.35" }
  ]), /Conflicting duplicate timestamp snapshot/);
});


test("odds backtest aligns player B probability with player B odds and winner", () => {
  const report = runOddsBacktest([{
    ...base,
    odds_captured_at: "2025-01-01T10:00:00Z",
    odds_a: "1.80",
    odds_b: "2.40",
    probability_a: "0.55",
    winner: "B"
  }], { minEv: 0.03, minOdds: 1.9 });
  assert.equal(report.bets, 1);
  assert.equal(report.selections[0].side, "B");
  assert.equal(report.selections[0].player, "Player B");
  assert.equal(report.selections[0].modelProbability, 0.45);
  assert.equal(report.selections[0].won, true);
  assert.equal(report.selections[0].odds, 2.4);
});

test("scanner archive excludes retirements and walkovers from ordinary win-loss backtests", () => {
  const rows = [
    { capturedAt: "1735725600000", matchDate: "2025-01-01T12:00:00Z", matchId: "retired", tour: "atp", surface: "Hard", player: "Player A", opponent: "Player B", side: "A", odds: "2.20", probability: "50", resultOutcome: "retired", resultWinner: "1" },
    { capturedAt: "1735725600000", matchDate: "2025-01-01T12:00:00Z", matchId: "walkover", tour: "atp", surface: "Hard", player: "Player C", opponent: "Player D", side: "A", odds: "2.20", probability: "50", resultOutcome: "walkover", resultWinner: "1" }
  ];
  const adapted = adaptScannerArchiveRows(rows);
  assert.equal(adapted.rows.length, 0);
  assert.equal(adapted.ignored, 2);
});


test("threshold sensitivity compares fixed EV and odds grids on a chronological holdout", () => {
  const rows = Array.from({ length: 10 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return {
      ...base,
      match_id: "grid-" + index,
      match_start: "2025-01-" + day + "T12:00:00Z",
      odds_captured_at: "2025-01-" + day + "T10:00:00Z",
      probability_a: "0.60",
      winner: index % 2 ? "B" : "A"
    };
  });
  const report = runOddsBacktest(rows);
  const sensitivity = report.thresholdSensitivity;
  assert.equal(sensitivity.status, "evaluated");
  assert.equal(sensitivity.split, "chronological_70_30_by_match_day");
  assert.equal(sensitivity.trainingDays, 7);
  assert.equal(sensitivity.validationDays, 3);
  assert.equal(sensitivity.trainingMatches, 7);
  assert.equal(sensitivity.validationMatches, 3);
  assert.equal(sensitivity.scenarios.length, 20);
  const baseline = sensitivity.scenarios.find(row => row.minEvPercent === 1 && row.minOdds === 1.9);
  assert.equal(baseline.training.matches, 7);
  assert.equal(baseline.validation.matches, 3);
  assert.equal(baseline.training.bets, 7);
  assert.equal(baseline.validation.bets, 3);
  const highOdds = sensitivity.scenarios.find(row => row.minEvPercent === 1 && row.minOdds === 2.5);
  assert.equal(highOdds.training.bets, 0);
  assert.equal(highOdds.validation.bets, 0);
  assert.ok(baseline.validation.roiPercent !== null);
  assert.equal(baseline.validation.yieldPercent, baseline.validation.roiPercent);
});

test("threshold sensitivity does not split matches from the same UTC day across partitions", () => {
  const rows = [];
  for (let day = 1; day <= 8; day++) {
    for (let match = 0; match < (day === 7 ? 3 : 1); match++) {
      const date = "2025-02-" + String(day).padStart(2, "0");
      rows.push({
        ...base, match_id: "same-day-" + day + "-" + match,
        match_start: date + "T12:00:00Z", odds_captured_at: date + "T10:00:00Z"
      });
    }
  }
  const sensitivity = runOddsBacktest(rows).thresholdSensitivity;
  assert.equal(sensitivity.trainingDays, 5);
  assert.equal(sensitivity.validationDays, 3);
  assert.equal(sensitivity.trainingMatches, 5);
  assert.equal(sensitivity.validationMatches, 5);
});

test("threshold sensitivity marks one-day archives as insufficient rather than a valid holdout", () => {
  const row = { ...base, odds_captured_at: "2025-01-01T10:00:00Z" };
  const sensitivity = runOddsBacktest([row]).thresholdSensitivity;
  assert.equal(sensitivity.status, "insufficient_data");
  assert.equal(sensitivity.trainingDays, 0);
  assert.equal(sensitivity.validationDays, 1);
});


test("archive coverage reports date span, bookmaker, tours, surfaces and snapshot depth", () => {
  const rows = [
    { ...base, bookmaker: "Winamax", odds_captured_at: "2025-01-01T10:00:00Z" },
    { ...base, bookmaker: "Winamax", odds_captured_at: "2025-01-01T11:30:00Z" },
    { ...base, match_id: "m2", match_start: "2025-01-03T12:00:00Z",
      odds_captured_at: "2025-01-03T10:00:00Z", bookmaker: "Winamax",
      player_a: "Player C", player_b: "Player D", winner: "B", surface: "Clay" }
  ];
  const coverage = runOddsBacktest(rows).archiveCoverage;
  assert.equal(coverage.uniqueMatches, 2);
  assert.equal(coverage.validSnapshots, 3);
  assert.deepEqual(coverage.ratingDateCoverage, {
    provided: 0, missing: 6, invalid: 0, beforeMatchDate: 0, sameMatchDate: 0, afterMatchDate: 0,
    note: "ratingAsOf is a calendar-date provenance hint, not proof that the probability was calculated before the odds snapshot or match start. Same-day dates have unknown intraday ordering."
  });
  assert.equal(coverage.matchDateRange.from, "2025-01-01T12:00:00.000Z");
  assert.equal(coverage.matchDateRange.to, "2025-01-03T12:00:00.000Z");
  assert.deepEqual(coverage.bookmakers, ["winamax"]);
  assert.deepEqual(coverage.tours, ["atp"]);
  assert.deepEqual(coverage.surfaces, ["Clay", "Hard"]);
  assert.deepEqual(coverage.snapshotsPerMatch, { min: 1, median: 1, max: 2 });
  assert.equal(coverage.matchesWithQualifyingClosingSnapshot, 1);
  assert.equal(coverage.matchesWithoutQualifyingClosingSnapshot, 1);
});
