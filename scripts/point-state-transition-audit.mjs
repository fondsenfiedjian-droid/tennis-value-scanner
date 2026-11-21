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

export function auditPointStateTransitions(rows, matchRows = []) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("No point-state rows supplied");
  const groups = new Map();
  const metadata = new Map();
  for (const match of matchRows) {
    const id = String(match.match_id ?? "").trim();
    if (id) metadata.set(id, String(match.tier_key ?? "unknown").trim() || "unknown");
  }
  const tierStats = {};
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
  for (const states of groups.values()) {
    const transitions = Math.max(0, states.length - 1);
    let inferred = 0;
    let timestampIssue = false;
    let previousTimestamp = null;
    const tierKey = metadata.get(String(states[0].match_id)) || "unmatched";
    if (!tierStats[tierKey]) tierStats[tierKey] = {
      matchesWithPoints: 0, transitions: 0, inferred: 0, ambiguous: 0
    };
    tierStats[tierKey].matchesWithPoints++;
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
      const result = inferPointStateTransition(states[i], states[i + 1]);
      totals.transitions++;
      tierStats[tierKey].transitions++;
      if (result.status === "inferred") {
        tierStats[tierKey].inferred++;
        totals.inferred++;
        inferred++;
      } else {
        tierStats[tierKey].ambiguous++;
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
    byTierKey: tierStats,
    totals
  };
}

async function main() {
  const args = process.argv.slice(2);
  let input = "", matchesInput = "", out = "point-state-transition-audit.json";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input") input = args[++i];
    else if (args[i] === "--matches") matchesInput = args[++i];
    else if (args[i] === "--out") out = args[++i];
    else throw new Error("Usage: node scripts/point-state-transition-audit.mjs --input FILE.csv[.gz] [--matches matches.csv[.gz]] --out report.json");
  }
  if (!input) throw new Error("Missing --input");
  const raw = await readFile(input);
  const csv = input.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const matchRaw = matchesInput ? await readFile(matchesInput) : null;
  const matchCsv = matchRaw ? (matchesInput.endsWith(".gz") ? gunzipSync(matchRaw).toString("utf8") : matchRaw.toString("utf8")) : "";
  const matchRows = matchCsv ? parseCsv(matchCsv) : [];
  const report = auditPointStateTransitions(parseCsv(csv), matchRows);
  await writeFile(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.totals));
  console.log("Wrote aggregate-only point-state audit: " + out);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
