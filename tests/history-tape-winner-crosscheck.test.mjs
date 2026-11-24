import test from "node:test";
import assert from "node:assert/strict";
import { auditHistoryTapeWinnerCrosscheck } from "../scripts/history-tape-winner-crosscheck.mjs";

const row = overrides => ({
  sets: [0, 0],
  games: [[0], [0]],
  points: ["0", "0"],
  server: 1,
  is_tiebreak: false,
  origin: "observed",
  winner: null,
  ...overrides
});

const cleanPayload = tape => ({
  match: { id: 123, players: { p1: { name: "Private A" }, p2: { name: "Private B" } } },
  meta: { match_id: 123, sequence: "clean", points: { complete: false } },
  tape
});

test("compares a clean single-point transition with the provider winner", () => {
  const report = auditHistoryTapeWinnerCrosscheck([cleanPayload([
    row({ winner: null }),
    row({ points: ["15", "0"], winner: 1 })
  ])]);
  assert.equal(report.matchesAudited, 1);
  assert.equal(report.overall.transitions, 1);
  assert.equal(report.overall.comparable, 1);
  assert.equal(report.overall.agree, 1);
  assert.equal(report.overall.disagree, 0);
});

test("reports disagreement without changing either source verdict", () => {
  const report = auditHistoryTapeWinnerCrosscheck([cleanPayload([
    row({ winner: null }),
    row({ points: ["15", "0"], winner: 2 })
  ])]);
  assert.equal(report.overall.comparable, 1);
  assert.equal(report.overall.disagree, 1);
});

test("does not treat a raw sequence as chronological point order", () => {
  const report = auditHistoryTapeWinnerCrosscheck([{
    meta: { match_id: 1, sequence: "raw" },
    tape: [row(), row({ points: ["15", "0"], winner: 1 })]
  }]);
  assert.equal(report.matchesSkipped, 1);
  assert.equal(report.skippedReasons.raw_sequence_not_point_order, 1);
  assert.equal(report.overall.transitions, 0);
});

test("accepts only an explicitly measured complete-points basis when sequence is not clean", () => {
  const payload = {
    meta: { match_id: 2, sequence: "raw", points: { available_complete: true, complete: true } },
    tape: [row(), row({ points: ["15", "0"], winner: 1 })]
  };
  const report = auditHistoryTapeWinnerCrosscheck([payload]);
  assert.equal(report.matchesAudited, 1);
  assert.equal(report.overall.agree, 1);
});

test("keeps provider-only verdicts separate when the local parser rejects a skipped-score transition", () => {
  const report = auditHistoryTapeWinnerCrosscheck([cleanPayload([
    row({ winner: null }),
    row({ games: [[1], [0]], winner: 1 })
  ])]);
  assert.equal(report.overall.comparable, 0);
  assert.equal(report.overall.providerOnly, 1);
  assert.equal(report.overall.disagree, 0);
});

test("aggregates by origin and never emits match IDs or player names", () => {
  const report = auditHistoryTapeWinnerCrosscheck([cleanPayload([
    row({ winner: null }),
    row({ points: ["15", "0"], winner: 1, origin: "reconstructed" })
  ])]);
  const serialized = JSON.stringify(report);
  assert.equal(report.byOrigin.reconstructed.agree, 1);
  assert.equal(serialized.includes("123"), false);
  assert.equal(serialized.includes("Private A"), false);
  assert.equal(serialized.includes("Private B"), false);
});
