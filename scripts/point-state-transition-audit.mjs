import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsv } from "./backtest.mjs";

const integer = value => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
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
    if (!Array.isArray(parsed)) return null;
    const values = parsed.map(integer);
    return values.every(value => value !== null) ? values : null;
  } catch {
    return null;
  }
};


function isTerminalPointBeforeBoundary(before, after) {
  const beforeP1 = String(before.points_p1 ?? "").trim().toUpperCase();
  const beforeP2 = String(before.points_p2 ?? "").trim().toUpperCase();
  const afterP1 = String(after.points_p1 ?? "").trim().toUpperCase();
  const afterP2 = String(after.points_p2 ?? "").trim().toUpperCase();
  if (afterP1 !== "0" || afterP2 !== "0") return false;
  const isTrue = value => value === true || ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
  if (isTrue(before.is_tiebreak)) {
    if (!/^\d+$/.test(beforeP1) || !/^\d+$/.test(beforeP2)) return false;
    const a = Number(beforeP1), b = Number(beforeP2);
    return Math.max(a, b) >= 6 && Math.abs(a - b) === 1;
  }
  const a = normalScoreRank(beforeP1), b = normalScoreRank(beforeP2);
  if (a === null || b === null) return false;
  return (a === 3 && b <= 2) || (b === 3 && a <= 2) ||
    (a === 4 && b === 3) || (b === 4 && a === 3);
}

