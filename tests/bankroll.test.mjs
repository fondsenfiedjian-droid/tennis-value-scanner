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
  assert.throws(() => bank.placeBet(state, { probability: 0.6, odds: 2.1, stake: 2 }), /рекомендуемый лимит/);
  const permissive = { maxStakePercent: 8, maxExposurePercent: 8, kellyFraction: 1, minEv: 3, minOdds: 1.9 };
  assert.throws(() => bank.placeBet(state, { probability: 0.9, odds: 2.1, stake: 7, options: permissive }), /общий лимит/);
});

test("winning, losing and void settlements update balance and realized profit correctly", () => {
  const initial = bank.createInitialState(100);
  const placed = bank.placeBet(initial, { probability: 0.6, odds: 2.1, stake: 2 });
  const won = bank.settleBet(placed.state, placed.bet.id, "won");
  assert.equal(won.balance, 102.2);
  assert.equal(bank.realizedProfit(won), 2.2);
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
  assert.throws(() => bank.addWithdrawal(state, 116), /превышает/);
});

test("backup round trip preserves state and rejects malformed data", () => {
  const state = bank.createInitialState(100);
  const backup = bank.serializeBackup(state);
  assert.deepEqual(bank.parseBackup(JSON.parse(JSON.stringify(backup))), state);
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
