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

test("ROI denominator excludes voided stakes while voids remain separately counted", () => {
  let state = bank.createInitialState(100);
  let placed = bank.placeBet(state, { probability: 0.6, odds: 2.1, stake: 2 });
  state = bank.settleBet(placed.state, placed.bet.id, "void");
  placed = bank.placeBet(state, { probability: 0.6, odds: 2.1, stake: 2 });
  state = bank.settleBet(placed.state, placed.bet.id, "lost");

  const summary = bank.getSummary(state);
  assert.equal(summary.totalStaked, 4);
  assert.equal(summary.settledStake, 2);
  assert.equal(summary.voidedStake, 2);
  assert.equal(summary.voidedBets, 1);
  assert.equal(summary.realizedProfit, -2);
  assert.equal(summary.roiPercent, -100);
});

test("deposits and withdrawals affect cash balance but not betting profit", () => {
  let state = bank.createInitialState(100);
  state = bank.addDeposit(state, 25, "Пополнение");
  state = bank.addWithdrawal(state, 10, "Снятие");
  assert.equal(state.balance, 115);
  assert.equal(bank.realizedProfit(state), 0);
  assert.equal(bank.getSummary(state).initialBankroll, 100);
  assert.equal(bank.getSummary(state).deposits, 25);
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

test("portfolio allocation halves medium-freshness stakes and rejects limited freshness", () => {
  const portfolio = bank.recommendPortfolio(bank.createInitialState(100), [
    { matchKey: "medium", player: "A", opponent: "B", probability: 0.6, odds: 2.1, stakeMultiplier: 0.5 },
    { matchKey: "limited", player: "C", opponent: "D", probability: 0.6, odds: 2.1, stakeMultiplier: 0 }
  ]);
  assert.equal(portfolio.suggestions.length, 1);
  assert.equal(portfolio.suggestions[0].matchKey, "medium");
  assert.equal(portfolio.suggestions[0].stake, 1);
});

test("cumulative daily stake turnover remains capped after earlier bets settle", () => {
  let state = bank.createInitialState(100);
  let count = 0;
  while (count < 10) {
    const recommendation = bank.recommendStake(state, 0.6, 2.1);
    if (!recommendation.eligible) break;
    const placed = bank.placeBet(state, { probability: 0.6, odds: 2.1 });
    state = bank.settleBet(placed.state, placed.bet.id, "lost");
    count++;
  }
  assert.equal(count, 4);
  assert.ok(bank.getSummary(state).dailyStaked <= 8);
  assert.equal(bank.recommendStake(state, 0.6, 2.1).eligible, false);
});

test("recalculates a settled bet when official result version changes", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 321, side: "A"
  });
  const first = bank.settleVerifiedResults(placed.state, [
    { matchId: 321, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ]);
  assert.equal(first.state.balance, 102.2);
  const corrected = bank.settleVerifiedResults(first.state, [
    { matchId: 321, resultOutcome: "completed", resultWinner: 2, resultVersion: 2 }
  ]);
  assert.equal(corrected.corrected.length, 1);
  assert.equal(corrected.state.balance, 98);
  assert.equal(bank.realizedProfit(corrected.state), -2);
  assert.equal(bank.validateState(corrected.state), corrected.state);
});

test("reopens a bet after a revised retirement status and settles a later completed version", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 654, side: "A"
  });
  const first = bank.settleVerifiedResults(placed.state, [
    { matchId: 654, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ]);
  const reopened = bank.settleVerifiedResults(first.state, [
    { matchId: 654, resultOutcome: "retired", resultWinner: 1, resultVersion: 2 }
  ]);
  assert.equal(reopened.reopened.length, 1);
  assert.equal(reopened.state.openBets.length, 1);
  assert.equal(reopened.state.balance, 98);
  assert.equal(bank.bankrollEquity(reopened.state), 100);
  const stale = bank.settleVerifiedResults(reopened.state, [
    { matchId: 654, resultOutcome: "completed", resultWinner: 1 }
  ]);
  assert.equal(stale.settled.length, 0);
  assert.equal(stale.state.openBets.length, 1);
  const completed = bank.settleVerifiedResults(reopened.state, [
    { matchId: 654, resultOutcome: "completed", resultWinner: 1, resultVersion: 3 }
  ]);
  assert.equal(completed.settled.length, 1);
  assert.equal(completed.state.openBets.length, 0);
  assert.equal(completed.state.balance, 102.2);
  assert.equal(bank.realizedProfit(completed.state), 2.2);
  assert.equal(bank.validateState(completed.state), completed.state);
});

