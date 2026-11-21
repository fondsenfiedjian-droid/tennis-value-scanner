import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTournamentIntentRecord,
  importTournamentIntentEvidence,
  assessRegisteredTournamentIntent
} from "../tournament-intent-registry.js";

const targetMatchStart = "2026-11-22T12:00:00Z";
const base = {
  playerId: "12345",
  playerName: "Example Player",
  eventId: "event-77",
  tournament: "Example Open",
  targetMatchId: "match-9",
  targetMatchStart,
  type: "explicit_preparation",
  publishedAt: "2026-11-20T10:00:00Z",
  capturedAt: "2026-11-20T11:00:00Z",
  sourceName: "Official tournament interview",
  sourceUrl: "https://example.org/interview",
  quote: "I am here to get match practice.",
  detail: "Player described the event as preparation.",
  verified: true,
  reviewedBy: "analyst"
};

test("validates and normalizes a sourced, pre-match evidence record", () => {
  const result = validateTournamentIntentRecord(base);
  assert.equal(result.valid, true);
  assert.equal(result.record.observedAt, base.capturedAt);
  assert.equal(result.record.verified, true);
  assert.ok(result.record.evidenceId);
});

test("rejects unverified or source-less evidence", () => {
  const result = validateTournamentIntentRecord({ ...base, verified: false, sourceUrl: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("record_not_verified"));
  assert.ok(result.errors.includes("invalid_source_url"));
});

test("rejects publication or capture after target match start", () => {
  const published = validateTournamentIntentRecord({
    ...base, publishedAt: "2026-11-23T10:00:00Z", capturedAt: "2026-11-23T11:00:00Z"
  });
  assert.ok(published.errors.includes("publication_after_target_match_start"));
  const captured = validateTournamentIntentRecord({
    ...base, capturedAt: "2026-11-22T13:00:00Z"
  });
  assert.ok(captured.errors.includes("capture_after_target_match_start"));
});

test("rejects records without reviewer and valid player/event/match identity", () => {
  const result = validateTournamentIntentRecord({
    ...base, reviewedBy: "", playerId: "", playerName: "", eventId: "", tournament: "", targetMatchId: ""
  });
  for (const code of ["missing_reviewer", "missing_player_identity", "missing_event_identity", "missing_target_match_id"]) {
    assert.ok(result.errors.includes(code));
  }
});

test("rejects stale evidence relative to target match", () => {
  const result = validateTournamentIntentRecord({
    ...base, publishedAt: "2026-09-01T10:00:00Z", capturedAt: "2026-09-01T11:00:00Z"
  });
  assert.ok(result.errors.includes("evidence_too_old_for_target_match"));
});

test("import reports accepted, rejected and duplicate rows without silent loss", () => {
  const result = importTournamentIntentEvidence([], [base, base, { ...base, verified: false }]);
  assert.equal(result.summary.acceptedCount, 1);
  assert.equal(result.summary.duplicateCount, 1);
  assert.equal(result.summary.rejectedCount, 1);
  assert.equal(result.records.length, 1);
});

test("assessment only includes evidence linked to the exact player and target match", () => {
  const valid = validateTournamentIntentRecord(base).record;
  const otherMatch = validateTournamentIntentRecord({ ...base, targetMatchId: "other-match" }).record;
  const result = assessRegisteredTournamentIntent(
    [valid, otherMatch],
    { playerId: "12345" },
    { matchId: "match-9", startTime: targetMatchStart }
  );
  assert.equal(result.evidenceCount, 1);
  assert.equal(result.classification, "possible_preparation_or_low_priority");
  assert.equal(result.probabilityAdjustment, null);
});

test("assessment rejects post-match timestamps even if records are supplied directly", () => {
  const bad = { ...validateTournamentIntentRecord(base).record, capturedAt: "2026-11-23T00:00:00Z" };
  const result = assessRegisteredTournamentIntent(
    [bad], { playerId: "12345" },
    { matchId: "match-9", startTime: targetMatchStart }
  );
  assert.equal(result.evidenceCount, 0);
  assert.equal(result.classification, "unknown");
});
