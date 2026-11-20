import test from "node:test";
import assert from "node:assert/strict";
import { calculateWorkloadProfile, compareWorkloadProfiles } from "../human-factor.js";

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
