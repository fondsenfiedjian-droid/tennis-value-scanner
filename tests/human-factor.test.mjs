import test from "node:test";
import assert from "node:assert/strict";
import { calculateWorkloadProfile, compareWorkloadProfiles, calculateArchiveWorkloadProfile } from "../human-factor.js";

const NOW = "2026-11-20T12:00:00.000Z";

test("counts matches in rolling 72-hour and seven-day windows", () => {
  const profile = calculateWorkloadProfile([
    { matchId: "a", playedAt: "2026-11-20T09:00:00Z", durationMinutes: 120 },
    { matchId: "b", playedAt: "2026-11-19T10:00:00Z", durationMinutes: 90 },
    { matchId: "c", playedAt: "2026-11-15T10:00:00Z", durationMinutes: 80 },
    { matchId: "old", playedAt: "2026-11-10T10:00:00Z", durationMinutes: 70 }
  ], { now: NOW });
  assert.equal(profile.matchesInLast72Hours, 2);
  assert.equal(profile.matchesInLast7Days, 3);
  assert.equal(profile.knownDurationMinutesLast7Days, 290);
});

test("calculates rest time from the latest completed match", () => {
  const profile = calculateWorkloadProfile([
    { matchId: "a", playedAt: "2026-11-19T00:00:00Z" }
  ], { now: NOW });
  assert.equal(profile.restHours, 36);
  assert.equal(profile.restDays, 1.5);
});

test("reports consecutive calendar days with matches", () => {
  const profile = calculateWorkloadProfile([
    { matchId: "a", playedAt: "2026-11-17T09:00:00Z" },
    { matchId: "b", playedAt: "2026-11-18T09:00:00Z" },
    { matchId: "c", playedAt: "2026-11-19T09:00:00Z" },
    { matchId: "d", playedAt: "2026-11-19T16:00:00Z" }
  ], { now: NOW });
  assert.equal(profile.consecutivePlayingDays, 3);
});

test("does not pretend missing duration data is known", () => {
  const profile = calculateWorkloadProfile([
    { matchId: "a", playedAt: "2026-11-19T09:00:00Z", durationMinutes: 100 },
    { matchId: "b", playedAt: "2026-11-20T09:00:00Z" }
  ], { now: NOW });
  assert.equal(profile.knownDurationMinutesLast7Days, 100);
  assert.deepEqual(profile.durationCoverageLast7Days, { known: 1, total: 2, complete: false });
});

test("deduplicates match IDs and excludes future/invalid dates", () => {
  const profile = calculateWorkloadProfile([
    { matchId: "same", playedAt: "2026-11-19T09:00:00Z" },
    { matchId: "same", playedAt: "2026-11-19T11:00:00Z" },
    { matchId: "future", playedAt: "2026-11-21T09:00:00Z" },
    { matchId: "bad", playedAt: "not-a-date" }
  ], { now: NOW });
  assert.equal(profile.historyMatches, 1);
  assert.equal(profile.futureMatchCount, 1);
  assert.equal(profile.invalidDateCount, 1);
});

test("accepts epoch timestamps in seconds and milliseconds", () => {
  const profile = calculateWorkloadProfile([
    { matchId: "seconds", playedAt: Date.parse("2026-11-19T12:00:00Z") / 1000 },
    { matchId: "millis", playedAt: Date.parse("2026-11-20T06:00:00Z") }
  ], { now: NOW });
  assert.equal(profile.historyMatches, 2);
  assert.equal(profile.restHours, 6);
});

test("empty history returns unknown rather than a zero-rest assumption", () => {
  const profile = calculateWorkloadProfile([], { now: NOW });
  assert.equal(profile.status, "no_history");
  assert.equal(profile.restHours, null);
  assert.equal(profile.restDays, null);
  assert.equal(profile.matchesInLast7Days, 0);
});

test("compares only measurements available for both players", () => {
  const a = { matchesInLast72Hours: 2, restHours: 12, restDays: 0.5 };
  const b = { matchesInLast72Hours: 1, restHours: 36, restDays: 1.5 };
  const comparison = compareWorkloadProfiles(a, b);
  assert.deepEqual(comparison.deltas, {
    matchesInLast72Hours: 1,
    matchesInLast7Days: null,
    restHours: -24,
    restDays: -1,
    consecutivePlayingDays: null,
    knownDurationMinutesLast7Days: null
  });
  assert.equal(comparison.comparable, 3);
  assert.equal(comparison.status, "comparable");
});

