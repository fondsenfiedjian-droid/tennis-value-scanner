(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TVSBankroll = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const DEFAULTS = Object.freeze({ maxStakePercent: 2, maxExposurePercent: 8, kellyFraction: 0.25, minEv: 3, minOdds: 1.9 });

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function createInitialState(initialBankroll = 100) {
    const amount = roundMoney(Number(initialBankroll));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) throw new Error("Начальный банк должен быть положительным числом.");
    return {
      version: VERSION,
      initialBankroll: amount,
      balance: amount,
      openBets: [],
      transactions: [{ id: "initial", type: "deposit", amount, balanceDelta: amount, at: new Date().toISOString(), note: "Начальный банк" }]
    };
  }

  function validateState(state) {
    if (!state || typeof state !== "object" || state.version !== VERSION ||
        !Number.isFinite(state.initialBankroll) || state.initialBankroll <= 0 ||
        !Number.isFinite(state.balance) || state.balance < -0.001 ||
        !Array.isArray(state.openBets) || !Array.isArray(state.transactions)) {
      throw new Error("Повреждённые или неподдерживаемые данные банкролла.");
    }
    const ids = new Set();
    for (const bet of state.openBets) {
      if (!bet || typeof bet.id !== "string" || ids.has(bet.id) ||
          !Number.isFinite(bet.stake) || bet.stake <= 0 ||
          !Number.isFinite(bet.odds) || bet.odds <= 1 ||
          !Number.isFinite(bet.probability) || bet.probability <= 0 || bet.probability >= 1) {
        throw new Error("В журнале найдена некорректная открытая ставка.");
      }
      ids.add(bet.id);
    }
    let ledgerBalance = 0;
    for (const tx of state.transactions) {
      if (!tx || typeof tx.id !== "string" || !Number.isFinite(tx.amount) || tx.amount < 0 ||
          !Number.isFinite(tx.balanceDelta)) throw new Error("В журнале найдена некорректная операция.");
      ledgerBalance += tx.balanceDelta;
    }
    if (Math.abs(roundMoney(ledgerBalance) - state.balance) > 0.01) throw new Error("Баланс не совпадает с суммой операций журнала.");
    return state;
  }

  function cloneState(state) {
    validateState(state);
    return JSON.parse(JSON.stringify(state));
  }

  function totalOpenStake(state) {
    return roundMoney(state.openBets.reduce((sum, bet) => sum + bet.stake, 0));
  }

  function bankrollEquity(state) {
    return roundMoney(state.balance + totalOpenStake(state));
  }

  function realizedProfit(state) {
    return roundMoney(state.transactions.reduce((sum, tx) => sum + (tx.type === "settlement" ? Number(tx.profit || 0) : 0), 0));
  }

  function getSummary(state) {
    validateState(state);
    const deposits = state.transactions.filter(tx => tx.type === "deposit").reduce((s, tx) => s + tx.amount, 0);
    const withdrawals = state.transactions.filter(tx => tx.type === "withdrawal").reduce((s, tx) => s + tx.amount, 0);
    return {
      balance: roundMoney(state.balance),
      openStake: totalOpenStake(state),
      equity: bankrollEquity(state),
      realizedProfit: realizedProfit(state),
      deposits: roundMoney(deposits),
      withdrawals: roundMoney(withdrawals),
      openBets: state.openBets.length,
      exposurePercent: bankrollEquity(state) > 0 ? totalOpenStake(state) / bankrollEquity(state) * 100 : 0
    };
  }

  function recommendStake(state, probability, odds, options = {}) {
    validateState(state);
    const p = Number(probability), price = Number(odds);
    const cfg = { ...DEFAULTS, ...options };
    if (!Number.isFinite(p) || p <= 0 || p >= 1 || !Number.isFinite(price) || price <= 1) return { eligible: false, reason: "Некорректная вероятность или коэффициент.", stake: 0 };
    const ev = (p * price - 1) * 100;
    if (price < cfg.minOdds) return { eligible: false, reason: "Коэффициент ниже установленного минимума.", stake: 0, ev };
    if (ev < cfg.minEv) return { eligible: false, reason: "EV ниже установленного минимума.", stake: 0, ev };
    const equity = bankrollEquity(state);
    const maxStake = roundMoney(equity * cfg.maxStakePercent / 100);
    const maxExposure = roundMoney(equity * cfg.maxExposurePercent / 100);
    const remainingExposure = Math.max(0, roundMoney(maxExposure - totalOpenStake(state)));
    const b = price - 1, q = 1 - p;
    const fullKelly = Math.max(0, (b * p - q) / b);
    const kellyStake = equity * fullKelly * cfg.kellyFraction;
    const stake = roundMoney(Math.min(maxStake, remainingExposure, state.balance, kellyStake));
    if (stake < 0.01) return { eligible: false, reason: "Недостаточно свободного банка или исчерпан лимит риска.", stake: 0, ev, fullKelly };
    return { eligible: true, reason: "Допущена к ставке по заданным лимитам риска.", stake, ev, fullKelly, maxStake, remainingExposure };
  }

  function recommendPortfolio(input, candidates, options = {}) {
    let simulated = cloneState(input);
    const seenMatches = new Set();
    const ordered = (Array.isArray(candidates) ? candidates : [])
      .filter(item => item && Number.isFinite(Number(item.probability)) && Number(item.probability) > 0 && Number(item.probability) < 1 &&
        Number.isFinite(Number(item.odds)) && Number(item.odds) > 1)
      .slice()
      .sort((a, b) => Number(b.ev ?? ((Number(b.probability) * Number(b.odds) - 1) * 100)) -
        Number(a.ev ?? ((Number(a.probability) * Number(a.odds) - 1) * 100)));
    const suggestions = [];
    for (const candidate of ordered) {
      const matchKey = String(candidate.matchKey || candidate.match || [candidate.player, candidate.opponent].join("|"));
      if (seenMatches.has(matchKey)) continue;
      const cfg = { ...DEFAULTS, ...options, ...(candidate.options || {}) };
      const recommendation = recommendStake(simulated, candidate.probability, candidate.odds, cfg);
      if (!recommendation.eligible) continue;
      const placed = placeBet(simulated, {
        ...candidate,
        stake: recommendation.stake,
        options: cfg
      });
      simulated = placed.state;
      seenMatches.add(matchKey);
      suggestions.push({ ...candidate, stake: placed.bet.stake, ev: placed.bet.ev, recommendation });
    }
    return {
      suggestions,
      totalStake: roundMoney(suggestions.reduce((sum, item) => sum + item.stake, 0)),
      remainingBalance: simulated.balance,
      remainingExposure: totalOpenStake(simulated)
    };
  }

  function appendTransaction(state, transaction) {
    state.transactions.push({ ...transaction, at: transaction.at || new Date().toISOString() });
    return state;
  }

  function addDeposit(input, amount, note = "") {
    const state = cloneState(input), value = roundMoney(Number(amount));
    if (!Number.isFinite(value) || value <= 0) throw new Error("Сумма пополнения должна быть больше нуля.");
    state.balance = roundMoney(state.balance + value);
    appendTransaction(state, { id: "tx-" + makeId(), type: "deposit", amount: value, balanceDelta: value, note: String(note).slice(0, 160) });
    return state;
  }

  function addWithdrawal(input, amount, note = "") {
    const state = cloneState(input), value = roundMoney(Number(amount));
    if (!Number.isFinite(value) || value <= 0 || value > state.balance) throw new Error("Сумма снятия превышает свободный баланс или некорректна.");
    state.balance = roundMoney(state.balance - value);
    appendTransaction(state, { id: "tx-" + makeId(), type: "withdrawal", amount: value, balanceDelta: -value, note: String(note).slice(0, 160) });
    return state;
  }

  function placeBet(input, bet) {
    const state = cloneState(input);
    const probability = Number(bet.probability);
    const odds = Number(bet.odds);
    const recommendation = recommendStake(state, probability, odds, bet.options || {});
    const requested = bet.stake === undefined ? recommendation.stake : roundMoney(Number(bet.stake));
    if (!recommendation.eligible) throw new Error(recommendation.reason);
    if (!Number.isFinite(requested) || requested < 0.01 || requested > state.balance || requested > recommendation.stake) throw new Error("Размер ставки превышает рекомендуемый лимит или свободный баланс.");
    const exposureLimit = roundMoney(bankrollEquity(state) * (bet.options?.maxExposurePercent ?? DEFAULTS.maxExposurePercent) / 100);
    if (totalOpenStake(state) + requested > exposureLimit + 0.001) throw new Error("Ставка превышает общий лимит открытого риска.");
    const id = "bet-" + makeId();
    const record = {
      id, stake: requested, odds, probability, ev: (probability * odds - 1) * 100,
      match: String(bet.match || "").slice(0, 200), player: String(bet.player || "").slice(0, 100),
      opponent: String(bet.opponent || "").slice(0, 100), bookmaker: String(bet.bookmaker || "Winamax").slice(0, 60),
      matchId: Number.isSafeInteger(Number(bet.matchId)) && Number(bet.matchId) > 0 ? Number(bet.matchId) : null,
      side: bet.side === "A" || bet.side === "B" ? bet.side : null,
      placedAt: new Date().toISOString(), status: "open"
    };
    state.balance = roundMoney(state.balance - requested);
    state.openBets.push(record);
    appendTransaction(state, { id: "tx-" + makeId(), type: "stake", amount: requested, balanceDelta: -requested, betId: id, note: record.match });
    return { state, bet: record, recommendation };
  }

  function settleBet(input, betId, outcome) {
    const state = cloneState(input);
    const index = state.openBets.findIndex(bet => bet.id === betId);
    if (index < 0) throw new Error("Открытая ставка не найдена.");
    if (!["won", "lost", "void"].includes(outcome)) throw new Error("Неизвестный результат ставки.");
    const bet = state.openBets[index];
    const payout = outcome === "won" ? roundMoney(bet.stake * bet.odds) : outcome === "void" ? bet.stake : 0;
    const profit = outcome === "won" ? roundMoney(payout - bet.stake) : outcome === "lost" ? -bet.stake : 0;
    state.balance = roundMoney(state.balance + payout);
    state.openBets.splice(index, 1);
    appendTransaction(state, { id: "tx-" + makeId(), type: "settlement", amount: payout, balanceDelta: payout, profit, outcome, betId, note: bet.match });
    return state;
  }

  function settleVerifiedResults(input, archiveRows) {
    let state = cloneState(input);
    const settled = [];
    const rows = Array.isArray(archiveRows) ? archiveRows : [];
    for (const bet of [...state.openBets]) {
      if (!Number.isSafeInteger(bet.matchId) || bet.matchId <= 0 || !["A", "B"].includes(bet.side)) continue;
      const verified = rows.filter(row => Number(row.matchId) === bet.matchId &&
        row.resultOutcome === "completed" && [1, 2].includes(Number(row.resultWinner)));
      if (!verified.length) continue;
      const winners = new Set(verified.map(row => Number(row.resultWinner)));
      if (winners.size !== 1) continue;
      const winner = [...winners][0];
      const outcome = (bet.side === "A" ? 1 : 2) === winner ? "won" : "lost";
      state = settleBet(state, bet.id, outcome);
      settled.push({ betId: bet.id, matchId: bet.matchId, outcome });
    }
    return { state, settled };
  }

  function makeId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function serializeBackup(state) {
    validateState(state);
    const payload = { format: "tvs-bankroll-backup", version: VERSION, exportedAt: new Date().toISOString(), state };
    return payload;
  }

  function parseBackup(payload) {
    if (!payload || payload.format !== "tvs-bankroll-backup" || payload.version !== VERSION) throw new Error("Формат резервной копии банкролла не поддерживается.");
    return cloneState(payload.state);
  }

  return { VERSION, DEFAULTS, createInitialState, validateState, totalOpenStake, bankrollEquity, realizedProfit, getSummary, recommendStake, recommendPortfolio, addDeposit, addWithdrawal, placeBet, settleBet, settleVerifiedResults, serializeBackup, parseBackup, roundMoney };
});
