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
});
