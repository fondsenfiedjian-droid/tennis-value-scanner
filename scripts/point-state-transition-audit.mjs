const integer = value => {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

const serverValue = value => {
  const n = integer(value);
  return n === 1 || n === 2 ? n : null;
};

const gameArray = value => {
  if (Array.isArray(value)) return value.map(integer);
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(integer) : null;
  } catch {
    return null;
  }
};

const sameArray = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

function inferCounterWinner(before, after, field, method) {
  const a = integer(before[field]);
  const b = integer(after[field]);
  if (a === null || b === null) return null;
  const p1 = integer(before[field + "_p1"]);
  const p2 = integer(before[field + "_p2"]);
  const q1 = integer(after[field + "_p1"]);
  const q2 = integer(after[field + "_p2"]);
  if ([p1, p2, q1, q2].some(value => value === null)) return null;
  const d1 = q1 - p1, d2 = q2 - p2;
  if (d1 === 1 && d2 === 0) return { status: "inferred", winner: 1, method };
  if (d2 === 1 && d1 === 0) return { status: "inferred", winner: 2, method };
  if (d1 === 0 && d2 === 0) return null;
  return { status: "ambiguous", reason: "counter-jump-or-conflict", method };
}

function inferSetOrGameWinner(before, after) {
  const s1 = integer(before.sets_p1), s2 = integer(before.sets_p2);
  const t1 = integer(after.sets_p1), t2 = integer(after.sets_p2);
  if ([s1, s2, t1, t2].every(value => value !== null)) {
    const d1 = t1 - s1, d2 = t2 - s2;
    if (d1 === 1 && d2 === 0) return { status: "inferred", winner: 1, method: "set-counter" };
    if (d2 === 1 && d1 === 0) return { status: "inferred", winner: 2, method: "set-counter" };
    if (d1 !== 0 || d2 !== 0) return { status: "ambiguous", reason: "set-counter-jump-or-conflict", method: "set-counter" };
  }

  const g1 = gameArray(before.games_p1), g2 = gameArray(before.games_p2);
  const h1 = gameArray(after.games_p1), h2 = gameArray(after.games_p2);
  if (g1 && g2 && h1 && h2 && g1.length === g2.length && h1.length === h2.length) {
    if (g1.length !== h1.length) {
      return { status: "ambiguous", reason: "set-array-length-change-without-set-counter", method: "game-counter" };
    }
    const changedEarlier = g1.slice(0, -1).some((v, i) => v !== h1[i]) ||
      g2.slice(0, -1).some((v, i) => v !== h2[i]);
    if (changedEarlier) return { status: "ambiguous", reason: "prior-set-score-mutated", method: "game-counter" };
    const d1 = h1.at(-1) - g1.at(-1), d2 = h2.at(-1) - g2.at(-1);
    if (d1 === 1 && d2 === 0) return { status: "inferred", winner: 1, method: "game-counter" };
    if (d2 === 1 && d1 === 0) return { status: "inferred", winner: 2, method: "game-counter" };
    if (d1 !== 0 || d2 !== 0) return { status: "ambiguous", reason: "game-counter-jump-or-conflict", method: "game-counter" };
  }
  return null;
}

const normalScoreRank = value => {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "0") return 0;
  if (v === "15") return 1;
  if (v === "30") return 2;
  if (v === "40") return 3;
  if (v === "A" || v === "AD") return 4;
  return null;
};

