import test from "node:test";
import assert from "node:assert/strict";
import { runOddsBacktest } from "../scripts/odds-backtest.mjs";

const base = {
  match_id: "m1",
  match_start: "2025-01-01T12:00:00Z",
  player_a: "Player A",
  player_b: "Player B",
  odds_a: "2.20",
  odds_b: "1.80",
  probability_a: "0.50",
  winner: "A"
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