test("rejects ledger entries with invalid dates, duplicate IDs or unknown transaction types", () => {
  const invalidDate = bank.createInitialState(100);
  invalidDate.transactions[0].at = "not-a-date";
  assert.throws(() => bank.validateState(invalidDate), /некорректная операция/);

  const unknownType = bank.createInitialState(100);
  unknownType.transactions[0].type = "mystery";
  assert.throws(() => bank.validateState(unknownType), /некорректная операция/);

  const duplicateId = bank.createInitialState(100);
  duplicateId.transactions.push({ ...duplicateId.transactions[0], amount: 0, balanceDelta: 0 });
  assert.throws(() => bank.validateState(duplicateId), /некорректная операция/);
});


test("portfolio reconciliation records actual stake and odds and skips unplaced selections", () => {
  const initial = bank.createInitialState(100);
  const portfolio = bank.recommendPortfolio(initial, [
    { matchKey: "match:301", matchId: 301, match: "ATP · Player A — Player B", player: "Player A", opponent: "Player B", side: "A", probability: 0.62, odds: 2.1, freshnessLevel: "good" },
    { matchKey: "match:302", matchId: 302, match: "WTA · Player C — Player D", player: "Player C", opponent: "Player D", side: "B", probability: 0.60, odds: 2.0, freshnessLevel: "medium" }
  ]);
  assert.equal(portfolio.suggestions.length, 2);
  const planned = bank.savePortfolioPlan(initial, portfolio.suggestions);
  const result = bank.reconcilePortfolioPlan(planned, planned.pendingPlan.id, [
    { matchKey: "match:301", stake: 1.25, odds: 2.04 },
    { matchKey: "match:302", stake: 0, odds: 2.0 }
  ]);
  assert.equal(result.placedCount, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.bets[0].stake, 1.25);
  assert.equal(result.bets[0].odds, 2.04);
  assert.equal(result.bets[0].plannedStake, portfolio.suggestions[0].stake);
  assert.equal(result.bets[0].plannedOdds, portfolio.suggestions[0].odds);
  const stakeTx = result.state.transactions.find(tx => tx.type === "stake");
  assert.equal(stakeTx.actualStake, 1.25);
  assert.equal(stakeTx.actualOdds, 2.04);
  assert.equal(stakeTx.plannedStake, portfolio.suggestions[0].stake);
  assert.equal(stakeTx.plannedOdds, portfolio.suggestions[0].odds);
  assert.equal(result.state.balance, 98.75);
  assert.equal(result.state.openBets.length, 1);
  assert.equal(result.state.pendingPlan, null);
  assert.equal(result.state.transactions.filter(tx => tx.type === "stake").reduce((sum, tx) => sum + tx.amount, 0), 1.25);
  assert.equal(bank.validateState(result.state), result.state);
});

test("portfolio reconciliation rejects worse actual odds or oversized actual stake atomically", () => {
  const initial = bank.createInitialState(100);
  const portfolio = bank.recommendPortfolio(initial, [
    { matchKey: "match:401", matchId: 401, match: "ATP · Player E — Player F", player: "Player E", opponent: "Player F", side: "A", probability: 0.62, odds: 2.1, freshnessLevel: "good" }
  ]);
  const planned = bank.savePortfolioPlan(initial, portfolio.suggestions);
  assert.throws(() => bank.reconcilePortfolioPlan(planned, planned.pendingPlan.id, [
    { matchKey: "match:401", stake: 1, odds: 1.8 }
  ]), /Коэффициент ниже/);
  assert.throws(() => bank.reconcilePortfolioPlan(planned, planned.pendingPlan.id, [
    { matchKey: "match:401", stake: 100, odds: 2.1 }
  ]), /рекомендуемый лимит/);
  assert.equal(planned.balance, 100);
  assert.equal(planned.openBets.length, 0);
  assert.ok(planned.pendingPlan);
});



test("bankroll validation rejects corrupted settlement snapshots used for later result corrections", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 4321, side: "A"
  });
  const settled = bank.settleBet(placed.state, placed.bet.id, "won", { source: "verified", resultVersion: 1 });
  const corrupted = JSON.parse(JSON.stringify(settled));
  corrupted.transactions.find(tx => tx.type === "settlement").betSnapshot.odds = 99;
  assert.throws(() => bank.validateState(corrupted), /некорректная операция/);
});

