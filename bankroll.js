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
          (bet.matchId && !["A", "B"].includes(bet.side)) ||
        (bet.matchDate !== undefined && bet.matchDate !== null && (typeof bet.matchDate !== "string" || !Number.isFinite(Date.parse(bet.matchDate)))) ||
          (bet.plannedStake !== undefined && bet.plannedStake !== null && (!Number.isFinite(bet.plannedStake) || bet.plannedStake < 0)) ||
          (bet.plannedOdds !== undefined && bet.plannedOdds !== null && (!Number.isFinite(bet.plannedOdds) || bet.plannedOdds <= 1))) {
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

  function normalizeMatchKey(value) {
    return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
  }

  function matchIdentity(item) {
    const rawId = Number(item?.matchId);
    return {
      id: Number.isSafeInteger(rawId) && rawId > 0 ? rawId : null,
      key: normalizeMatchKey(item?.matchKey || item?.match || ""),
      label: normalizeMatchKey(item?.match || "")
    };
  }

  function identitiesOverlap(a, b) {
    return (a.id !== null && b.id !== null && a.id === b.id) ||
      (a.key && b.key && a.key === b.key) ||
      (a.label && b.label && a.label === b.label);
  }

  function bankrollEquity(state) {
    return roundMoney(state.balance + totalOpenStake(state));
  }

  function realizedProfit(state) {
    return roundMoney(state.transactions.reduce((sum, tx) => sum + (tx.type === "settlement" ? Number(tx.profit || 0) : 0), 0));
  }

  function calculateDrawdown(state) {
    const settlements = state.transactions.filter(tx => tx.type === "settlement").slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let performanceBank = state.initialBankroll;
    let peak = performanceBank;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let currentDrawdown = 0;
    let currentDrawdownPercent = 0;
    for (const tx of settlements) {
      performanceBank = roundMoney(performanceBank + Number(tx.profit || 0));
      if (performanceBank > peak) peak = performanceBank;
      const drawdown = roundMoney(Math.max(0, peak - performanceBank));
      const percent = peak > 0 ? drawdown / peak * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      if (percent > maxDrawdownPercent) maxDrawdownPercent = percent;
      currentDrawdown = drawdown;
      currentDrawdownPercent = percent;
    }
    return {
      currentDrawdown: roundMoney(currentDrawdown),
      currentDrawdownPercent: roundMoney(currentDrawdownPercent),
      maxDrawdown: roundMoney(maxDrawdown),
      maxDrawdownPercent: roundMoney(maxDrawdownPercent)
    };
  }
  function getOutcomeSequenceStats(state) {
    validateState(state);
    const ordered = state.transactions
      .map((tx, index) => ({ tx, index }))
      .filter(item => item.tx.type === "settlement")
      .sort((a, b) => Date.parse(a.tx.at) - Date.parse(b.tx.at) || a.index - b.index);
    let wins = 0, losses = 0, voids = 0, excluded = 0;
    let grossProfit = 0, grossLoss = 0;
    let currentType = null, currentLength = 0;
    let longestWinStreak = 0, longestLossStreak = 0;
    for (const { tx } of ordered) {
      const outcome = String(tx.outcome || "").toLowerCase();
      const stake = Number(tx.stake);
      const profit = Number(tx.profit);
      if (outcome === "void") { voids++; continue; }
      if (!["won", "lost"].includes(outcome) || !Number.isFinite(stake) || stake <= 0 || !Number.isFinite(profit)) {
        excluded++;
        continue;
      }
      if (outcome === "won") {
        wins++;
        if (profit > 0) grossProfit += profit;
      } else {
        losses++;
        if (profit < 0) grossLoss += Math.abs(profit);
      }
      if (currentType === outcome) currentLength++;
      else { currentType = outcome; currentLength = 1; }
      if (outcome === "won") longestWinStreak = Math.max(longestWinStreak, currentLength);
      else longestLossStreak = Math.max(longestLossStreak, currentLength);
    }
    const settledBets = wins + losses;
    return {
      settledBets, wins, losses, voids, excluded,
      winRatePercent: settledBets ? roundMoney(wins / settledBets * 100) : null,
      profitFactor: grossLoss > 0 ? roundMoney(grossProfit / grossLoss) : null,
      grossProfit: roundMoney(grossProfit), grossLoss: roundMoney(grossLoss),
      currentStreak: { type: currentType, length: currentLength },
      longestWinStreak, longestLossStreak
    };
  }

  function getOutcomeDispersionStats(state) {
    validateState(state);
    const returns = [], winningProfits = [];
    let netProfit = 0, largestWin = null, largestLoss = null, excluded = 0, voids = 0;
    for (const tx of state.transactions) {
      if (tx.type !== "settlement") continue;
      const outcome = String(tx.outcome || "").toLowerCase();
      if (outcome === "void") { voids++; continue; }
      const stake = Number(tx.stake), profit = Number(tx.profit);
      const validSign = (outcome === "won" && profit > 0) || (outcome === "lost" && profit < 0);
      if (!["won", "lost"].includes(outcome) || !Number.isFinite(stake) || stake <= 0 ||
          !Number.isFinite(profit) || !validSign) { excluded++; continue; }
      const returnPercent = profit / stake * 100;
      if (!Number.isFinite(returnPercent)) { excluded++; continue; }
      returns.push(returnPercent);
      netProfit += profit;
      if (profit > 0) {
        winningProfits.push(profit);
        largestWin = largestWin === null ? profit : Math.max(largestWin, profit);
      } else largestLoss = largestLoss === null ? profit : Math.min(largestLoss, profit);
    }
    const sorted = returns.slice().sort((a, b) => a - b), count = sorted.length;
    const mean = count ? sorted.reduce((sum, value) => sum + value, 0) / count : null;
    const median = count ? (count % 2 ? sorted[(count - 1) / 2] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2) : null;
    const variance = count > 1 ? sorted.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (count - 1) : null;
    const grossWinningProfit = winningProfits.reduce((sum, value) => sum + value, 0);
    const topThreeProfit = winningProfits.slice().sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0);
    return {
      sampleSize: count, voids, excluded, netProfit: roundMoney(netProfit),
      meanReturnPercent: mean === null ? null : roundMoney(mean),
      medianReturnPercent: median === null ? null : roundMoney(median),
      returnStdDevPercent: variance === null ? null : roundMoney(Math.sqrt(variance)),
      largestWin: largestWin === null ? null : roundMoney(largestWin),
      largestLoss: largestLoss === null ? null : roundMoney(largestLoss),
      topThreeWinSharePercent: grossWinningProfit > 0 ? roundMoney(topThreeProfit / grossWinningProfit * 100) : null,
      netProfitWithoutTopThreeWins: roundMoney(netProfit - topThreeProfit)
    };
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
    const drawdown = calculateDrawdown(state);
    const outcomeSequence = getOutcomeSequenceStats(state);
    const outcomeDispersion = getOutcomeDispersionStats(state);
    const totalInflow = state.transactions.reduce((sum, tx) => sum + Math.max(0, tx.balanceDelta), 0);
    const totalOutflow = state.transactions.reduce((sum, tx) => sum + Math.max(0, -tx.balanceDelta), 0);
    return {
      balance: roundMoney(state.balance),
      openStake: totalOpenStake(state),
      equity: bankrollEquity(state),
      initialBankroll: roundMoney(state.initialBankroll),
      realizedProfit: profit,
      ...drawdown,
      outcomeSequence,
      outcomeDispersion,
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

  function getBookmakerSummary(state) {
    validateState(state);
    const groups = new Map();
    const groupFor = value => {
      const name = typeof value === "string" && value.trim() ? value.trim().slice(0, 60) : "Не указан";
      if (!groups.has(name)) groups.set(name, { bookmaker: name, settledBets: 0, wins: 0, losses: 0, voids: 0, totalStaked: 0, voidedStake: 0, profit: 0, openBets: 0, openStake: 0 });
      return groups.get(name);
    };
    for (const tx of state.transactions) {
      if (tx.type !== "settlement") continue;
      const group = groupFor(tx.bookmaker || tx.betSnapshot?.bookmaker || "");
      group.settledBets++;
      const outcome = String(tx.outcome || "");
      if (outcome === "won") group.wins++;
      else if (outcome === "lost") group.losses++;
      else if (outcome === "void") group.voids++;
      const stake = Number(tx.stake || 0);
      if (outcome === "void") group.voidedStake += stake;
      else group.totalStaked += stake;
      group.profit += Number(tx.profit || 0);
    }
    for (const bet of state.openBets) {
      const group = groupFor(bet.bookmaker || "");
      group.openBets++;
      group.openStake += bet.stake;
    }
    return [...groups.values()].map(group => ({
      ...group, totalStaked: roundMoney(group.totalStaked), voidedStake: roundMoney(group.voidedStake),
      profit: roundMoney(group.profit), openStake: roundMoney(group.openStake),
      roiPercent: group.totalStaked > 0 ? roundMoney(group.profit / group.totalStaked * 100) : null
    })).sort((a, b) => b.totalStaked - a.totalStaked || a.bookmaker.localeCompare(b.bookmaker, "ru"));
  }

  function normalizePerformanceSurface(value) {
    const v = String(value || "").trim().toLowerCase();
    if (/clay|грунт|terre/.test(v)) return "Грунт";
    if (/grass|трава|gazon/.test(v)) return "Трава";
    if (/hard|хард|бетон|акрил/.test(v)) return "Хард";
    if (/carpet|ковёр|ковер/.test(v)) return "Ковёр";
    return null;
  }

  function normalizePerformanceTour(value) {
    const v = String(value || "").trim().toLowerCase();
    return ({ atp: "ATP", wta: "WTA", challenger: "Challenger", itf: "ITF", juniors: "Juniors" })[v] || null;
  }

  function normalizePerformanceName(value) {
    return typeof value === "string" ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() : "";
  }

  function getSegmentPerformance(state, archiveRows = []) {
    validateState(state);
    const archive = Array.isArray(archiveRows) ? archiveRows : [];
    const groups = {
      surface: { label: "Покрытие", normalize: normalizePerformanceSurface },
      tour: { label: "Категория турнира", normalize: normalizePerformanceTour },
      bookmaker: { label: "Букмекер", normalize: value => typeof value === "string" && value.trim() ? value.trim().slice(0, 60) : null },
      oddsBand: { label: "Диапазон коэффициента", normalize: value => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 1) return null;
        if (n < 1.5) return "1.01–1.49";
        if (n < 1.8) return "1.50–1.79";
        if (n < 2.1) return "1.80–2.09";
        if (n < 2.5) return "2.10–2.49";
        if (n < 3) return "2.50–2.99";
        return "3.00+";
      } },
      evBand: { label: "Диапазон EV", normalize: value => {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        if (n < 0) return "Отрицательный";
        if (n < 5) return "0–4.99%";
        if (n < 10) return "5–9.99%";
        if (n < 15) return "10–14.99%";
        return "15%+";
      } },
      probabilityBand: { label: "Вероятность модели", normalize: value => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0 || n >= 1) return null;
        const percent = n * 100;
        if (percent < 50) return "Ниже 50%";
        if (percent < 55) return "50–54.99%";
        if (percent < 60) return "55–59.99%";
        if (percent < 65) return "60–64.99%";
        if (percent < 70) return "65–69.99%";
        if (percent < 75) return "70–74.99%";
        if (percent < 80) return "75–79.99%";
        return "80%+";
      } }
    };
    const output = {};
    for (const [key, dimension] of Object.entries(groups)) {
      const buckets = new Map();
      const getBucket = name => {
        const label = name || "Неизвестно";
        if (!buckets.has(label)) buckets.set(label, {
          name: label, settledBets: 0, wins: 0, losses: 0, voids: 0, excluded: 0,
          settledStake: 0, voidedStake: 0, profit: 0
        });
        return buckets.get(label);
      };
      for (const tx of state.transactions) {
        if (tx.type !== "settlement") continue;
        const snapshot = tx.betSnapshot && typeof tx.betSnapshot === "object" ? tx.betSnapshot : {};
        let rawValue = key === "oddsBand" ? (snapshot.odds ?? tx.actualOdds) :
          key === "evBand" ? (snapshot.ev ?? tx.ev) :
          key === "probabilityBand" ? snapshot.probability : tx[key] ?? snapshot[key];
        if ((key === "surface" || key === "tour") && !dimension.normalize(rawValue)) {
          const matchId = Number(tx.matchId ?? snapshot.matchId);
          const side = tx.side ?? snapshot.side;
          const player = normalizePerformanceName(snapshot.player);
          const opponent = normalizePerformanceName(snapshot.opponent);
          if (Number.isSafeInteger(matchId) && matchId > 0 && ["A", "B"].includes(side)) {
            const matches = archive.filter(row => Number(row.matchId) === matchId && row.side === side &&
              (!player || normalizePerformanceName(row.player) === player) &&
              (!opponent || normalizePerformanceName(row.opponent) === opponent));
            const values = [...new Set(matches.map(row => dimension.normalize(row[key])).filter(Boolean))];
            if (values.length === 1) rawValue = values[0];
          }
        }
        const value = dimension.normalize(rawValue);
        const bucket = getBucket(value);
        const outcome = String(tx.outcome || "").toLowerCase();
        const stake = Number(tx.stake);
        const profit = Number(tx.profit);
        if (outcome === "void") {
          bucket.voids++;
          if (Number.isFinite(stake) && stake > 0) bucket.voidedStake += stake;
          continue;
        }
        if (!["won", "lost"].includes(outcome) || !Number.isFinite(stake) || stake <= 0 || !Number.isFinite(profit)) {
          bucket.excluded++;
          continue;
        }
        bucket.settledBets++;
        if (outcome === "won") bucket.wins++;
        else bucket.losses++;
        bucket.settledStake += stake;
        bucket.profit += profit;
      }
      output[key] = [...buckets.values()].map(bucket => ({
        ...bucket,
        settledStake: roundMoney(bucket.settledStake),
        voidedStake: roundMoney(bucket.voidedStake),
        profit: roundMoney(bucket.profit),
        roiPercent: bucket.settledStake > 0 ? roundMoney(bucket.profit / bucket.settledStake * 100) : null,
        preliminary: bucket.settledBets < 30
      })).sort((a, b) => b.settledStake - a.settledStake || a.name.localeCompare(b.name, "ru"));
    }
    return output;
  }

  function getExposureConcentration(state) {
    validateState(state);
    const totalOpenStake = roundMoney(state.openBets.reduce((sum, bet) => sum + bet.stake, 0));
    const bookmakerGroups = new Map();
    const playerGroups = new Map();
    let unclassifiedStake = 0;
    const add = (groups, rawName, stake) => {
      const name = typeof rawName === "string" ? rawName.trim().slice(0, 80) : "";
      if (!name) return false;
      const key = name.toLocaleLowerCase();
      const group = groups.get(key) || { name, stake: 0, bets: 0 };
      group.stake += stake;
      group.bets += 1;
      groups.set(key, group);
      return true;
    };
    for (const bet of state.openBets) {
      add(bookmakerGroups, bet.bookmaker || "Не указан", bet.stake);
      const participants = new Map([bet.player, bet.opponent]
        .filter(name => typeof name === "string" && name.trim())
        .map(name => [name.trim().toLocaleLowerCase(), name.trim()]));
      if (!participants.size) unclassifiedStake += bet.stake;
      for (const participant of participants.values()) add(playerGroups, participant, bet.stake);
    }
    const format = groups => [...groups.values()].map(group => ({
      name: group.name, stake: roundMoney(group.stake), bets: group.bets,
      sharePercent: totalOpenStake > 0 ? roundMoney(group.stake / totalOpenStake * 100) : 0,
      highConcentration: totalOpenStake > 0 && group.stake / totalOpenStake >= 0.5
    })).sort((a, b) => b.stake - a.stake || a.name.localeCompare(b.name, "ru"));
    return {
      totalOpenStake, byBookmaker: format(bookmakerGroups), byPlayer: format(playerGroups),
      unclassifiedStake: roundMoney(unclassifiedStake),
      note: "Экспозиция по игрокам пересекается: одна ставка учитывается у обоих участников. Это диагностический показатель, а не доказанная статистическая корреляция."
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
    const seenIdentities = [];
    const existingIdentities = simulated.openBets.map(matchIdentity);
    const ordered = (Array.isArray(candidates) ? candidates : [])
      .filter(item => item && Number.isFinite(Number(item.probability)) && Number(item.probability) > 0 && Number(item.probability) < 1 &&
        Number.isFinite(Number(item.odds)) && Number(item.odds) > 1)
      .slice()
      .sort((a, b) => ((Number(b.probability) * Number(b.odds) - 1) * 100) -
        ((Number(a.probability) * Number(a.odds) - 1) * 100));
    const suggestions = [];
    for (const candidate of ordered) {
      const identity = matchIdentity(candidate);
      if (!identity.key) identity.key = normalizeMatchKey([candidate.player, candidate.opponent].join("|"));
      if (seenIdentities.some(existing => identitiesOverlap(existing, identity)) ||
          existingIdentities.some(existing => identitiesOverlap(existing, identity))) continue;
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
      seenIdentities.push(identity);
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
    if (state.pendingPlan && (!Number.isFinite(Date.parse(state.pendingPlan.expiresAt)) || Date.parse(state.pendingPlan.expiresAt) <= Date.now())) {
      state.pendingPlan = null;
    }
    if (state.pendingPlan) throw new Error("Сначала подтвердите или отмените уже сохранённый план портфеля.");
    if (!Array.isArray(suggestions) || !suggestions.length) throw new Error("Нет ставок для планирования.");
    const seenIdentities = [];
    const existingIdentities = state.openBets.map(matchIdentity);
    const clean = suggestions.map(item => {
      const probability = Number(item.probability), odds = Number(item.odds), stake = roundMoney(Number(item.stake));
      const identity = matchIdentity(item);
      if (!identity.key || seenIdentities.some(existing => identitiesOverlap(existing, identity)) ||
          existingIdentities.some(existing => identitiesOverlap(existing, identity)) ||
          !Number.isFinite(probability) || probability <= 0 || probability >= 1 ||
          !Number.isFinite(odds) || odds <= 1 || !Number.isFinite(stake) || stake < 0.01) {
        throw new Error("План содержит некорректную или повторную ставку.");
      }
      seenIdentities.push(identity);
      const matchKey = String(item.matchKey || item.match || "").trim();
      return {
        matchKey, matchId: Number.isSafeInteger(Number(item.matchId)) && Number(item.matchId) > 0 ? Number(item.matchId) : null,
        match: String(item.match || "").slice(0, 200), player: String(item.player || "").slice(0, 100),
        opponent: String(item.opponent || "").slice(0, 100), bookmaker: String(item.bookmaker || "Winamax").slice(0, 60),
        side: item.side === "A" || item.side === "B" ? item.side : null,
        probability, odds, stake, ev: (probability * odds - 1) * 100,
        matchDate: typeof item.matchDate === "string" && Number.isFinite(Date.parse(item.matchDate)) ? new Date(item.matchDate).toISOString() : null,
        freshnessLevel: item.freshnessLevel === "good" ? "good" : "medium",
        surface: typeof item.surface === "string" ? item.surface.slice(0, 40) : "",
        tour: ["atp", "wta", "challenger", "itf", "juniors"].includes(String(item.tour || "").toLowerCase()) ? String(item.tour).toLowerCase() : "",
        tournament: typeof item.tournament === "string" ? item.tournament.slice(0, 160) : ""
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

  function expirePortfolioPlan(input, now = Date.now()) {
    const state = cloneState(input);
    const plan = state.pendingPlan;
    const expired = Boolean(plan && (!Number.isFinite(Date.parse(plan.expiresAt)) || Date.parse(plan.expiresAt) <= now));
    if (expired) state.pendingPlan = null;
    return { state, expired };
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
      matchDate: typeof bet.matchDate === "string" && Number.isFinite(Date.parse(bet.matchDate)) ? new Date(bet.matchDate).toISOString() : null,
      surface: typeof bet.surface === "string" ? bet.surface.slice(0, 40) : "",
      tour: ["atp", "wta", "challenger", "itf", "juniors"].includes(String(bet.tour || "").toLowerCase()) ? String(bet.tour).toLowerCase() : "",
      tournament: typeof bet.tournament === "string" ? bet.tournament.slice(0, 160) : "",
      placedAt: new Date().toISOString(), status: "open"
    };
    state.balance = roundMoney(state.balance - requested);
    state.openBets.push(record);
    appendTransaction(state, { id: "tx-" + makeId(), type: "stake", amount: requested, balanceDelta: -requested, betId: id, plannedStake: record.plannedStake, plannedOdds: record.plannedOdds, actualStake: requested, actualOdds: odds, note: record.match, bookmaker: record.bookmaker });
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
      stake: bet.stake, profit, outcome, betId, note: bet.match, bookmaker: bet.bookmaker || "Winamax",
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
          balanceDelta: -oldPayout, betId: transaction.betId, bookmaker: transaction.bookmaker || snapshot.bookmaker || "Winamax",
          note: "Отменён предыдущий расчёт после исправления результата"
        });
        appendTransaction(state, {
          id: "tx-" + makeId(), type: "settlement", amount: payout,
          balanceDelta: payout, stake: snapshot.stake, profit, outcome,
          betId: transaction.betId, note: snapshot.match, bookmaker: snapshot.bookmaker || "Winamax", source: "verified",
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
          balanceDelta: -oldPayout, betId: transaction.betId, bookmaker: transaction.bookmaker || snapshot.bookmaker || "Winamax",
          note: "Официальный результат изменён; ставка открыта повторно"
        });
        reopened.push({ betId: transaction.betId, matchId: transaction.matchId });
      }
    }
    validateState(state);
    return { state, settled, corrected, reopened, metadataUpdated, updated: settled.length + corrected.length + reopened.length + metadataUpdated.length };
  }


  function getClvSummary(state, archiveRows, options = {}) {
    validateState(state);
    const closeWindowMs = Math.max(1, Number(options.closeWindowHours) || 6) * 60 * 60 * 1000;
    const bets = new Map();
    for (const bet of state.openBets) bets.set(bet.id, bet);
    for (const tx of state.transactions) {
      if (tx.type === "settlement" && tx.betSnapshot && typeof tx.betSnapshot.id === "string") bets.set(tx.betSnapshot.id, tx.betSnapshot);
    }
    const rows = Array.isArray(archiveRows) ? archiveRows : [];
    const matched = [], missing = [];
    for (const bet of bets.values()) {
      const placedAt = Date.parse(bet.placedAt);
      const matchStart = Date.parse(bet.matchDate || "");
      const bookmaker = String(bet.bookmaker || "").trim();
      if (!Number.isSafeInteger(Number(bet.matchId)) || Number(bet.matchId) <= 0 ||
          !["A", "B"].includes(bet.side) || !bookmaker ||
          !Number.isFinite(placedAt) || !Number.isFinite(matchStart) || matchStart <= placedAt) {
        missing.push({ betId: bet.id, reason: "Недостаточно идентификаторов или времени" });
        continue;
      }
      const candidates = rows.filter(row => {
        const capturedAt = Number(row.capturedAt);
        const status = typeof row.captureStatus === "string" ? row.captureStatus.trim().toLowerCase() : "";
        return Number(row.matchId) === Number(bet.matchId) &&
          row.side === bet.side && String(row.bookmaker || "").trim().toLowerCase() === bookmaker.toLowerCase() &&
          Number.isFinite(Number(row.odds)) && Number(row.odds) > 1 &&
          Number.isFinite(capturedAt) && capturedAt >= placedAt &&
          capturedAt < matchStart && matchStart - capturedAt <= closeWindowMs &&
          (!status || status === "upcoming");
      });
      if (!candidates.length) {
        missing.push({ betId: bet.id, reason: "Нет подходящей предматчевой котировки этого букмекера в последние 6 часов до матча" });
        continue;
      }
      const latestAt = Math.max(...candidates.map(row => Number(row.capturedAt)));
      const latestRows = candidates.filter(row => Number(row.capturedAt) === latestAt);
      const latestOdds = new Set(latestRows.map(row => Number(row.odds)));
      if (latestOdds.size !== 1) {
        missing.push({ betId: bet.id, reason: "Конфликтующие котировки с одинаковой последней временной отметкой" });
        continue;
      }
      const closingOdds = [...latestOdds][0];
      const clvPercent = (Number(bet.odds) / closingOdds - 1) * 100;
      matched.push({
        betId: bet.id, matchId: Number(bet.matchId), bookmaker,
        takenOdds: Number(bet.odds), closingOdds,
        capturedAt: latestAt, clvPercent: roundMoney(clvPercent)
      });
    }
    const average = matched.length ? roundMoney(matched.reduce((sum, item) => sum + item.clvPercent, 0) / matched.length) : null;
    return {
      sampleSize: matched.length, missingCount: missing.length,
      positive: matched.filter(item => item.clvPercent > 0).length,
      negative: matched.filter(item => item.clvPercent < 0).length,
      neutral: matched.filter(item => item.clvPercent === 0).length,
      averageClvPercent: average,
      coveragePercent: bets.size ? roundMoney(matched.length / bets.size * 100) : null,
      matched, missing
    };
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

  return { VERSION, DEFAULTS, createInitialState, validateState, totalOpenStake, bankrollEquity, realizedProfit, getSummary, getOutcomeSequenceStats, getOutcomeDispersionStats, getBookmakerSummary, getSegmentPerformance, getClvSummary, getExposureConcentration, recommendStake, recommendPortfolio, savePortfolioPlan, reconcilePortfolioPlan, confirmPortfolioPlan, cancelPortfolioPlan, expirePortfolioPlan, addDeposit, addWithdrawal, placeBet, settleBet, settleVerifiedResults, serializeBackup, parseBackup, roundMoney };
});
