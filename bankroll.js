(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TVSBankroll = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const DEFAULTS = Object.freeze({ maxStakePercent: 2, maxExposurePercent: 8, maxDailyStakePercent: 8, kellyFraction: 0.25, minEv: 3, minOdds: 1.9 });

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
        !Array.isArray(state.openBets) || !Array.isArray(state.transactions) ||
        (state.pendingPlan !== undefined && state.pendingPlan !== null && (!state.pendingPlan || typeof state.pendingPlan !== "object" || typeof state.pendingPlan.id !== "string" || !Array.isArray(state.pendingPlan.suggestions)))) {
      throw new Error("Повреждённые или неподдерживаемые данные банкролла.");
    }
    const ids = new Set();
    for (const bet of state.openBets) {
      if (!bet || typeof bet.id !== "string" || !bet.id || ids.has(bet.id) ||
          !Number.isFinite(bet.stake) || bet.stake <= 0 ||
          !Number.isFinite(bet.odds) || bet.odds <= 1 ||
          !Number.isFinite(bet.probability) || bet.probability <= 0 || bet.probability >= 1 ||
          typeof bet.placedAt !== "string" || !Number.isFinite(Date.parse(bet.placedAt)) ||
          (bet.matchId !== null && bet.matchId !== undefined && (!Number.isSafeInteger(bet.matchId) || bet.matchId <= 0)) ||
          (bet.matchId && !["A", "B"].includes(bet.side)) ||\n          (bet.plannedStake !== undefined && bet.plannedStake !== null && (!Number.isFinite(bet.plannedStake) || bet.plannedStake < 0)) ||\n          (bet.plannedOdds !== undefined && bet.plannedOdds !== null && (!Number.isFinite(bet.plannedOdds) || bet.plannedOdds <= 1))) {
        throw new Error("В журнале найдена некорректная открытая ставка.");
      }
      ids.add(bet.id);
    }
    const transactionTypes = new Set(["deposit", "withdrawal", "stake", "settlement", "settlement_reversed", "settlement_reversal"]);
    const expectedDeltaSign = { deposit: 1, withdrawal: -1, stake: -1, settlement: 1, settlement_reversed: 1, settlement_reversal: -1 };
    let ledgerBalance = 0;
    for (const tx of state.transactions) {
      if (!tx || typeof tx.id !== "string" || !tx.id || ids.has(tx.id) ||
          !transactionTypes.has(tx.type) || !Number.isFinite(tx.amount) || tx.amount < 0 ||
          !Number.isFinite(tx.balanceDelta) || typeof tx.at !== "string" || !Number.isFinite(Date.parse(tx.at)) ||
          Math.abs(tx.balanceDelta - expectedDeltaSign[tx.type] * tx.amount) > 0.01 ||
          (tx.profit !== undefined && !Number.isFinite(tx.profit)) ||
          (tx.stake !== undefined && (!Number.isFinite(tx.stake) || tx.stake < 0)) ||
          (tx.plannedStake !== undefined && tx.plannedStake !== null && (!Number.isFinite(tx.plannedStake) || tx.plannedStake < 0)) ||
          (tx.actualStake !== undefined && tx.actualStake !== null && (!Number.isFinite(tx.actualStake) || tx.actualStake < 0)) ||
          (tx.plannedOdds !== undefined && tx.plannedOdds !== null && (!Number.isFinite(tx.plannedOdds) || tx.plannedOdds <= 1)) ||
          (tx.actualOdds !== undefined && tx.actualOdds !== null && (!Number.isFinite(tx.actualOdds) || tx.actualOdds <= 1)) ||
          (tx.resultVersion !== undefined && tx.resultVersion !== null && (!Number.isSafeInteger(tx.resultVersion) || tx.resultVersion < 1))) {
        throw new Error("В журнале найдена некорректная операция.");
      }
      ids.add(tx.id);
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
    const deposits = state.transactions.filter(tx => tx.type === "deposit" && tx.id !== "initial").reduce((s, tx) => s + tx.amount, 0);
    const withdrawals = state.transactions.filter(tx => tx.type === "withdrawal").reduce((s, tx) => s + tx.amount, 0);
    const totalStaked = state.transactions.filter(tx => tx.type === "stake").reduce((s, tx) => s + tx.amount, 0);
    const today = new Date().toDateString();
    const dailyStaked = state.transactions.filter(tx => tx.type === "stake" && new Date(tx.at).toDateString() === today).reduce((s, tx) => s + tx.amount, 0);
    const settlements = state.transactions.filter(tx => tx.type === "settlement");
    const settledStake = settlements.filter(tx => tx.outcome !== "void").reduce((s, tx) => s + Number(tx.stake || 0), 0);
    const voidedStake = settlements.filter(tx => tx.outcome === "void").reduce((s, tx) => s + Number(tx.stake || 0), 0);
    const voidedBets = settlements.filter(tx => tx.outcome === "void").length;
    const manualSettledBets = settlements.filter(tx => tx.source !== "verified").length;
    const verifiedSettledBets = settlements.filter(tx => tx.source === "verified").length;
    const profit = realizedProfit(state);
    const totalInflow = state.transactions.reduce((sum, tx) => sum + Math.max(0, tx.balanceDelta), 0);
    const totalOutflow = state.transactions.reduce((sum, tx) => sum + Math.max(0, -tx.balanceDelta), 0);
    return {
      balance: roundMoney(state.balance),
      openStake: totalOpenStake(state),
      equity: bankrollEquity(state),
      initialBankroll: roundMoney(state.initialBankroll),
      realizedProfit: profit,
      totalStaked: roundMoney(totalStaked),
      dailyStaked: roundMoney(dailyStaked),
      settledStake: roundMoney(settledStake),
      voidedStake: roundMoney(voidedStake),
      voidedBets,
      manualSettledBets,
      verifiedSettledBets,
      settledBets: settlements.length,
      roiPercent: settledStake > 0 ? roundMoney(profit / settledStake * 100) : null,
      deposits: roundMoney(deposits),
      withdrawals: roundMoney(withdrawals),
      totalInflow: roundMoney(totalInflow),
      totalOutflow: roundMoney(totalOutflow),
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
    const today = new Date().toDateString();
    const dailyStaked = state.transactions.filter(tx => tx.type === "stake" && new Date(tx.at).toDateString() === today)
      .reduce((sum, tx) => sum + tx.amount, 0);
    const maxDailyStake = roundMoney(equity * cfg.maxDailyStakePercent / 100);
    const remainingDailyStake = Math.max(0, roundMoney(maxDailyStake - dailyStaked));
    const b = price - 1, q = 1 - p;
    const fullKelly = Math.max(0, (b * p - q) / b);
    const kellyStake = equity * fullKelly * cfg.kellyFraction;
    const stake = roundMoney(Math.min(maxStake, remainingExposure, remainingDailyStake, state.balance, kellyStake));
    if (stake < 0.01) return { eligible: false, reason: "Недостаточно свободного банка или исчерпан дневной/общий лимит риска.", stake: 0, ev, fullKelly };
    return { eligible: true, reason: "Допущена к ставке по заданным лимитам риска.", stake, ev, fullKelly, maxStake, remainingExposure, remainingDailyStake };
  }

  function recommendPortfolio(input, candidates, options = {}) {
    let simulated = cloneState(input);
    const seenMatches = new Set();
    const existingMatchIds = new Set(simulated.openBets.map(bet => Number(bet.matchId)).filter(id => Number.isSafeInteger(id) && id > 0));
    const existingMatchKeys = new Set(simulated.openBets.map(bet => String(bet.matchKey || "").trim()).filter(Boolean));
    const existingMatchLabels = new Set(simulated.openBets.map(bet => String(bet.match || "").trim().toLocaleLowerCase()).filter(Boolean));
    const ordered = (Array.isArray(candidates) ? candidates : [])
      .filter(item => item && Number.isFinite(Number(item.probability)) && Number(item.probability) > 0 && Number(item.probability) < 1 &&
        Number.isFinite(Number(item.odds)) && Number(item.odds) > 1)
      .slice()
      .sort((a, b) => ((Number(b.probability) * Number(b.odds) - 1) * 100) -
        ((Number(a.probability) * Number(a.odds) - 1) * 100));
    const suggestions = [];
    for (const candidate of ordered) {
      const matchKey = String(candidate.matchKey || candidate.match || [candidate.player, candidate.opponent].join("|"));
      const matchId = Number(candidate.matchId);
      const matchLabel = String(candidate.match || "").trim().toLocaleLowerCase();
      if (seenMatches.has(matchKey) ||
          (Number.isSafeInteger(matchId) && matchId > 0 && existingMatchIds.has(matchId)) ||
          existingMatchKeys.has(matchKey) ||
          (matchLabel && existingMatchLabels.has(matchLabel))) continue;
      const cfg = { ...DEFAULTS, ...options, ...(candidate.options || {}) };
      const recommendation = recommendStake(simulated, candidate.probability, candidate.odds, cfg);
      if (!recommendation.eligible) continue;
      const multiplier = candidate.stakeMultiplier === undefined ? 1 : Math.max(0, Math.min(1, Number(candidate.stakeMultiplier)));
      if (!Number.isFinite(multiplier) || multiplier <= 0) continue;
      const allocatedStake = roundMoney(recommendation.stake * multiplier);
      if (allocatedStake < 0.01) continue;
      const placed = placeBet(simulated, {
        ...candidate,
        stake: allocatedStake,
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

  function savePortfolioPlan(input, suggestions) {
    const state = cloneState(input);
    if (state.pendingPlan) throw new Error("Сначала подтвердите или отмените уже сохранённый план портфеля.");
    if (!Array.isArray(suggestions) || !suggestions.length) throw new Error("Нет ставок для планирования.");
    const seen = new Set();
    const clean = suggestions.map(item => {
      const probability = Number(item.probability), odds = Number(item.odds), stake = roundMoney(Number(item.stake));
      const matchKey = String(item.matchKey || item.match || "").trim();
      if (!matchKey || seen.has(matchKey) || !Number.isFinite(probability) || probability <= 0 || probability >= 1 ||
          !Number.isFinite(odds) || odds <= 1 || !Number.isFinite(stake) || stake < 0.01) {
        throw new Error("План содержит некорректную или повторную ставку.");
      }
      seen.add(matchKey);
      return {
        matchKey, matchId: Number.isSafeInteger(Number(item.matchId)) && Number(item.matchId) > 0 ? Number(item.matchId) : null,
        match: String(item.match || "").slice(0, 200), player: String(item.player || "").slice(0, 100),
        opponent: String(item.opponent || "").slice(0, 100), bookmaker: String(item.bookmaker || "Winamax").slice(0, 60),
        side: item.side === "A" || item.side === "B" ? item.side : null,
        probability, odds, stake, ev: (probability * odds - 1) * 100,
        freshnessLevel: item.freshnessLevel === "good" ? "good" : "medium"
      };
    });
    state.pendingPlan = {
      id: "plan-" + makeId(), createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      suggestions: clean, totalStake: roundMoney(clean.reduce((sum, item) => sum + item.stake, 0))
    };
    validateState(state);
    return state;
  }

  function reconcilePortfolioPlan(input, planId, actuals) {
    let state = cloneState(input);
    const plan = state.pendingPlan;
    if (!plan || plan.id !== planId) throw new Error("План портфеля не найден. Обновите данные.");
    if (!Number.isFinite(Date.parse(plan.expiresAt)) || Date.parse(plan.expiresAt) <= Date.now()) {
      throw new Error("План устарел (срок действия 15 минут). Пересчитайте портфель по актуальным коэффициентам.");
    }
    if (!Array.isArray(actuals) || actuals.length !== plan.suggestions.length) {
      throw new Error("Нужно указать фактическую сумму для каждой позиции плана. Ноль означает, что ставка не была размещена.");
    }
    const byKey = new Map();
    for (const actual of actuals) {
      const key = String(actual?.matchKey || "").trim();
      if (!key || byKey.has(key)) throw new Error("Фактические данные содержат повторную или пустую позицию.");
      byKey.set(key, actual);
    }
    if (byKey.size !== plan.suggestions.length) throw new Error("Состав фактических ставок не совпадает с планом.");
    const placed = [];
    let skipped = 0;
    for (const item of plan.suggestions) {
      const actual = byKey.get(item.matchKey);
      if (!actual) throw new Error("Не найдены фактические данные для матча: " + item.match);
      const stake = roundMoney(Number(actual.stake));
      if (!Number.isFinite(stake) || stake < 0) throw new Error("Фактическая сумма должна быть нулём или положительным числом.");
      if (stake === 0) { skipped++; continue; }
      const odds = Number(actual.odds);
      if (!Number.isFinite(odds) || odds <= 1) throw new Error("Укажите фактический коэффициент больше 1 для матча: " + item.match);
      const result = placeBet(state, { ...item, stake, odds, plannedStake: item.stake, plannedOdds: item.odds });
      state = result.state;
      placed.push(result.bet);
    }
    state.pendingPlan = null;
    validateState(state);
    return { state, bets: placed, skipped, placedCount: placed.length };
  }

  function confirmPortfolioPlan(input, planId) {
    const state = cloneState(input);
    const plan = state.pendingPlan;
    if (!plan || plan.id !== planId) throw new Error("План портфеля не найден. Обновите данные.");
    return reconcilePortfolioPlan(state, planId, plan.suggestions.map(item => ({
      matchKey: item.matchKey, stake: item.stake, odds: item.odds
    })));
  }

  function cancelPortfolioPlan(input, planId) {
    const state = cloneState(input);
    if (!state.pendingPlan || state.pendingPlan.id !== planId) throw new Error("План портфеля не найден.");
    state.pendingPlan = null;
    return state;
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
    const matchKey = String(bet.matchKey || "").trim();
    const matchId = Number(bet.matchId);
    const matchLabel = String(bet.match || "").trim().toLocaleLowerCase();
    if (state.openBets.some(existing =>
      (matchKey && existing.matchKey === matchKey) ||
      (Number.isSafeInteger(matchId) && matchId > 0 && existing.matchId === matchId) ||
      (matchLabel && String(existing.match || "").trim().toLocaleLowerCase() === matchLabel))) {
      throw new Error("Ставка на этот матч уже есть в открытом журнале. Повторная запись заблокирована.");
    }
    const requested = bet.stake === undefined ? recommendation.stake : roundMoney(Number(bet.stake));
    if (!recommendation.eligible) throw new Error(recommendation.reason);
    if (!Number.isFinite(requested) || requested < 0.01 || requested > state.balance || requested > recommendation.stake) throw new Error("Размер ставки превышает рекомендуемый лимит или свободный баланс.");
    const exposureLimit = roundMoney(bankrollEquity(state) * (bet.options?.maxExposurePercent ?? DEFAULTS.maxExposurePercent) / 100);
    if (totalOpenStake(state) + requested > exposureLimit + 0.001) throw new Error("Ставка превышает общий лимит открытого риска.");
    const id = "bet-" + makeId();
    const record = {
      id, stake: requested, odds, probability, ev: (probability * odds - 1) * 100,
      plannedStake: bet.plannedStake === undefined ? null : roundMoney(Number(bet.plannedStake)),
      plannedOdds: bet.plannedOdds === undefined ? null : Number(bet.plannedOdds),
      match: String(bet.match || "").slice(0, 200), matchKey: String(bet.matchKey || "").slice(0, 240), player: String(bet.player || "").slice(0, 100),
      opponent: String(bet.opponent || "").slice(0, 100), bookmaker: String(bet.bookmaker || "Winamax").slice(0, 60),
      matchId: Number.isSafeInteger(Number(bet.matchId)) && Number(bet.matchId) > 0 ? Number(bet.matchId) : null,
      side: bet.side === "A" || bet.side === "B" ? bet.side : null,
      placedAt: new Date().toISOString(), status: "open"
    };
    state.balance = roundMoney(state.balance - requested);
    state.openBets.push(record);
    appendTransaction(state, { id: "tx-" + makeId(), type: "stake", amount: requested, balanceDelta: -requested, betId: id, plannedStake: record.plannedStake, plannedOdds: record.plannedOdds, actualStake: requested, actualOdds: odds, note: record.match });
    return { state, bet: record, recommendation };
  }

  function settleBet(input, betId, outcome, metadata = {}) {
    const state = cloneState(input);
    const index = state.openBets.findIndex(bet => bet.id === betId);
    if (index < 0) throw new Error("Открытая ставка не найдена.");
    if (!["won", "lost", "void"].includes(outcome)) throw new Error("Неизвестный результат ставки.");
    const bet = state.openBets[index];
    const snapshot = { ...bet };
    const payout = outcome === "won" ? roundMoney(bet.stake * bet.odds) : outcome === "void" ? bet.stake : 0;
    const profit = outcome === "won" ? roundMoney(payout - bet.stake) : outcome === "lost" ? -bet.stake : 0;
    state.balance = roundMoney(state.balance + payout);
    state.openBets.splice(index, 1);
    appendTransaction(state, {
      id: "tx-" + makeId(), type: "settlement", amount: payout, balanceDelta: payout,
      stake: bet.stake, profit, outcome, betId, note: bet.match,
      source: metadata.source === "verified" ? "verified" : "manual",
      matchId: bet.matchId, side: bet.side,
      resultVersion: Number.isSafeInteger(metadata.resultVersion) && metadata.resultVersion >= 1 ? metadata.resultVersion : null,
      betSnapshot: snapshot
    });
    return state;
  }

  function verifiedResultForMatch(rows, matchId) {
    const relevant = rows.filter(row => Number(row.matchId) === matchId &&
      ["completed", "retired", "walkover", "default", "abandoned", "unresolved", "cancelled"].includes(String(row.resultOutcome || "")));
    if (!relevant.length) return null;
    const versions = relevant.map(row => Number.isSafeInteger(Number(row.resultVersion)) && Number(row.resultVersion) >= 1 ? Number(row.resultVersion) : null);
    const knownVersions = versions.filter(version => version !== null);
    const latestVersion = knownVersions.length ? Math.max(...knownVersions) : null;
    const latest = relevant.filter((row, index) => latestVersion === null ? versions[index] === null : versions[index] === latestVersion);
    const outcomes = new Set(latest.map(row => String(row.resultOutcome)));
    if (outcomes.size !== 1) return null;
    const outcome = [...outcomes][0];
    const winners = new Set(latest.map(row => Number(row.resultWinner)).filter(winner => [1, 2].includes(winner)));
    if (outcome === "completed" && (winners.size !== 1 || latest.some(row => ![1, 2].includes(Number(row.resultWinner))))) return null;
    return { outcome, winner: winners.size === 1 ? [...winners][0] : null, version: latestVersion };
  }

  function settleVerifiedResults(input, archiveRows) {
    let state = cloneState(input);
    const rows = Array.isArray(archiveRows) ? archiveRows : [];
    const settled = [], corrected = [], reopened = [], metadataUpdated = [];
    for (const bet of [...state.openBets]) {
      if (!Number.isSafeInteger(bet.matchId) || bet.matchId <= 0 || !["A", "B"].includes(bet.side)) continue;
      const result = verifiedResultForMatch(rows, bet.matchId);
      if (!result) continue;
      const previousVersion = Number.isSafeInteger(bet.lastResultVersion) ? bet.lastResultVersion : null;
      if (previousVersion !== null && (result.version === null || result.version <= previousVersion)) continue;
      if (result.outcome !== "completed") {
        if (result.version !== null && result.version !== previousVersion) {
          bet.lastResultVersion = result.version;
          metadataUpdated.push({ betId: bet.id, matchId: bet.matchId, resultVersion: result.version, outcome: result.outcome });
        }
        continue;
      }
      const outcome = (bet.side === "A" ? 1 : 2) === result.winner ? "won" : "lost";
      state = settleBet(state, bet.id, outcome, { source: "verified", resultVersion: result.version });
      settled.push({ betId: bet.id, matchId: bet.matchId, outcome });
    }

    for (const transaction of [...state.transactions]) {
      if (transaction.type !== "settlement" || transaction.source !== "verified" ||
          !Number.isSafeInteger(transaction.matchId) || !transaction.betSnapshot) continue;
      const result = verifiedResultForMatch(rows, transaction.matchId);
      if (!result || result.version === null) continue;
      const previousVersion = Number.isSafeInteger(transaction.resultVersion) ? transaction.resultVersion : null;
      if (previousVersion !== null && result.version <= previousVersion) continue;
      const snapshot = transaction.betSnapshot;
      if (result.outcome === "completed") {
        const outcome = (snapshot.side === "A" ? 1 : 2) === result.winner ? "won" : "lost";
        const payout = outcome === "won" ? roundMoney(snapshot.stake * snapshot.odds) : 0;
        const profit = outcome === "won" ? roundMoney(payout - snapshot.stake) : -snapshot.stake;
        const oldPayout = transaction.amount;
        state.balance = roundMoney(state.balance + payout - oldPayout);
        transaction.type = "settlement_reversed";
        transaction.profit = 0;
        transaction.outcome = "superseded_by_result_revision";
        transaction.resultVersion = result.version;
        appendTransaction(state, {
          id: "tx-" + makeId(), type: "settlement_reversal", amount: oldPayout,
          balanceDelta: -oldPayout, betId: transaction.betId,
          note: "Отменён предыдущий расчёт после исправления результата"
        });
        appendTransaction(state, {
          id: "tx-" + makeId(), type: "settlement", amount: payout,
          balanceDelta: payout, stake: snapshot.stake, profit, outcome,
          betId: transaction.betId, note: snapshot.match, source: "verified",
          matchId: transaction.matchId, side: transaction.side,
          resultVersion: result.version, betSnapshot: snapshot
        });
        corrected.push({ betId: transaction.betId, matchId: transaction.matchId, outcome });
      } else {
        const oldPayout = transaction.amount;
        state.balance = roundMoney(state.balance - oldPayout);
        transaction.type = "settlement_reversed";
        transaction.profit = 0;
        transaction.outcome = "reopened_after_result_revision";
        transaction.resultVersion = result.version;
        state.openBets.push({ ...snapshot, lastResultVersion: result.version, status: "open" });
        appendTransaction(state, {
          id: "tx-" + makeId(), type: "settlement_reversal", amount: oldPayout,
          balanceDelta: -oldPayout, betId: transaction.betId,
          note: "Официальный результат изменён; ставка открыта повторно"
        });
        reopened.push({ betId: transaction.betId, matchId: transaction.matchId });
      }
    }
    validateState(state);
    return { state, settled, corrected, reopened, metadataUpdated, updated: settled.length + corrected.length + reopened.length + metadataUpdated.length };
  }

  function makeId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function checksum(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function serializeBackup(state) {
    validateState(state);
    const snapshot = JSON.stringify(state);
    return { format: "tvs-bankroll-backup", version: VERSION, exportedAt: new Date().toISOString(), checksum: checksum(snapshot), state };
  }

  function parseBackup(payload) {
    if (!payload || payload.format !== "tvs-bankroll-backup" || payload.version !== VERSION) throw new Error("Формат резервной копии банкролла не поддерживается.");
    if (typeof payload.checksum !== "string" || checksum(JSON.stringify(payload.state)) !== payload.checksum) {
      throw new Error("Контрольная сумма резервной копии банкролла не совпадает.");
    }
    return cloneState(payload.state);
  }

  return { VERSION, DEFAULTS, createInitialState, validateState, totalOpenStake, bankrollEquity, realizedProfit, getSummary, recommendStake, recommendPortfolio, savePortfolioPlan, reconcilePortfolioPlan, confirmPortfolioPlan, cancelPortfolioPlan, addDeposit, addWithdrawal, placeBet, settleBet, settleVerifiedResults, serializeBackup, parseBackup, roundMoney };
});
