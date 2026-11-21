import test from "node:test";
import assert from "node:assert/strict";
import { auditPointStateTransitions, inferPointStateTransition } from "../scripts/point-state-transition-audit.mjs";

const state = overrides => ({
  match_id: "m1", sets_p1: "0", sets_p2: "0",
  games_p1: "[0]", games_p2: "[0]",
  points_p1: "0", points_p2: "0",
  server: "1", is_tiebreak: "false",
  ...overrides
});

test("infers ordinary point-score progress without mistaking 15/30/40 for tiebreak counts", () => {
  const result = inferPointStateTransition(state(), state({ points_p1: "15" }));
  assert.equal(result.status, "inferred");
  assert.equal(result.winner, 1);
  assert.equal(result.method, "game-score");
});

test("infers advantage gain and loss from the scoreboard transition", () => {
  const gain = inferPointStateTransition(state({ points_p1: "40", points_p2: "40" }),
    state({ points_p1: "AD", points_p2: "40" }));
  const loss = inferPointStateTransition(state({ points_p1: "40", points_p2: "AD" }),
    state({ points_p1: "40", points_p2: "40" }));
  assert.equal(gain.winner, 1);
  assert.equal(loss.winner, 1);
  assert.equal(loss.method, "advantage-score");
});

test("infers tiebreak points when the tiebreak flag is a CSV boolean string", () => {
  const result = inferPointStateTransition(state({
    points_p1: "6", points_p2: "6", is_tiebreak: "true"
  }), state({
    points_p1: "7", points_p2: "6", is_tiebreak: "true"
  }));
  assert.equal(result.status, "inferred");
  assert.equal(result.winner, 1);
  assert.equal(result.method, "tiebreak-score");
});

test("uses game and set counters when point scores reset", () => {
  const game = inferPointStateTransition(state({
    games_p1: "[5]", games_p2: "[3]", points_p1: "40", points_p2: "30"
  }), state({ games_p1: "[6]", games_p2: "[3]" }));
  const set = inferPointStateTransition(state({
    sets_p1: "0", sets_p2: "0", games_p1: "[6]", games_p2: "[5]", points_p1: "40", points_p2: "30"
  }), state({ sets_p1: "1", sets_p2: "0", games_p1: "[0,0]", games_p2: "[0,0]" }));
  assert.equal(game.winner, 1);
  assert.equal(game.method, "game-counter");
  assert.equal(set.winner, 1);
  assert.equal(set.method, "set-counter");
});

test("does not guess across skipped score states or match boundaries", () => {
  const gap = inferPointStateTransition(state(), state({ points_p1: "30" }));
  const boundary = inferPointStateTransition(state(), state({ match_id: "m2", points_p1: "15" }));
  assert.equal(gap.status, "ambiguous");
  assert.equal(gap.reason, "multi-point-gap-or-score-conflict");
  assert.equal(boundary.reason, "match-boundary");
});

test("audit emits aggregate-only coverage and does not retain match IDs", () => {
  const report = auditPointStateTransitions([
    state({ timestamp_utc: "2026-06-01T10:00:00Z" }),
    state({ points_p1: "15", timestamp_utc: "2026-06-01T10:00:10Z" }),
    state({ points_p1: "30", timestamp_utc: "2026-06-01T10:00:20Z" }),
    state({ match_id: "m2", points_p1: "30", timestamp_utc: "2026-06-02T10:00:00Z" })
  ]);
  assert.equal(report.totals.matches, 2);
  assert.equal(report.totals.transitions, 2);
  assert.equal(report.totals.inferred, 2);
  assert.equal(report.totals.inferredTransitionPct, 100);
  assert.equal(report.totals.matchesWithZeroStart, 1);
  assert.equal(JSON.stringify(report).includes("m1"), false);
});

