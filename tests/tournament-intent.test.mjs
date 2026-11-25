import test from "node:test";
import assert from "node:assert/strict";
import { assessTournamentIntent, compareTournamentIntent } from "../tournament-intent.js";

const AS_OF = "2026-11-21T12:00:00Z";
const ev = (type, extra = {}) => ({
  type, verified: true, observedAt: "2026-11-20T10:00:00Z",
  source: "official player interview", detail: "Pre-match statement", ...extra
});

test("explicit preparation is reported without inferring low competitive intent", () => {
  const result = assessTournamentIntent([
    ev("explicit_preparation"),
    ev("explicit_next_event_priority")
  ], { asOf: AS_OF, targetDate: "2026-11-22T00:00:00Z" });
  assert.equal(result.classification, "explicit_later_event_priority_statement");
  assert.equal(result.positiveEvidenceCount, 2);
  assert.equal(result.probabilityAdjustment, null);
  assert.match(result.weightInterpretation, /not_probability_or_motivation_score/);
});

test("an explicit title goal is reported as a current-event priority statement", () => {
  const result = assessTournamentIntent([
    ev("explicit_title_focus")
  ], { asOf: AS_OF });
  assert.equal(result.classification, "explicit_current_event_priority_statement");
  assert.equal(result.netEvidenceWeight, -4);
});

test("direct preparation and current-title statements remain visibly mixed", () => {
  const result = assessTournamentIntent([
    ev("explicit_preparation"),
    ev("explicit_title_focus")
  ], { asOf: AS_OF });
  assert.equal(result.classification, "mixed_direct_statements");
  assert.equal(result.evidenceCount, 2);
});

test("calendar context alone never becomes a preparation or low-priority classification", () => {
  const result = assessTournamentIntent([
    ev("major_event_soon"),
    ev("schedule_bridge")
  ], { asOf: AS_OF });
  assert.equal(result.classification, "calendar_or_home_context_only");
  assert.equal(result.probabilityAdjustment, null);
});

test("return or injury context is not interpreted as low motivation", () => {
  const result = assessTournamentIntent([
    ev("official_return_cautious"),
    ev("recent_injury_return")
  ], { asOf: AS_OF });
  assert.equal(result.classification, "return_or_readiness_context_only");
});

test("unverified, stale, future and post-target evidence are rejected", () => {
  const result = assessTournamentIntent([
    ev("explicit_preparation", { verified: false }),
    ev("major_event_soon", { observedAt: "2026-09-01T00:00:00Z" }),
    ev("official_return_cautious", { observedAt: "2026-11-22T00:00:00Z" }),
    ev("explicit_title_focus", { observedAt: "2026-11-21T16:00:00Z" })
  ], { asOf: "2026-11-21T21:00:00Z", targetDate: "2026-11-21T15:00:00Z", maxAgeDays: 30 });
  assert.equal(result.evidenceCount, 0);
  assert.equal(result.rejected.unverified, 1);
  assert.equal(result.rejected.stale, 1);
  assert.equal(result.rejected.futureEvidence, 1);
  assert.equal(result.rejected.afterTargetDate, 1);
  assert.equal(result.classification, "unknown");
});

test("missing source/date and unknown evidence types are rejected", () => {
  const result = assessTournamentIntent([
    { type: "explicit_preparation", verified: true, observedAt: AS_OF },
    ev("guess_from_bad_result")
  ], { asOf: AS_OF });
  assert.equal(result.rejected.missingSourceOrDate, 1);
  assert.equal(result.rejected.unknownType, 1);
  assert.equal(result.status, "insufficient_evidence");
});

test("comparison is descriptive and handles missing evidence", () => {
  assert.deepEqual(compareTournamentIntent({ netEvidenceWeight: 5 }, { netEvidenceWeight: 2 }), {
    status: "comparable_descriptive_tallies",
    differenceAminusB: 3,
    interpretation: "descriptive_only_not_a_probability_adjustment"
  });
  assert.equal(compareTournamentIntent({}, {}).differenceAminusB, null);
});

test("requires an explicit as-of timestamp", () => {
  assert.throws(() => assessTournamentIntent([]), /asOf/);
});
