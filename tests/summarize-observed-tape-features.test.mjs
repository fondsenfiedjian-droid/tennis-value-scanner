import test from "node:test";
import assert from "node:assert/strict";
import { summarizeObservedTapeFeatures } from "../scripts/summarize-observed-tape-features.mjs";

test("summarizes field coverage and categorical values without assigning semantics", () => {
  const result = summarizeObservedTapeFeatures({
    match_id: 42,
    metadata: { point_source: "observed", coverage: "from_start" },
    quality: { completenessFlag: true },
    tape: [
      { timestamp: "t1", server: 1, serve: 2, winner: 1, outcome: "ace", danger: 0.2, is_tiebreak: false },
      { timestamp: "t2", server: 2, serve: null, winner: 2, outcome: null, danger: 0.4, win_probability_p1: 0.6, is_tiebreak: true }
    ]
  });
  assert.equal(result.rows, 2);
  assert.deepEqual(result.availability.serve, { present: 1, missing: 1 });
  assert.deepEqual(result.serve_values, { "2": 1 });
  assert.deepEqual(result.outcome_values, { ace: 1 });
  assert.equal(result.tiebreak_rows, 1);
});

test("rejects reconstructed or unknown-provenance records", () => {
  assert.throws(() => summarizeObservedTapeFeatures({
    match_id: 7, metadata: { point_source: "reconstructed", coverage: "from_start" }, tape: []
  }), /Refusing non-observed/);
});