test("never returns a probability or an invented human-factor score", () => {
  const profile = calculateWorkloadProfile([], { now: NOW });
  assert.equal("probabilityAdjustment" in profile, false);
  assert.equal("score" in profile, false);
  assert.equal(profile.interpretation, "measurements_only_not_probability_adjusted");
});


test("archive adapter counts only completed, verified prior matches and excludes same-day matches", () => {
  const rows = [];
  const add = (id, date, a, b, outcome = "completed") => {
    rows.push(
      { matchId: id, matchDate: date, playerId: a, side: "A", resultOutcome: outcome, resultWinner: 1 },
      { matchId: id, matchDate: date, playerId: b, side: "B", resultOutcome: outcome, resultWinner: 1 }
    );
  };
  add("m1", "2026-11-19T10:00:00Z", 101, 202);
  add("m2", "2026-11-18T10:00:00Z", 303, 101);
  add("m3", "2026-11-16T10:00:00Z", 101, 404);
  add("same-day", "2026-11-20T08:00:00Z", 101, 505);
  add("retired", "2026-11-17T10:00:00Z", 101, 606, "retired");
  const profile = calculateArchiveWorkloadProfile(rows, 101, "2026-11-20T12:00:00Z", "target");
  assert.equal(profile.status, "archive_sample_only");
  assert.equal(profile.matchesPrevious3CalendarDays, 2);
  assert.equal(profile.matchesPrevious7CalendarDays, 3);
  assert.equal(profile.playingDaysPrevious7CalendarDays, 3);
  assert.equal(profile.restHours, null);
  assert.equal(profile.matchDurationMinutes, null);
});

test("archive adapter rejects incomplete or contradictory side identities", () => {
  const rows = [
    { matchId: "bad", matchDate: "2026-11-19T10:00:00Z", playerId: 101, side: "A", resultOutcome: "completed", resultWinner: 1 },
    { matchId: "conflict", matchDate: "2026-11-18T10:00:00Z", playerId: 101, side: "A", resultOutcome: "completed", resultWinner: 1 },
    { matchId: "conflict", matchDate: "2026-11-18T10:00:00Z", playerId: 999, side: "A", resultOutcome: "completed", resultWinner: 1 },
    { matchId: "conflict", matchDate: "2026-11-18T10:00:00Z", playerId: 202, side: "B", resultOutcome: "completed", resultWinner: 1 }
  ];
  const profile = calculateArchiveWorkloadProfile(rows, 101, "2026-11-20T12:00:00Z");
  assert.equal(profile.matchesPrevious7CalendarDays, 0);
  assert.equal(profile.rejectedArchiveGroups, 2);
});

test("archive adapter returns unknown for invalid player or target date", () => {
  const profile = calculateArchiveWorkloadProfile([], 0, "not-a-date");
  assert.equal(profile.status, "invalid_target");
  assert.equal(profile.matchesPrevious7CalendarDays, null);
});


test("archive coverage audit counts only verified completed match pairs", async () => {
  const { analyzeArchiveWorkloadCoverage } = await import("../human-factor.js");
  const rows = [
    { matchId: "m1", matchDate: "2026-11-19T10:00:00Z", playerId: 101, opponentId: 202, side: "A", resultOutcome: "completed" },
    { matchId: "m1", matchDate: "2026-11-19T10:00:00Z", playerId: 202, opponentId: 101, side: "B", resultOutcome: "completed" },
    { matchId: "m2", matchDate: "2026-11-20T10:00:00Z", playerId: 101, opponentId: 303, side: "A", resultOutcome: "completed" },
    { matchId: "m2", matchDate: "2026-11-20T10:00:00Z", playerId: 303, opponentId: 101, side: "B", resultOutcome: "completed" },
    { matchId: "bad", matchDate: "2026-11-18T10:00:00Z", playerId: 101, side: "A", resultOutcome: "completed" },
    { matchId: "pending", matchDate: "2026-11-18T10:00:00Z", playerId: 101, side: "A", resultOutcome: "upcoming" }
  ];
  const audit = analyzeArchiveWorkloadCoverage(rows);
  assert.equal(audit.archiveRecords, 6);
  assert.equal(audit.uniqueMatches, 4);
  assert.equal(audit.completedMatches, 3);
  assert.equal(audit.validCompletedMatches, 2);
  assert.equal(audit.invalidCompletedMatches, 1);
  assert.equal(audit.uniquePlayersWithCompletedHistory, 3);
  assert.equal(audit.targetsWithAnyPriorMatch3Days, 1);
  assert.equal(audit.targetsWithBothPlayersHistory3Days, 0);
  assert.equal(audit.historyCoverage, "partial_prediction_archive_not_complete_tour_history");
});
