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

test("aggregate exposure cap blocks a manually oversized additional bet", () => {
  let state = bank.createInitialState(100);
  state = bank.placeBet(state, { probability: 0.6, odds: 2.1, stake: 5 }).state;
  assert.throws(() => bank.placeBet(state, { probability: 0.6, odds: 2.1, stake: 4 }), /общий лимит/);
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

test("rejects corrupt bankroll states and invalid bet parameters", () => {
  assert.throws(() => bank.createInitialState(-1), /положительным/);
  assert.throws(() => bank.validateState({ version: 1, initialBankroll: 100, balance: 100, openBets: [], transactions: [{ id: "x", amount: -1, balanceDelta: 0 }] }), /некорректная операция/);
  assert.equal(bank.recommendStake(bank.createInitialState(100), 0, 2).eligible, false);
});

function verifiedRow(matchId, outcome, winner, resultVersion) {
  return {
    matchId,
    resultOutcome: outcome,
    resultWinner: winner,
    resultVersion,
    resultCheckedAt: Date.now()
  };
}

test("verified result revision recalculates a settled bet and remains idempotent", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 7654321, side: "A", match: "A - B"
  });
  const first = bank.settleVerifiedResults(placed.state, [verifiedRow(7654321, "completed", 1, 1)]);
  assert.equal(first.settled.length, 1);
  assert.equal(first.state.balance, 102.2);
  assert.equal(bank.realizedProfit(first.state), 2.2);

  const corrected = bank.settleVerifiedResults(first.state, [verifiedRow(7654321, "completed", 2, 2)]);
  assert.equal(corrected.corrected.length, 1);
  assert.equal(corrected.state.balance, 98);
  assert.equal(bank.realizedProfit(corrected.state), -2);
  assert.equal(corrected.state.openBets.length, 0);

  const repeated = bank.settleVerifiedResults(corrected.state, [verifiedRow(7654321, "completed", 2, 2)]);
  assert.equal(repeated.updated, 0);
  assert.equal(repeated.state.balance, 98);
  assert.equal(bank.validateState(repeated.state), repeated.state);
});

test("a revised non-standard result reverses payout and reopens the bet for manual review", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 7654322, side: "A", match: "A - B"
  });
  const settled = bank.settleVerifiedResults(placed.state, [verifiedRow(7654322, "completed", 1, 1)]);
  const reopened = bank.settleVerifiedResults(settled.state, [verifiedRow(7654322, "retired", null, 2)]);
  assert.equal(reopened.reopened.length, 1);
  assert.equal(reopened.state.balance, 98);
  assert.equal(reopened.state.openBets.length, 1);
  assert.equal(reopened.state.openBets[0].lastResultVersion, 2);
  assert.equal(bank.validateState(reopened.state), reopened.state);
  const repeated = bank.settleVerifiedResults(reopened.state, [verifiedRow(7654322, "retired", null, 2)]);
  assert.equal(repeated.updated, 0);
  assert.equal(repeated.state.balance, 98);
  assert.equal(repeated.state.openBets.length, 1);
});

test("conflicting official winners at the same result version are not auto-settled", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 7654323, side: "A"
  });
  const rows = [
    verifiedRow(7654323, "completed", 1, 4),
    verifiedRow(7654323, "completed", 2, 4)
  ];
  const result = bank.settleVerifiedResults(placed.state, rows);
  assert.equal(result.updated, 0);
  assert.equal(result.state.openBets.length, 1);
  assert.equal(result.state.balance, 98);
});

test("a newly versioned official result can supersede an earlier unversioned settlement", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 7654324, side: "A"
  });
  const unversioned = bank.settleVerifiedResults(placed.state, [verifiedRow(7654324, "completed", 1, null)]);
  assert.equal(unversioned.state.balance, 102.2);
  const revised = bank.settleVerifiedResults(unversioned.state, [verifiedRow(7654324, "completed", 2, 1)]);
  assert.equal(revised.corrected.length, 1);
  assert.equal(revised.state.balance, 98);
  assert.equal(bank.realizedProfit(revised.state), -2);
  assert.equal(bank.validateState(revised.state), revised.state);
});

test("manual settlements are not silently overwritten by later API results", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 7654325, side: "A"
  });
  const manual = bank.settleBet(placed.state, placed.bet.id, "won");
  const reconciled = bank.settleVerifiedResults(manual, [verifiedRow(7654325, "completed", 2, 1)]);
  assert.equal(reconciled.updated, 0);
  assert.equal(reconciled.state.balance, 102.2);
  assert.equal(bank.realizedProfit(reconciled.state), 2.2);
});
