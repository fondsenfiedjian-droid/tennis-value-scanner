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
    "capturedAt;matchDate;matchId;player;opponent;side;odds;probability;resultOutcome;resultWinner",
    "1735725600000;2025-01-01T12:00:00.000Z;77;Player A;Player B;A;2.20;50;completed;1",
    "1735725600000;2025-01-01T12:00:00.000Z;77;Player B;Player A;B;1.80;50;completed;1",
    "1735729200000;2025-01-01T12:00:00.000Z;77;Player A;Player B;A;2.00;50;completed;1",
    "1735729200000;2025-01-01T12:00:00.000Z;77;Player B;Player A;B;1.90;50;completed;1",
    "1735725600000;2025-01-01T12:00:00.000Z;88;Other A;Other B;A;2.10;50;retired;1"
  ].join("\n");
  const parsed = parseCsv(csv, { delimiter: ";" });
  const adapted = adaptScannerArchiveRows(parsed);
  assert.equal(adapted.rows.length, 2);
  assert.equal(adapted.ignored, 1);
  assert.equal(adapted.rows[0].probability_a, 0.5);
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