function inferPointScoreWinner(before, after) {
  const p1 = String(before.points_p1 ?? "").trim().toUpperCase();
  const p2 = String(before.points_p2 ?? "").trim().toUpperCase();
  const q1 = String(after.points_p1 ?? "").trim().toUpperCase();
  const q2 = String(after.points_p2 ?? "").trim().toUpperCase();
  if (![p1, p2, q1, q2].every(Boolean)) return { status: "ambiguous", reason: "missing-point-score", method: "point-score" };

  const tiebreak = before.is_tiebreak === true || after.is_tiebreak === true ||
    (Number.isInteger(Number(p1)) && Number.isInteger(Number(p2)) &&
     Number.isInteger(Number(q1)) && Number.isInteger(Number(q2)) &&
     [p1, p2, q1, q2].some(v => Number(v) > 4));
  if (tiebreak) {
    const a = Number(p1), b = Number(p2), c = Number(q1), d = Number(q2);
    if (![a, b, c, d].every(Number.isInteger)) return { status: "ambiguous", reason: "invalid-tiebreak-score", method: "tiebreak-score" };
    const d1 = c - a, d2 = d - b;
    if (d1 === 1 && d2 === 0) return { status: "inferred", winner: 1, method: "tiebreak-score" };
    if (d2 === 1 && d1 === 0) return { status: "inferred", winner: 2, method: "tiebreak-score" };
    if (d1 === 0 && d2 === 0) return { status: "ambiguous", reason: "no-score-change", method: "tiebreak-score" };
    return { status: "ambiguous", reason: "tiebreak-gap-or-conflict", method: "tiebreak-score" };
  }

  const a = normalScoreRank(p1), b = normalScoreRank(p2);
  const c = normalScoreRank(q1), d = normalScoreRank(q2);
  if ([a, b, c, d].some(value => value === null)) return { status: "ambiguous", reason: "unrecognized-point-score", method: "point-score" };
  if (a === c && b === d) return { status: "ambiguous", reason: "no-score-change", method: "point-score" };

  if (c === a + 1 && d === b) return { status: "inferred", winner: 1, method: "game-score" };
  if (d === b + 1 && c === a) return { status: "inferred", winner: 2, method: "game-score" };
  if (a === 4 && c === 3 && b === 3 && d === 3) return { status: "inferred", winner: 2, method: "advantage-score" };
  if (b === 4 && d === 3 && a === 3 && c === 3) return { status: "inferred", winner: 1, method: "advantage-score" };
  return { status: "ambiguous", reason: "multi-point-gap-or-score-conflict", method: "point-score" };
}

export function inferPointStateTransition(before, after) {
  const matchBefore = String(before?.match_id ?? "");
  const matchAfter = String(after?.match_id ?? "");
  if (!matchBefore || matchBefore !== matchAfter) {
    return { status: "ambiguous", reason: "match-boundary", serverBefore: serverValue(before?.server), serverAfter: serverValue(after?.server) };
  }

  const counter = inferSetOrGameWinner(before, after);
  let result = counter || inferPointScoreWinner(before, after);
  if (!result) result = { status: "ambiguous", reason: "unresolved-transition" };
  return {
    ...result,
    serverBefore: serverValue(before.server),
    serverAfter: serverValue(after.server)
  };
}

export function auditPointStateTransitions(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("No point-state rows supplied");
  const groups = new Map();
  for (const row of rows) {
    const id = String(row.match_id ?? "").trim();
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const totals = {
    matches: groups.size, transitions: 0, inferred: 0, ambiguous: 0,
    byMethod: {}, byReason: {}, transitionsWithServerBefore: 0,
    transitionsWithServerAfter: 0, serverChangedAcrossTransition: 0
  };
  const matches = [];
  for (const [matchId, states] of groups) {
    const counts = { transitions: Math.max(0, states.length - 1), inferred: 0, ambiguous: 0, byMethod: {}, byReason: {} };
    for (let i = 0; i + 1 < states.length; i++) {
      const result = inferPointStateTransition(states[i], states[i + 1]);
      totals.transitions++;
      if (result.status === "inferred") {
        totals.inferred++;
        counts.inferred++;
      } else {
        totals.ambiguous++;
        counts.ambiguous++;
        totals.byReason[result.reason] = (totals.byReason[result.reason] || 0) + 1;
        counts.byReason[result.reason] = (counts.byReason[result.reason] || 0) + 1;
      }
      if (result.method) {
        totals.byMethod[result.method] = (totals.byMethod[result.method] || 0) + 1;
        counts.byMethod[result.method] = (counts.byMethod[result.method] || 0) + 1;
      }
      if (result.serverBefore) totals.transitionsWithServerBefore++;
      if (result.serverAfter) totals.transitionsWithServerAfter++;
      if (result.serverBefore && result.serverAfter && result.serverBefore !== result.serverAfter) totals.serverChangedAcrossTransition++;
    }
    matches.push({
      matchId,
      stateRows: states.length,
      ...counts,
      inferredPct: counts.transitions ? Number((100 * counts.inferred / counts.transitions).toFixed(2)) : null,
      firstTimestamp: states[0].timestamp_utc || null,
      lastTimestamp: states.at(-1).timestamp_utc || null,
      firstStateIsZero: Number(states[0].sets_p1) === 0 && Number(states[0].sets_p2) === 0 &&
        JSON.stringify(gameArray(states[0].games_p1)) === "[0]" && JSON.stringify(gameArray(states[0].games_p2)) === "[0]" &&
        String(states[0].points_p1) === "0" && String(states[0].points_p2) === "0"
    });
  }
  return {
    schemaVersion: 1,
    source: "Live Tennis API academic public point-state sample",
    provenance: "observed score states only; rows are not point outcomes",
    totals,
    matches
  };
}