test("does not coerce missing set or game counters into zero",()=>{
 const result=inferPointStateTransition(state({
  sets_p1:"",sets_p2:"",games_p1:"[5,null]",games_p2:"[3,0]",
  points_p1:"40",points_p2:"40"
 }),state({
  sets_p1:"",sets_p2:"",games_p1:"[5,null]",games_p2:"[3,0]",
  points_p1:"40",points_p2:"40"
 }));
 assert.equal(result.status,"ambiguous");
 assert.equal(result.reason,"no-score-change");
});


test("CLI runs from repository root with a relative script path and writes aggregate-only output", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "pfe-point-state-"));
  try {
    const input = join(dir, "points.csv");
    const output = join(dir, "report.json");
    const csv = [
      "match_id,sets_p1,sets_p2,games_p1,games_p2,points_p1,points_p2,server,is_tiebreak,timestamp_utc",
      'm1,0,0,"[0]","[0]",0,0,1,false,2026-06-01T10:00:00Z',
      'm1,0,0,"[0]","[0]",15,0,1,false,2026-06-01T10:00:10Z'
    ].join("\n");
    await writeFile(input, csv);
    const run = spawnSync(process.execPath, ["scripts/point-state-transition-audit.mjs", "--input", input, "--out", output], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.totals.matches, 1);
    assert.equal(report.totals.inferred, 1);
    assert.equal(JSON.stringify(report).includes("m1"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test("reports timestamp ordering problems and separates aggregate coverage by source tier", () => {
  const rows = [
    state({ timestamp_utc: "2026-06-01T10:00:10Z" }),
    state({ points_p1: "15", timestamp_utc: "2026-06-01T10:00:20Z" }),
    state({ points_p1: "30", timestamp_utc: "2026-06-01T10:00:15Z" })
  ];
  const report = auditPointStateTransitions(rows, [
    { match_id: "m1", tier_key: "atp" }
  ]);
  assert.equal(report.timestampStats.validStates, 3);
  assert.equal(report.timestampStats.nonMonotonicTransitions, 1);
  assert.equal(report.timestampStats.matchesWithTimestampOrderIssue, 1);
  assert.equal(report.byTierKey.atp.matchesWithPoints, 1);
  assert.equal(report.byTierKey.atp.transitions, 2);
  assert.equal(report.byTierKey.atp.inferred, 2);
  assert.equal(JSON.stringify(report).includes("m1"), false);
});


test("does not infer a game or set winner from counters when the prior score is not one point from completion", () => {
  const game = inferPointStateTransition(state({
    games_p1: "[5]", games_p2: "[3]", points_p1: "15", points_p2: "0"
  }), state({ games_p1: "[6]", games_p2: "[3]" }));
  const set = inferPointStateTransition(state({
    sets_p1: "0", sets_p2: "0", games_p1: "[5]", games_p2: "[3]",
    points_p1: "15", points_p2: "0"
  }), state({
    sets_p1: "1", sets_p2: "0", games_p1: "[0,0]", games_p2: "[0,0]"
  }));
  assert.equal(game.status, "ambiguous");
  assert.equal(set.status, "ambiguous");
  assert.equal(game.reason, "counter-change-without-terminal-score");
  assert.equal(set.reason, "counter-change-without-terminal-score");
});

test("allows a set-counter inference from a final tiebreak point state", () => {
  const result = inferPointStateTransition(state({
    sets_p1: "0", sets_p2: "0", games_p1: "[6]", games_p2: "[6]",
    points_p1: "6", points_p2: "5", is_tiebreak: "true"
  }), state({
    sets_p1: "1", sets_p2: "0", games_p1: "[6,0]", games_p2: "[6,0]",
    points_p1: "0", points_p2: "0", is_tiebreak: "false"
  }));
  assert.equal(result.status, "inferred");
  assert.equal(result.winner, 1);
  assert.equal(result.method, "set-counter");
});


test("separates ATP and WTA only when the match index has an explicit tour prefix", () => {
  const rows = [
    state({ timestamp_utc: "2026-06-01T10:00:00Z" }),
    state({ points_p1: "15", timestamp_utc: "2026-06-01T10:00:10Z" }),
    state({ match_id: "m2", timestamp_utc: "2026-06-02T10:00:00Z" }),
    state({ match_id: "m2", points_p2: "15", timestamp_utc: "2026-06-02T10:00:10Z" })
  ];
  const report = auditPointStateTransitions(rows, [
    { match_id: "m1", tier_key: "265", round: "ATP Miami - 1/16-finals" },
    { match_id: "m2", tier_key: "270", round: "WTA Rome - Quarter-finals" }
  ]);
  assert.equal(report.byTour.ATP.matchesWithPoints, 1);
  assert.equal(report.byTour.WTA.matchesWithPoints, 1);
  assert.equal(report.byTour.ATP.inferred, 1);
  assert.equal(report.byTour.WTA.inferred, 1);
});


test("keeps player-primary-tour agreement separate from explicit event-tour labels", () => {
  const rows = [
    state({ timestamp_utc: "2026-06-01T10:00:00Z" }),
    state({ points_p1: "15", timestamp_utc: "2026-06-01T10:00:10Z" })
  ];
  const report = auditPointStateTransitions(rows, [
    { match_id: "m1", tier_key: "265", round: "R32", player1_id: "p1", player2_id: "p2" }
  ], [
    { player_id: "p1", tour: "ATP" },
    { player_id: "p2", tour: "ATP" }
  ]);
  assert.equal(report.byTour.unclassified.matchesWithPoints, 1);
  assert.equal(report.byPlayerTourAgreement.ATP.matchesWithPoints, 1);
  assert.equal(report.byPlayerTourAgreement.ATP.inferred, 1);
});


test("audits regular-game and tiebreak server rotation without assuming unverified transitions", () => {
  const rows = [
    state({
      points_p1: "40", points_p2: "30", server: "1",
      games_p1: "[0]", games_p2: "[0]"
    }),
    state({
      points_p1: "0", points_p2: "0", server: "2",
      games_p1: "[1]", games_p2: "[0]"
    }),
    state({
      match_id: "m2", points_p1: "0", points_p2: "0",
      server: "1", is_tiebreak: "true"
    }),
    state({
      match_id: "m2", points_p1: "1", points_p2: "0",
      server: "2", is_tiebreak: "true"
    }),
    state({
      match_id: "m2", points_p1: "1", points_p2: "1",
      server: "2", is_tiebreak: "true"
    }),
    state({
      match_id: "m2", points_p1: "2", points_p2: "1",
      server: "1", is_tiebreak: "true"
    })
  ];
  const report = auditPointStateTransitions(rows);
  assert.equal(report.serverAlignment.regularChecked, 1);
  assert.equal(report.serverAlignment.regularMatches, 1);
  assert.equal(report.serverAlignment.tiebreakChecked, 3);
  assert.equal(report.serverAlignment.tiebreakMatches, 3);
  assert.equal(report.serverAlignment.regularMismatches, 0);
  assert.equal(report.serverAlignment.tiebreakMismatches, 0);
  assert.deepEqual(report.serverAlignment.tiebreakExpectedSwitch, {
    checked: 2, observedSwitch: 2, observedHold: 0
  });
  assert.deepEqual(report.serverAlignment.tiebreakExpectedHold, {
    checked: 1, observedSwitch: 0, observedHold: 1
  });
  assert.equal(report.serverAlignment.regularAlternativeMismatches, 1);
  assert.equal(report.serverAlignment.tiebreakAlternativeMismatches, 3);
});


test("compares last-point-server phase alternative against next-point-server phase", () => {
  const rows = [
    state({ points_p1: "40", points_p2: "30", server: "1" }),
    state({ points_p1: "0", points_p2: "0", server: "1", games_p1: "[1]" }),
    state({ points_p1: "15", points_p2: "0", server: "2", games_p1: "[1]" }),
    state({
      match_id: "m2", points_p1: "0", points_p2: "0",
      server: "1", is_tiebreak: "true"
    }),
    state({
      match_id: "m2", points_p1: "1", points_p2: "0",
      server: "1", is_tiebreak: "true"
    }),
    state({
      match_id: "m2", points_p1: "1", points_p2: "1",
      server: "2", is_tiebreak: "true"
    }),
    state({
      match_id: "m2", points_p1: "2", points_p2: "1",
      server: "2", is_tiebreak: "true"
    })
  ];
  const report = auditPointStateTransitions(rows);
  assert.equal(report.serverAlignment.regularChecked, 2);
  assert.equal(report.serverAlignment.regularAlternativeMatches, 2);
  assert.equal(report.serverAlignment.regularMatches, 0);
  assert.equal(report.serverAlignment.regularGameBoundaryAlternativeMatches, 1);
  assert.equal(report.serverAlignment.regularWithinGameAlternativeMatches, 1);
  assert.equal(report.serverAlignment.tiebreakChecked, 3);
  assert.equal(report.serverAlignment.tiebreakAlternativeMatches, 3);
  assert.equal(report.serverAlignment.tiebreakMatches, 0);
});


test("summarizes timestamp gaps separately for inferred and ambiguous transitions", () => {
  const rows = [
    state({ timestamp_utc: "2026-06-01T10:00:00Z" }),
    state({ points_p1: "15", timestamp_utc: "2026-06-01T10:00:10Z" }),
    state({ points_p1: "30", timestamp_utc: "2026-06-01T10:00:30Z" }),
    state({ points_p1: "30", points_p2: "30", timestamp_utc: "2026-06-01T10:02:30Z" })
  ];
  const report = auditPointStateTransitions(rows);
  assert.equal(report.timestampGapStats.all.count, 3);
  assert.equal(report.timestampGapStats.all.p50Seconds, 20);
  assert.equal(report.timestampGapStats.inferred.count, 2);
  assert.equal(report.timestampGapStats.inferred.p50Seconds, 10);
  assert.equal(report.timestampGapStats.ambiguous.count, 1);
  assert.equal(report.timestampGapStats.ambiguous.p50Seconds, 120);
  assert.equal(report.timestampGapStats.ambiguous.bins["60-180s"], 1);
  assert.equal(report.timestampGapStats.byAmbiguousReason["multi-point-gap-or-score-conflict"].count, 1);
  assert.equal(report.timestampGapStats.byAmbiguousReason["multi-point-gap-or-score-conflict"].p50Seconds, 120);
});


test("splits tiebreak server switch matrix by primary player tour", () => {
  const rows = [
    state({
      points_p1: "0", points_p2: "0", server: "1", is_tiebreak: "true"
    }),
    state({
      points_p1: "1", points_p2: "0", server: "1", is_tiebreak: "true"
    }),
    state({
      points_p1: "1", points_p2: "1", server: "1", is_tiebreak: "true"
    }),
    state({
      points_p1: "2", points_p2: "1", server: "1", is_tiebreak: "true"
    })
  ];
  const report = auditPointStateTransitions(rows, [
    { match_id: "m1", player1_id: "p1", player2_id: "p2", round: "ATP test" }
  ], [
    { player_id: "p1", tour: "ATP" },
    { player_id: "p2", tour: "ATP" }
  ]);
  assert.equal(report.tiebreakServerByPlayerTour.ATP.expectedSwitch.checked, 2);
  assert.equal(report.tiebreakServerByPlayerTour.ATP.expectedSwitch.observedHold, 2);
  assert.equal(report.tiebreakServerByPlayerTour.ATP.expectedHold.checked, 1);
  assert.equal(report.tiebreakServerByPlayerTour.ATP.expectedHold.observedHold, 1);
});


test("diagnoses score-identical server updates and missing-point-score counter changes", () => {
  const rows = [
    state({ points_p1: "0", points_p2: "0", server: "1", is_tiebreak: "false" }),
    state({ points_p1: "0", points_p2: "0", server: "2", is_tiebreak: "false" }),
    state({ points_p1: "", points_p2: "", games_p1: "[1]", server: "2", is_tiebreak: "false" })
  ];
  const report = auditPointStateTransitions(rows);
  assert.equal(report.stateDeltaDiagnostics.fullScoreStateUnchanged.total, 1);
  assert.equal(report.stateDeltaDiagnostics.fullScoreStateUnchanged.serverChanged, 1);
  assert.equal(report.stateDeltaDiagnostics.fullScoreStateUnchanged.exactDuplicateExceptTimestamp, 0);
  assert.equal(report.stateDeltaDiagnostics.samePointScore.total, 1);
  assert.equal(report.stateDeltaDiagnostics.samePointScore.serverChanged, 1);
  assert.equal(report.stateDeltaDiagnostics.samePointScore.countersStable, 1);
  assert.equal(report.stateDeltaDiagnostics.missingPointScore.total, 1);
  assert.equal(report.stateDeltaDiagnostics.missingPointScore.afterMissing, 1);
  assert.equal(report.stateDeltaDiagnostics.missingPointScore.gameCounterChanged, 1);
});


test("treats numerically equivalent score counters as an unchanged score state", () => {
  const rows = [
    state({ sets_p1: "0", sets_p2: "0", games_p1: "[0]", games_p2: "[0]" }),
    state({ sets_p1: "0.0", sets_p2: "0", games_p1: "[0.0]", games_p2: "[0]" })
  ];
  const report = auditPointStateTransitions(rows);
  assert.equal(report.stateDeltaDiagnostics.fullScoreStateUnchanged.total, 1);
  assert.equal(report.totals.byReason["no-score-change"], 1);
});


test("separates same point scores from unparseable game counters", () => {
  const rows = [
    state({ points_p1: "15", points_p2: "0", games_p1: "[0]", games_p2: "[0]" }),
    state({ points_p1: "15", points_p2: "0", games_p1: "not-json", games_p2: "[0]" })
  ];
  const report = auditPointStateTransitions(rows);
  assert.equal(report.stateDeltaDiagnostics.samePointScore.total, 1);
  assert.equal(report.stateDeltaDiagnostics.samePointScore.countersUnparseable, 1);
  assert.equal(report.stateDeltaDiagnostics.fullScoreStateUnchanged.total, 0);
});


test("separates game and set counter changes when point scores are identical", () => {
  const rows = [
    state({ sets_p1: "0", sets_p2: "0", games_p1: "[5]", games_p2: "[3]", points_p1: "0", points_p2: "0" }),
    state({ sets_p1: "1", sets_p2: "0", games_p1: "[5,0]", games_p2: "[3,0]", points_p1: "0", points_p2: "0" })
  ];
  const report = auditPointStateTransitions(rows);
  assert.equal(report.stateDeltaDiagnostics.samePointScore.total, 1);
  assert.equal(report.stateDeltaDiagnostics.samePointScore.gameCounterChanged, 1);
  assert.equal(report.stateDeltaDiagnostics.samePointScore.setCounterChanged, 1);
  assert.equal(report.stateDeltaDiagnostics.samePointScore.bothCountersChanged, 1);
  assert.equal(report.totals.byReason["counter-change-without-terminal-score"], 1);
});


test("audits normal-game and tiebreak score vocabularies separately", () => {
  const rows = [
    state({ points_p1: "AD", points_p2: "40", is_tiebreak: "false" }),
    state({ points_p1: "50", points_p2: "0", is_tiebreak: "false" }),
    state({ points_p1: "7", points_p2: "6", is_tiebreak: "true" }),
    state({ points_p1: "AD", points_p2: "40", is_tiebreak: "true" }),
    state({ points_p1: "15", points_p2: "0", is_tiebreak: "" })
  ];
  const report = auditPointStateTransitions(rows);
  assert.equal(report.scoreVocabulary.normalStates, 2);
  assert.equal(report.scoreVocabulary.tiebreakStates, 2);
  assert.equal(report.scoreVocabulary.unknownFlagStates, 1);
  assert.equal(report.scoreVocabulary.normalUnexpectedStates, 1);
  assert.equal(report.scoreVocabulary.tiebreakNonNumericStates, 1);
  assert.equal(report.scoreVocabulary.unexpectedNumericNormalValues, 1);
  assert.equal(report.scoreVocabulary.normalMissingStates, 0);
  assert.equal(report.scoreVocabulary.tiebreakMissingStates, 0);
  assert.equal(report.scoreVocabulary.normalValueCounts.AD, 1);
  assert.equal(report.scoreVocabulary.tiebreakValueCounts["7"], 1);
  assert.equal(report.scoreVocabulary.normalUnexpectedValueCounts["50"], 1);
});


test("checks whether tiebreak-flag score anomalies touch a neighboring opposite-flag state", () => {
  const rows = [
    state({ points_p1: "5", points_p2: "0", is_tiebreak: "false" }),
    state({ points_p1: "50", points_p2: "0", is_tiebreak: "false" }),
    state({ points_p1: "7", points_p2: "6", is_tiebreak: "true" }),
    state({ points_p1: "AD", points_p2: "40", is_tiebreak: "true" }),
    state({ points_p1: "40", points_p2: "40", is_tiebreak: "false" }),
    state({ points_p1: "7", points_p2: "7", is_tiebreak: "true" }),
    state({ points_p1: "A", points_p2: "AD", is_tiebreak: "true" })
  ];
  const report = auditPointStateTransitions(rows);
  assert.deepEqual(report.tiebreakFlagAlignment, {
    normalFlagNumericAnomalies: 2,
    normalFlagNumericAdjacentToTiebreak: 1,
    normalFlagNumericWithNoAdjacentTiebreak: 1,
    tiebreakFlagNonNumericAnomalies: 2,
    tiebreakFlagAlphaAdjacentToNormal: 1,
    tiebreakFlagAlphaWithNoAdjacentNormal: 1,
    missingPointScoreStates: 0,
    normalFlagNumericValueCounts: { "5": 1, "50": 1 },
    normalFlagNumericPairCounts: { "5:0": 1, "50:0": 1 },
    normalFlagNumericWithinDistance: { 1: 1, 2: 1, 3: 0, 4: 1, 5: 1 },
    normalFlagNumericPreviousTiebreakDistance: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    normalFlagNumericNextTiebreakDistance: { 1: 1, 2: 1, 3: 0, 4: 1, 5: 1 },
    tiebreakFlagAlphaValueCounts: { AD: 2, A: 1 },
    tiebreakFlagAlphaPairCounts: { "AD:40": 1, "A:AD": 1 },
    tiebreakFlagAlphaWithinDistance: { 1: 1, 2: 1, 3: 0, 4: 0, 5: 0 }
  });
});


test("breaks down regular game-boundary server changes by timestamp gap", () => {
  const rows = [
    state({ points_p1: "40", points_p2: "30", server: "1", games_p1: "[0]", games_p2: "[0]", timestamp_utc: "2026-06-01T10:00:00Z" }),
    state({ points_p1: "0", points_p2: "0", server: "2", games_p1: "[1]", games_p2: "[0]", timestamp_utc: "2026-06-01T10:00:20Z" }),
    state({ points_p1: "40", points_p2: "30", server: "2", games_p1: "[1]", games_p2: "[0]", timestamp_utc: "2026-06-01T10:01:00Z" }),
    state({ points_p1: "0", points_p2: "0", server: "2", games_p1: "[1]", games_p2: "[1]", timestamp_utc: "2026-06-01T10:01:40Z" })
  ];
  const report = auditPointStateTransitions(rows);
  const fast = report.serverAlignment.regularGameBoundaryByGap["15-30s"];
  const slower = report.serverAlignment.regularGameBoundaryByGap["30-60s"];
  assert.equal(fast.checked, 1);
  assert.equal(fast.observedSwitch, 1);
  assert.equal(fast.afterScoreReset, 1);
  assert.equal(slower.checked, 1);
  assert.equal(slower.observedHold, 1);
  assert.equal(slower.afterScoreReset, 1);
});


test("measures first and last observed states against match metadata without assuming full coverage", () => {
  const rows = [
    state({ match_id: "m1", sets_p1: "0", sets_p2: "0" }),
    state({ match_id: "m1", sets_p1: "2", sets_p2: "0", games_p1: "[6,4]", games_p2: "[3,2]" }),
    state({ match_id: "m2", sets_p1: "1", sets_p2: "0", games_p1: "[6,2]", games_p2: "[4,1]", points_p1: "", points_p2: "15" }),
    state({ match_id: "m2", sets_p1: "1", sets_p2: "0", games_p1: "[6,2]", games_p2: "[4,1]" })
  ];
  const matches = [
    { match_id: "m1", round: "ATP Paris - Final", best_of: "BO3", event_status: "", player1_id: "1", player2_id: "2" },
    { match_id: "m2", round: "WTA Rome - SF", best_of: "BO3", event_status: "retired", player1_id: "3", player2_id: "4" }
  ];
  const players = [
    { player_id: "1", tour: "ATP" }, { player_id: "2", tour: "ATP" },
    { player_id: "3", tour: "WTA" }, { player_id: "4", tour: "WTA" }
  ];
  const report = auditPointStateTransitions(rows, matches, players);
  const coverage = report.captureBoundaryCoverage;
  assert.equal(coverage.overall.totalMatches, 2);
  assert.equal(coverage.overall.firstStateAtMatchStart, 1);
  assert.equal(coverage.overall.firstStateNotAtMatchStart, 1);
  assert.equal(coverage.overall.firstStateMissingPointScore, 1);
  assert.equal(coverage.overall.lastStateMissingPointScore, 0);
  assert.equal(coverage.overall.noRecordedTerminalEvent, 1);
  assert.equal(coverage.overall.recordedTerminalEvent, 1);
  assert.equal(coverage.overall.finalSetTargetReached, 1);
  assert.equal(coverage.overall.finalSetTargetNotReached, 1);
  assert.equal(coverage.byTour.ATP.totalMatches, 1);
  assert.equal(coverage.byTour.WTA.totalMatches, 1);
  assert.equal(coverage.byPlayerTourAgreement.ATP.totalMatches, 1);
  assert.equal(coverage.byPlayerTourAgreement.WTA.totalMatches, 1);
  assert.equal(coverage.byPlayerTourAgreement.ATP.noTerminalEventTargetReached, 1);
  assert.equal(coverage.byPlayerTourAgreement.WTA.recordedTerminalEventTargetNotReached, 1);
});

test("measures score-flag anomaly proximity in either direction without reclassifying rows", () => {
  const rows = [
    state({ points_p1: "5", points_p2: "4", is_tiebreak: "false" }),
    state({ points_p1: "0", points_p2: "0", is_tiebreak: "false" }),
    state({ points_p1: "6", points_p2: "5", is_tiebreak: "true" }),
    state({ points_p1: "AD", points_p2: "40", is_tiebreak: "true" }),
    state({ points_p1: "40", points_p2: "30", is_tiebreak: "false" }),
    state({ points_p1: "8", points_p2: "7", is_tiebreak: "true" })
  ];
  const report = auditPointStateTransitions(rows).tiebreakFlagAlignment;
  assert.equal(report.normalFlagNumericWithinDistance[2], 1);
  assert.equal(report.normalFlagNumericNextTiebreakDistance[2], 1);
  assert.equal(report.tiebreakFlagAlphaWithinDistance[1], 1);
  assert.deepEqual(report.normalFlagNumericValueCounts, { "4": 1, "5": 1 });
  assert.deepEqual(report.normalFlagNumericPairCounts, { "5:4": 1 });
});
