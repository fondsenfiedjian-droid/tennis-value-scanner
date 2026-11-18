import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const test = require("node:test");
const assert = require("node:assert/strict");
const bank = require("../bankroll.js");

test("starts with a 100 euro bank and separates free balance from equity", () => {
  const state = bank.createInitialState(100);
  assert.equal(state.balance, 100);
  assert.equal(bank.getSummary(state).equity, 100);
  assert.equal(bank.getSummary(state).openStake, 0);
});

test("quarter Kelly recommendation respects 2 percent stake and 8 percent exposure caps", () => {
  const state = bank.createInitialState(100);
  const recommendation = bank.recommendStake(state, 0.6, 2.1);
  assert.equal(recommendation.eligible, true);
  assert.ok(recommendation.stake > 0 && recommendation.stake <= 2);
  assert.equal(bank.recommendStake(state, 0.5, 1.9).eligible, false);
});

test("placing a recommended bet reserves stake and reduces free balance", () => {
  const state = bank.createInitialState(100);
  const placed = bank.placeBet(state, { probability: 0.6, odds: 2.1, match: "Player A - Player B", player: "Player A" });
  assert.equal(placed.state.openBets.length, 1);
  assert.equal(placed.state.balance, bank.roundMoney(100 - placed.bet.stake));
  assert.equal(bank.getSummary(placed.state).equity, 100);
});

test("aggregate exposure cap blocks oversized additional bets", () => {
  let state = bank.createInitialState(100);
  state = bank.placeBet(state, { probability: 0.6, odds: 2.1, stake: 2 }).state;
  const permissive = { maxStakePercent: 8, maxExposurePercent: 8, kellyFraction: 1, minEv: 3, minOdds: 1.9 };
  const recommendation = bank.recommendStake(state, 0.9, 2.1, permissive);
  assert.equal(recommendation.remainingExposure, 6);
  assert.equal(recommendation.stake, 6);
  assert.throws(() => bank.placeBet(state, { probability: 0.9, odds: 2.1, stake: 6.01, options: permissive }), /рекомендуемый лимит/);
});

test("winning, losing and void settlements update balance and realized profit correctly", () => {
  const initial = bank.createInitialState(100);
  const placed = bank.placeBet(initial, { probability: 0.6, odds: 2.1, stake: 2 });
  const won = bank.settleBet(placed.state, placed.bet.id, "won");
  assert.equal(won.balance, 102.2);
  assert.equal(bank.realizedProfit(won), 2.2);
  assert.equal(bank.getSummary(won).totalStaked, 2);
  assert.equal(bank.getSummary(won).settledStake, 2);
  assert.equal(bank.getSummary(won).roiPercent, 110);
  const lost = bank.settleBet(placed.state, placed.bet.id, "lost");
  assert.equal(lost.balance, 98);
  assert.equal(bank.realizedProfit(lost), -2);
  const voided = bank.settleBet(placed.state, placed.bet.id, "void");
  assert.equal(voided.balance, 100);
  assert.equal(bank.realizedProfit(voided), 0);
});

test("deposits and withdrawals affect cash balance but not betting profit", () => {
  let state = bank.createInitialState(100);
  state = bank.addDeposit(state, 25, "Пополнение");
  state = bank.addWithdrawal(state, 10, "Снятие");
  assert.equal(state.balance, 115);
  assert.equal(bank.realizedProfit(state), 0);
  assert.equal(bank.getSummary(state).deposits, 125);
  assert.equal(bank.getSummary(state).withdrawals, 10);
  assert.equal(bank.getSummary(state).totalInflow, 125);
  assert.equal(bank.getSummary(state).totalOutflow, 10);
  assert.throws(() => bank.addWithdrawal(state, 116), /превышает/);
});

test("backup round trip preserves state and rejects malformed data", () => {
  const state = bank.createInitialState(100);
  const backup = bank.serializeBackup(state);
  assert.deepEqual(bank.parseBackup(JSON.parse(JSON.stringify(backup))), state);
  const corrupted = JSON.parse(JSON.stringify(backup));
  corrupted.state.balance += 1;
  assert.throws(() => bank.parseBackup(corrupted), /Контрольная сумма/);
  assert.throws(() => bank.parseBackup({ format: "other", version: 1, state }), /не поддерживается/);
});

test("rejects corrupt states, inconsistent balances and invalid bet parameters", () => {
  assert.throws(() => bank.createInitialState(-1), /положительным/);
  assert.throws(() => bank.validateState({ version: 1, initialBankroll: 100, balance: 100, openBets: [], transactions: [{ id: "x", amount: -1, balanceDelta: 0 }] }), /некорректная операция/);
  const corrupt = bank.createInitialState(100);
  corrupt.balance = 90;
  assert.throws(() => bank.validateState(corrupt), /не совпадает/);
  assert.equal(bank.recommendStake(bank.createInitialState(100), 0, 2).eligible, false);
  assert.throws(() => bank.placeBet(bank.createInitialState(100), { probability: 0.6, odds: 2.1, stake: 2.01 }), /рекомендуемый лимит/);
});

test("portfolio allocator distributes stakes across distinct matches within aggregate exposure cap", () => {
  const state = bank.createInitialState(100);
  const portfolio = bank.recommendPortfolio(state, [
    { matchKey: "m1", player: "A", opponent: "B", probability: 0.65, odds: 2.1, ev: 36.5 },
    { matchKey: "m2", player: "C", opponent: "D", probability: 0.62, odds: 2.0, ev: 24 },
    { matchKey: "m1", player: "B", opponent: "A", probability: 0.6, odds: 2.2, ev: 32 }
  ]);
  assert.equal(portfolio.suggestions.length, 2);
  assert.equal(portfolio.totalStake, 4);
  assert.ok(portfolio.remainingExposure <= 8);
  assert.equal(portfolio.suggestions[0].matchKey, "m1");
  assert.equal(portfolio.suggestions[1].matchKey, "m2");
});

test("automatic settlement uses only consistent verified completed match results", () => {
  const state = bank.createInitialState(100);
  const first = bank.placeBet(state, { probability: 0.6, odds: 2.1, stake: 2, matchId: 123, side: "A" });
  const second = bank.placeBet(first.state, { probability: 0.6, odds: 2.1, stake: 2, matchId: 456, side: "B" });
  const result = bank.settleVerifiedResults(second.state, [
    { matchId: 123, resultOutcome: "completed", resultWinner: 1 },
    { matchId: 456, resultOutcome: "retired", resultWinner: 1 },
    { matchId: 789, resultOutcome: "completed", resultWinner: 2 }
  ]);
  assert.equal(result.settled.length, 1);
  assert.equal(result.settled[0].outcome, "won");
  assert.equal(result.state.openBets.length, 1);
  assert.equal(result.state.openBets[0].matchId, 456);
  assert.equal(result.state.balance, 100.2);
});

test("automatic settlement ignores conflicting result revisions", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 123, side: "A"
  });
  const result = bank.settleVerifiedResults(placed.state, [
    { matchId: 123, resultOutcome: "completed", resultWinner: 1 },
    { matchId: 123, resultOutcome: "completed", resultWinner: 2 }
  ]);
  assert.equal(result.settled.length, 0);
  assert.equal(result.state.openBets.length, 1);
});