test("bankroll validation rejects malformed planned and actual execution audit values", () => {
  const invalidBet = bank.createInitialState(100);
  const placed = bank.placeBet(invalidBet, { probability: 0.62, odds: 2.1, stake: 1 });
  placed.state.openBets[0].plannedStake = -1;
  assert.throws(() => bank.validateState(placed.state), /некорректная открытая ставка/);

  const invalidTransaction = bank.createInitialState(100);
  invalidTransaction.transactions.push({
    id: "tx-audit-invalid", type: "stake", amount: 1, balanceDelta: -1,
    actualOdds: 1, at: new Date().toISOString()
  });
  invalidTransaction.balance = 99;
  assert.throws(() => bank.validateState(invalidTransaction), /некорректная операция/);
});

test("verified settlement revisions remain idempotent across repeated corrections and reopening", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 987, side: "A"
  });
  const v1 = bank.settleVerifiedResults(placed.state, [
    { matchId: 987, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ]);
  assert.equal(v1.state.balance, 102.2);

  const duplicateV1 = bank.settleVerifiedResults(v1.state, [
    { matchId: 987, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ]);
  assert.equal(duplicateV1.updated, 0);
  assert.equal(duplicateV1.state.balance, 102.2);

  const v2 = bank.settleVerifiedResults(v1.state, [
    { matchId: 987, resultOutcome: "completed", resultWinner: 2, resultVersion: 2 }
  ]);
  assert.equal(v2.corrected.length, 1);
  assert.equal(v2.state.balance, 98);
  assert.equal(bank.realizedProfit(v2.state), -2);

  const v3 = bank.settleVerifiedResults(v2.state, [
    { matchId: 987, resultOutcome: "completed", resultWinner: 1, resultVersion: 3 }
  ]);
  assert.equal(v3.corrected.length, 1);
  assert.equal(v3.state.balance, 102.2);
  assert.equal(bank.realizedProfit(v3.state), 2.2);

  const v4 = bank.settleVerifiedResults(v3.state, [
    { matchId: 987, resultOutcome: "cancelled", resultWinner: null, resultVersion: 4 }
  ]);
  assert.equal(v4.reopened.length, 1);
  assert.equal(v4.state.openBets.length, 1);
  assert.equal(v4.state.balance, 98);
  assert.equal(bank.bankrollEquity(v4.state), 100);

  const v5 = bank.settleVerifiedResults(v4.state, [
    { matchId: 987, resultOutcome: "completed", resultWinner: 2, resultVersion: 5 }
  ]);
  assert.equal(v5.settled.length, 1);
  assert.equal(v5.state.openBets.length, 0);
  assert.equal(v5.state.balance, 98);
  assert.equal(bank.realizedProfit(v5.state), -2);
  assert.equal(bank.validateState(v5.state), v5.state);

  const duplicateV5 = bank.settleVerifiedResults(v5.state, [
    { matchId: 987, resultOutcome: "completed", resultWinner: 2, resultVersion: 5 }
  ]);
  assert.equal(duplicateV5.updated, 0);
  assert.equal(duplicateV5.state.balance, 98);
  assert.equal(bank.validateState(duplicateV5.state), duplicateV5.state);
});

test("official result revisions never overwrite a manually confirmed settlement", () => {
  const placed = bank.placeBet(bank.createInitialState(100), {
    probability: 0.6, odds: 2.1, stake: 2, matchId: 988, side: "A"
  });
  const manual = bank.settleBet(placed.state, placed.bet.id, "won");
  assert.equal(manual.balance, 102.2);

  const reconciled = bank.settleVerifiedResults(manual, [
    { matchId: 988, resultOutcome: "completed", resultWinner: 2, resultVersion: 99 }
  ]);
  assert.equal(reconciled.updated, 0);
  assert.equal(reconciled.state.balance, 102.2);
  assert.equal(bank.realizedProfit(reconciled.state), 2.2);
  assert.equal(reconciled.state.transactions.filter(tx => tx.type === "settlement").length, 1);
  assert.equal(reconciled.state.transactions.find(tx => tx.type === "settlement").source, "manual");
  assert.equal(bank.validateState(reconciled.state), reconciled.state);
});