function inferSetOrGameWinner(before, after) {
  const s1 = integer(before.sets_p1), s2 = integer(before.sets_p2);
  const t1 = integer(after.sets_p1), t2 = integer(after.sets_p2);
  if ([s1, s2, t1, t2].every(value => value !== null)) {
    const d1 = t1 - s1, d2 = t2 - s2;
    if (d1 === 1 && d2 === 0) return isTerminalPointBeforeBoundary(before, after) ? { status: "inferred", winner: 1, method: "set-counter" } : { status: "ambiguous", reason: "counter-change-without-terminal-score", method: "set-counter" };
    if (d2 === 1 && d1 === 0) return isTerminalPointBeforeBoundary(before, after) ? { status: "inferred", winner: 2, method: "set-counter" } : { status: "ambiguous", reason: "counter-change-without-terminal-score", method: "set-counter" };
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
    if (d1 === 1 && d2 === 0) return isTerminalPointBeforeBoundary(before, after) ? { status: "inferred", winner: 1, method: "game-counter" } : { status: "ambiguous", reason: "counter-change-without-terminal-score", method: "game-counter" };
    if (d2 === 1 && d1 === 0) return isTerminalPointBeforeBoundary(before, after) ? { status: "inferred", winner: 2, method: "game-counter" } : { status: "ambiguous", reason: "counter-change-without-terminal-score", method: "game-counter" };
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

  const isTrue = value => value === true || ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
  const numericScores = [p1, p2, q1, q2].every(v => /^\d+$/.test(v));
  const normalScoreValues = new Set(["0", "15", "30", "40"]);
  const tiebreak = isTrue(before.is_tiebreak) || isTrue(after.is_tiebreak) ||
    (numericScores && [p1, p2, q1, q2].some(v => !normalScoreValues.has(v)));
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

function auditServerTransition(before, after) {
  const serverBefore = serverValue(before?.server);
  const serverAfter = serverValue(after?.server);
  if (!serverBefore || !serverAfter) return { status: "skipped", reason: "missing-server" };
  const isTrue = value => value === true || ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
  const beforeTiebreak = isTrue(before?.is_tiebreak);
  const afterTiebreak = isTrue(after?.is_tiebreak);
  if (beforeTiebreak || afterTiebreak) {
    if (!beforeTiebreak || !afterTiebreak) return { status: "skipped", reason: "tiebreak-boundary" };
    const a = integer(before.points_p1), b = integer(before.points_p2);
    const c = integer(after.points_p1), d = integer(after.points_p2);
    if ([a, b, c, d].some(value => value === null)) return { status: "skipped", reason: "invalid-tiebreak-score" };
    const d1 = c - a, d2 = d - b;
    if (!((d1 === 1 && d2 === 0) || (d2 === 1 && d1 === 0))) {
      return { status: "skipped", reason: "non-single-tiebreak-step" };
    }
    const nextPointNumber = c + d;
    const expected = nextPointNumber % 2 === 1 ? 3 - serverBefore : serverBefore;
    const alternativeExpected = nextPointNumber % 2 === 0 ? 3 - serverBefore : serverBefore;
    return {
      status: serverAfter === expected ? "match" : "mismatch",
      alternativeStatus: serverAfter === alternativeExpected ? "match" : "mismatch",
      expectedChange: nextPointNumber % 2 === 1,
      actualChanged: serverAfter !== serverBefore,
      kind: "tiebreak"
    };
  }

  const s1 = integer(before.sets_p1), s2 = integer(before.sets_p2);
  const t1 = integer(after.sets_p1), t2 = integer(after.sets_p2);
  let setAdvanced = false;
  if ([s1, s2, t1, t2].every(value => value !== null)) {
    const ds1 = t1 - s1, ds2 = t2 - s2;
    if (ds1 === 1 && ds2 === 0) setAdvanced = true;
    else if (ds2 === 1 && ds1 === 0) setAdvanced = true;
    else if (ds1 !== 0 || ds2 !== 0) return { status: "skipped", reason: "set-counter-jump" };
  }
  const g1 = gameArray(before.games_p1), g2 = gameArray(before.games_p2);
  const h1 = gameArray(after.games_p1), h2 = gameArray(after.games_p2);
  if (!g1 || !g2 || !h1 || !h2 || g1.length !== g2.length || h1.length !== h2.length) {
    return { status: "skipped", reason: "missing-game-counter" };
  }
  let gameAdvanced = false;
  if (g1.length === h1.length) {
    if (g1.slice(0, -1).some((value, index) => value !== h1[index]) ||
        g2.slice(0, -1).some((value, index) => value !== h2[index])) {
      return { status: "skipped", reason: "prior-set-score-mutated" };
    }
    const d1 = h1.at(-1) - g1.at(-1), d2 = h2.at(-1) - g2.at(-1);
    if ((d1 === 1 && d2 === 0) || (d2 === 1 && d1 === 0)) gameAdvanced = true;
    else if (d1 !== 0 || d2 !== 0) return { status: "skipped", reason: "game-counter-jump" };
  } else if (setAdvanced && h1.length === g1.length + 1 &&
      g1.every((value, index) => value === h1[index]) &&
      g2.every((value, index) => value === h2[index]) &&
      h1.at(-1) === 0 && h2.at(-1) === 0) {
    gameAdvanced = true;
  } else {
    return { status: "skipped", reason: "set-array-boundary" };
  }
  if (setAdvanced && !gameAdvanced) return { status: "skipped", reason: "set-without-game-advance" };
  const expected = gameAdvanced ? 3 - serverBefore : serverBefore;
  const beforeP1 = String(before.points_p1 ?? "").trim().toUpperCase();
  const beforeP2 = String(before.points_p2 ?? "").trim().toUpperCase();
  const afterP1 = String(after.points_p1 ?? "").trim().toUpperCase();
  const afterP2 = String(after.points_p2 ?? "").trim().toUpperCase();
  const firstPointOfNewGame = !gameAdvanced && beforeP1 === "0" && beforeP2 === "0" &&
    ((afterP1 === "15" && afterP2 === "0") || (afterP1 === "0" && afterP2 === "15"));
  const alternativeExpected = gameAdvanced ? serverBefore :
    firstPointOfNewGame ? 3 - serverBefore : serverBefore;
  return {
    status: serverAfter === expected ? "match" : "mismatch",
    alternativeStatus: serverAfter === alternativeExpected ? "match" : "mismatch",
    expectedChange: gameAdvanced,
    actualChanged: serverAfter !== serverBefore,
    kind: "regular",
    gameBoundary: gameAdvanced,
    firstPointOfNewGame
  };
}

function summarizeTimestampGaps(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => sorted.length ? Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(2)) : null;
  const bins = { "<5s": 0, "5-15s": 0, "15-30s": 0, "30-60s": 0, "60-180s": 0, "180s+": 0 };
  let sum = 0;
  for (const seconds of sorted) {
    sum += seconds;
    const key = seconds < 5 ? "<5s" : seconds < 15 ? "5-15s" : seconds < 30 ? "15-30s" :
      seconds < 60 ? "30-60s" : seconds < 180 ? "60-180s" : "180s+";
    bins[key]++;
  }
  return {
    count: sorted.length,
    meanSeconds: sorted.length ? Number((sum / sorted.length).toFixed(2)) : null,
    p50Seconds: percentile(0.50), p90Seconds: percentile(0.90),
    p95Seconds: percentile(0.95), p99Seconds: percentile(0.99),
    maxSeconds: sorted.length ? Number(sorted.at(-1).toFixed(2)) : null,
    bins
  };
}

function scoreStateIsEqual(a, b) {
  const sets = [integer(a.sets_p1), integer(a.sets_p2), integer(b.sets_p1), integer(b.sets_p2)];
  const games = [gameArray(a.games_p1), gameArray(a.games_p2), gameArray(b.games_p1), gameArray(b.games_p2)];
  if (sets.some(value => value === null) || games.some(value => value === null)) return false;
  const sameGames = (left, right) => {
    if (left === null || right === null) return left === right;
    return left.length === right.length && left.every((value, index) => value === right[index]);
  };
  return integer(a.sets_p1) === integer(b.sets_p1) &&
    integer(a.sets_p2) === integer(b.sets_p2) &&
    sameGames(gameArray(a.games_p1), gameArray(b.games_p1)) &&
    sameGames(gameArray(a.games_p2), gameArray(b.games_p2)) &&
    String(a.points_p1 ?? "").trim().toUpperCase() === String(b.points_p1 ?? "").trim().toUpperCase() &&
    String(a.points_p2 ?? "").trim().toUpperCase() === String(b.points_p2 ?? "").trim().toUpperCase();
}

function transitionCounterChanges(before, after) {
  const s1 = integer(before.sets_p1), s2 = integer(before.sets_p2);
  const t1 = integer(after.sets_p1), t2 = integer(after.sets_p2);
  const setsComparable = [s1, s2, t1, t2].every(value => value !== null);
  const setChanged = setsComparable && (s1 !== t1 || s2 !== t2);
  const g1 = gameArray(before.games_p1), g2 = gameArray(before.games_p2);
  const h1 = gameArray(after.games_p1), h2 = gameArray(after.games_p2);
  const gamesComparable = !!(g1 && g2 && h1 && h2);
  const gameChanged = gamesComparable &&
    (JSON.stringify(g1) !== JSON.stringify(h1) || JSON.stringify(g2) !== JSON.stringify(h2));
  return { setChanged, gameChanged, setsComparable, gamesComparable };
}

function auditScoreVocabulary(rows) {
  const report = {
    normalStates: 0, tiebreakStates: 0, unknownFlagStates: 0,
    normalUnexpectedStates: 0, tiebreakNonNumericStates: 0,
    numericScoresOutsideTiebreak: 0,
    normalValueCounts: {}, tiebreakValueCounts: {}, unexpectedValueCounts: {}
  };
  const isTrue = value => value === true || ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
  const isFalse = value => value === false || ["false", "0", "no"].includes(String(value ?? "").trim().toLowerCase());
  const add = (map, value) => { map[value] = (map[value] || 0) + 1; };
  for (const row of rows) {
    const p1 = String(row.points_p1 ?? "").trim().toUpperCase();
    const p2 = String(row.points_p2 ?? "").trim().toUpperCase();
    if (isTrue(row.is_tiebreak)) {
      report.tiebreakStates++;
      for (const value of [p1, p2]) {
        if (/^\d+$/.test(value)) add(report.tiebreakValueCounts, value);
        else add(report.unexpectedValueCounts, value || "<missing>");
      }
      if (!/^\d+$/.test(p1) || !/^\d+$/.test(p2)) report.tiebreakNonNumericStates++;
    } else if (isFalse(row.is_tiebreak)) {
      report.normalStates++;
      for (const value of [p1, p2]) {
        if (normalScoreRank(value) !== null) add(report.normalValueCounts, value);
        else add(report.unexpectedValueCounts, value || "<missing>");
      }
      if (normalScoreRank(p1) === null || normalScoreRank(p2) === null) report.normalUnexpectedStates++;
      if (/^\d+$/.test(p1) || /^\d+$/.test(p2)) report.numericScoresOutsideTiebreak++;
    } else {
      report.unknownFlagStates++;
    }
  }
  return report;
}

export function auditPointStateTransitions(rows, matchRows = [], playerRows = []) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("No point-state rows supplied");
  const scoreVocabulary = auditScoreVocabulary(rows);
  const groups = new Map();
  const playerTours = new Map(playerRows.map(player => [String(player.player_id ?? "").trim(), String(player.tour ?? "").trim().toUpperCase()]));
  const metadata = new Map();
  for (const match of matchRows) {
    const id = String(match.match_id ?? "").trim();
    const round = String(match.round ?? "").trim();
    const tourMatch = round.match(/^(ATP|WTA)\b/i);
    if (id) metadata.set(id, {
      tierKey: String(match.tier_key ?? "unknown").trim() || "unknown",
      tour: tourMatch ? tourMatch[1].toUpperCase() : "unclassified",
      playerTour: (() => {
        const p1 = playerTours.get(String(match.player1_id ?? "").trim());
        const p2 = playerTours.get(String(match.player2_id ?? "").trim());
        return p1 && p1 === p2 && (p1 === "ATP" || p1 === "WTA") ? p1 : "unclassified";
      })()
    });
  }
  const tierStats = {};
  const tourStats = {};
  const playerTourAgreementStats = {};
  const timestampStats = {
    validStates: 0, invalidOrMissingStates: 0,
    nonMonotonicTransitions: 0, duplicateTimestampTransitions: 0,
    timestampedMatches: 0, matchesWithTimestampOrderIssue: 0
  };
  let rowsWithoutMatchId = 0;
  for (const row of rows) {
    const id = String(row.match_id ?? "").trim();
    if (!id) { rowsWithoutMatchId++; continue; }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  if (!groups.size) throw new Error("No rows with match IDs supplied");
  const tiebreakServerByPlayerTour = {};
  const stateDeltaDiagnostics = {
    fullScoreStateUnchanged: { total: 0, serverChanged: 0, tiebreakChanged: 0, bothChanged: 0, exactDuplicateExceptTimestamp: 0 },
    samePointScore: { total: 0, countersChanged: 0, gameCounterChanged: 0, setCounterChanged: 0, bothCountersChanged: 0, countersUnparseable: 0, countersStable: 0, serverChanged: 0, tiebreakChanged: 0 },
    missingPointScore: { total: 0, beforeMissing: 0, afterMissing: 0, bothMissing: 0, gameCounterChanged: 0, setCounterChanged: 0, serverChanged: 0 }
  };
  const serverAlignment = {
    regularChecked: 0, regularMatches: 0, regularMismatches: 0,
    regularAlternativeMatches: 0, regularAlternativeMismatches: 0,
    regularGameBoundaryChecked: 0, regularGameBoundaryMatches: 0, regularGameBoundaryMismatches: 0,
    regularGameBoundaryAlternativeMatches: 0, regularGameBoundaryAlternativeMismatches: 0,
    regularWithinGameChecked: 0, regularWithinGameMatches: 0, regularWithinGameMismatches: 0,
    regularWithinGameAlternativeMatches: 0, regularWithinGameAlternativeMismatches: 0,
    tiebreakChecked: 0, tiebreakMatches: 0, tiebreakMismatches: 0,
    tiebreakAlternativeMatches: 0, tiebreakAlternativeMismatches: 0,
    tiebreakExpectedSwitch: { checked: 0, observedSwitch: 0, observedHold: 0 },
    tiebreakExpectedHold: { checked: 0, observedSwitch: 0, observedHold: 0 },
    skipped: 0, skippedReasons: {}
  };
  const totals = {
    matches: groups.size, rowsWithoutMatchId, transitions: 0, inferred: 0, ambiguous: 0,
    byMethod: {}, byReason: {}, transitionsWithServerBefore: 0,
    transitionsWithServerAfter: 0, serverChangedAcrossTransition: 0,
    matchesWithZeroStart: 0, matchesWithAtLeastOneTransition: 0,
    matchesWithAllTransitionsInferred: 0, inferredTransitionCoverageBins: {
      "0%": 0, "1-49%": 0, "50-79%": 0, "80-99%": 0, "100%": 0
    }
  };
  let totalObservedTransitions = 0;
  let totalInferredTransitions = 0;
  const allTimestampGaps = [];
  const inferredTimestampGaps = [];
  const ambiguousTimestampGaps = [];
  const timestampGapsByReason = {};
  for (const states of groups.values()) {
    const transitions = Math.max(0, states.length - 1);
    let inferred = 0;
    let timestampIssue = false;
    let previousTimestamp = null;
    const matchMeta = metadata.get(String(states[0].match_id)) || { tierKey: "unmatched", tour: "unclassified" };
    const tierKey = matchMeta.tierKey;
    const tour = matchMeta.tour;
    const playerTour = matchMeta.playerTour;
    if (!tierStats[tierKey]) tierStats[tierKey] = {
      matchesWithPoints: 0, transitions: 0, inferred: 0, ambiguous: 0
    };
    if (!playerTourAgreementStats[playerTour]) playerTourAgreementStats[playerTour] = {
      matchesWithPoints: 0, transitions: 0, inferred: 0, ambiguous: 0
    };
    if (!tourStats[tour]) tourStats[tour] = {
      matchesWithPoints: 0, transitions: 0, inferred: 0, ambiguous: 0
    };
    tierStats[tierKey].matchesWithPoints++;
    tourStats[tour].matchesWithPoints++;
    playerTourAgreementStats[playerTour].matchesWithPoints++;
    for (const state of states) {
      const rawTimestamp = String(state.timestamp_utc ?? "").trim();
      const timestamp = rawTimestamp ? Date.parse(rawTimestamp) : NaN;
      if (Number.isFinite(timestamp)) {
        timestampStats.validStates++;
        if (previousTimestamp !== null) {
          if (timestamp < previousTimestamp) {
            timestampStats.nonMonotonicTransitions++;
            timestampIssue = true;
          } else if (timestamp === previousTimestamp) {
            timestampStats.duplicateTimestampTransitions++;
          }
        }
        previousTimestamp = timestamp;
      } else {
        timestampStats.invalidOrMissingStates++;
        previousTimestamp = null;
      }
    }
    if (states.some(state => Number.isFinite(Date.parse(String(state.timestamp_utc ?? ""))))) {
      timestampStats.timestampedMatches++;
    }
    if (timestampIssue) timestampStats.matchesWithTimestampOrderIssue++;
    if (states.length && integer(states[0].sets_p1) === 0 && integer(states[0].sets_p2) === 0 &&
      JSON.stringify(gameArray(states[0].games_p1)) === "[0]" &&
      JSON.stringify(gameArray(states[0].games_p2)) === "[0]" &&
      String(states[0].points_p1) === "0" && String(states[0].points_p2) === "0") {
      totals.matchesWithZeroStart++;
    }
    if (transitions > 0) totals.matchesWithAtLeastOneTransition++;
    for (let i = 0; i + 1 < states.length; i++) {
      const before = states[i], after = states[i + 1];
      const result = inferPointStateTransition(before, after);
      const serverCheck = auditServerTransition(before, after);
      const sameScore = scoreStateIsEqual(before, after);
      const samePointScore = String(before.points_p1 ?? "").trim().toUpperCase() === String(after.points_p1 ?? "").trim().toUpperCase() &&
        String(before.points_p2 ?? "").trim().toUpperCase() === String(after.points_p2 ?? "").trim().toUpperCase();
      const serverChanged = serverValue(before.server) && serverValue(after.server) &&
        serverValue(before.server) !== serverValue(after.server);
      const tiebreakChanged = String(before.is_tiebreak ?? "") !== String(after.is_tiebreak ?? "");
      if (sameScore) {
        stateDeltaDiagnostics.fullScoreStateUnchanged.total++;
        if (serverChanged) stateDeltaDiagnostics.fullScoreStateUnchanged.serverChanged++;
        if (tiebreakChanged) stateDeltaDiagnostics.fullScoreStateUnchanged.tiebreakChanged++;
        if (serverChanged && tiebreakChanged) stateDeltaDiagnostics.fullScoreStateUnchanged.bothChanged++;
        if (!serverChanged && !tiebreakChanged) stateDeltaDiagnostics.fullScoreStateUnchanged.exactDuplicateExceptTimestamp++;
      }
      if (samePointScore) {
        const diag = stateDeltaDiagnostics.samePointScore;
        diag.total++;
        if (serverChanged) diag.serverChanged++;
        if (tiebreakChanged) diag.tiebreakChanged++;
        const counters = transitionCounterChanges(before, after);
        if (counters.setChanged || counters.gameChanged) {
          diag.countersChanged++;
          if (counters.gameChanged) diag.gameCounterChanged++;
          if (counters.setChanged) diag.setCounterChanged++;
          if (counters.gameChanged && counters.setChanged) diag.bothCountersChanged++;
        } else if (!counters.setsComparable || !counters.gamesComparable) diag.countersUnparseable++;
        else diag.countersStable++;
      }
      const beforeMissing = !String(before.points_p1 ?? "").trim() || !String(before.points_p2 ?? "").trim();
      const afterMissing = !String(after.points_p1 ?? "").trim() || !String(after.points_p2 ?? "").trim();
      if (beforeMissing || afterMissing) {
        const diag = stateDeltaDiagnostics.missingPointScore;
        diag.total++;
        if (beforeMissing) diag.beforeMissing++;
        if (afterMissing) diag.afterMissing++;
        if (beforeMissing && afterMissing) diag.bothMissing++;
        const counters = transitionCounterChanges(before, after);
        if (counters.gameChanged) diag.gameCounterChanged++;
        if (counters.setChanged) diag.setCounterChanged++;
        if (serverChanged) diag.serverChanged++;
      }
      const beforeMs = Date.parse(String(states[i].timestamp_utc ?? ""));
      const afterMs = Date.parse(String(states[i + 1].timestamp_utc ?? ""));
      if (Number.isFinite(beforeMs) && Number.isFinite(afterMs) && afterMs >= beforeMs) {
        const gapSeconds = (afterMs - beforeMs) / 1000;
        allTimestampGaps.push(gapSeconds);
        if (result.status === "inferred") inferredTimestampGaps.push(gapSeconds);
        else {
          ambiguousTimestampGaps.push(gapSeconds);
          const reason = result.reason || "unknown";
          if (!timestampGapsByReason[reason]) timestampGapsByReason[reason] = [];
          timestampGapsByReason[reason].push(gapSeconds);
        }
      }
      if (serverCheck.status === "skipped") {
        serverAlignment.skipped++;
        serverAlignment.skippedReasons[serverCheck.reason] = (serverAlignment.skippedReasons[serverCheck.reason] || 0) + 1;
      } else {
        const prefix = serverCheck.kind === "tiebreak" ? "tiebreak" : "regular";
        serverAlignment[prefix + "Checked"]++;
        if (serverCheck.status === "match") serverAlignment[prefix + "Matches"]++;
        else serverAlignment[prefix + "Mismatches"]++;
        if (serverCheck.alternativeStatus === "match") serverAlignment[prefix + "AlternativeMatches"]++;
        else serverAlignment[prefix + "AlternativeMismatches"]++;
        if (prefix === "tiebreak") {
          const group = serverCheck.expectedChange ? serverAlignment.tiebreakExpectedSwitch : serverAlignment.tiebreakExpectedHold;
          group.checked++;
          if (serverCheck.actualChanged) group.observedSwitch++;
          else group.observedHold++;
          if (!tiebreakServerByPlayerTour[playerTour]) {
            tiebreakServerByPlayerTour[playerTour] = {
              expectedSwitch: { checked: 0, observedSwitch: 0, observedHold: 0 },
              expectedHold: { checked: 0, observedSwitch: 0, observedHold: 0 }
            };
          }
          const tourGroup = serverCheck.expectedChange
            ? tiebreakServerByPlayerTour[playerTour].expectedSwitch
            : tiebreakServerByPlayerTour[playerTour].expectedHold;
          tourGroup.checked++;
          if (serverCheck.actualChanged) tourGroup.observedSwitch++;
          else tourGroup.observedHold++;
        }
        if (prefix === "regular") {
          const bucket = serverCheck.gameBoundary ? "regularGameBoundary" : "regularWithinGame";
          serverAlignment[bucket + "Checked"]++;
          if (serverCheck.status === "match") serverAlignment[bucket + "Matches"]++;
          else serverAlignment[bucket + "Mismatches"]++;
          if (serverCheck.alternativeStatus === "match") serverAlignment[bucket + "AlternativeMatches"]++;
          else serverAlignment[bucket + "AlternativeMismatches"]++;
        }
      }
      totals.transitions++;
      tierStats[tierKey].transitions++;
      tourStats[tour].transitions++;
      playerTourAgreementStats[playerTour].transitions++;
      if (result.status === "inferred") {
        tierStats[tierKey].inferred++;
        tourStats[tour].inferred++;
        playerTourAgreementStats[playerTour].inferred++;
        totals.inferred++;
        inferred++;
      } else {
        tierStats[tierKey].ambiguous++;
        tourStats[tour].ambiguous++;
        playerTourAgreementStats[playerTour].ambiguous++;
        totals.ambiguous++;
        totals.byReason[result.reason] = (totals.byReason[result.reason] || 0) + 1;
      }
      if (result.method) totals.byMethod[result.method] = (totals.byMethod[result.method] || 0) + 1;
      if (result.serverBefore) totals.transitionsWithServerBefore++;
      if (result.serverAfter) totals.transitionsWithServerAfter++;
      if (result.serverBefore && result.serverAfter && result.serverBefore !== result.serverAfter) {
        totals.serverChangedAcrossTransition++;
      }
    }
    totalObservedTransitions += transitions;
    totalInferredTransitions += inferred;
    if (transitions > 0 && inferred === transitions) totals.matchesWithAllTransitionsInferred++;
    const pct = transitions ? 100 * inferred / transitions : 0;
    if (pct === 0) totals.inferredTransitionCoverageBins["0%"]++;
    else if (pct < 50) totals.inferredTransitionCoverageBins["1-49%"]++;
    else if (pct < 80) totals.inferredTransitionCoverageBins["50-79%"]++;
    else if (pct < 100) totals.inferredTransitionCoverageBins["80-99%"]++;
    else totals.inferredTransitionCoverageBins["100%"]++;
  }
  totals.meanTransitionsPerMatch = groups.size ? Number((totalObservedTransitions / groups.size).toFixed(2)) : null;
  totals.inferredTransitionPct = totalObservedTransitions ? Number((100 * totalInferredTransitions / totalObservedTransitions).toFixed(2)) : null;
  return {
    schemaVersion: 1,
    source: "Live Tennis API academic public point-state sample",
    provenance: "observed score states only; rows are not point outcomes",
    timestampStats,
    scoreVocabulary,
    timestampGapStats: {
      all: summarizeTimestampGaps(allTimestampGaps),
      inferred: summarizeTimestampGaps(inferredTimestampGaps),
      ambiguous: summarizeTimestampGaps(ambiguousTimestampGaps),
      byAmbiguousReason: Object.fromEntries(Object.entries(timestampGapsByReason)
        .map(([reason, values]) => [reason, summarizeTimestampGaps(values)]))
    },
    serverAlignment,
    stateDeltaDiagnostics,
    tiebreakServerByPlayerTour,
    byTierKey: tierStats,
    byTour: tourStats,
    byPlayerTourAgreement: playerTourAgreementStats,
    totals
  };
}

async function main() {
  const args = process.argv.slice(2);
  let input = "", matchesInput = "", playersInput = "", out = "point-state-transition-audit.json";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input") input = args[++i];
    else if (args[i] === "--matches") matchesInput = args[++i];
    else if (args[i] === "--players") playersInput = args[++i];
    else if (args[i] === "--out") out = args[++i];
    else throw new Error("Usage: node scripts/point-state-transition-audit.mjs --input FILE.csv[.gz] [--matches matches.csv[.gz]] [--players players.csv[.gz]] --out report.json");
  }
  if (!input) throw new Error("Missing --input");
  const raw = await readFile(input);
  const csv = input.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const matchRaw = matchesInput ? await readFile(matchesInput) : null;
  const matchCsv = matchRaw ? (matchesInput.endsWith(".gz") ? gunzipSync(matchRaw).toString("utf8") : matchRaw.toString("utf8")) : "";
  const matchRows = matchCsv ? parseCsv(matchCsv) : [];
  const playerRaw = playersInput ? await readFile(playersInput) : null;
  const playerCsv = playerRaw ? (playersInput.endsWith(".gz") ? gunzipSync(playerRaw).toString("utf8") : playerRaw.toString("utf8")) : "";
  const playerRows = playerCsv ? parseCsv(playerCsv) : [];
  const report = auditPointStateTransitions(parseCsv(csv), matchRows, playerRows);
  await writeFile(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.totals));
  console.log("Wrote aggregate-only point-state audit: " + out);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
