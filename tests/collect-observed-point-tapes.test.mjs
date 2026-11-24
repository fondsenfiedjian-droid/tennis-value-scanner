import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildObservedTapeRecord, collectObservedTapes, summarizeRawTape } from "../scripts/collect-observed-point-tapes.mjs";

const payload = overrides => ({
  accessStatus: "available",
  meta: { coverage: "from_start", point_source: "observed", points: { complete: true, transitions_legal: 8, transitions_total: 8 } },
  tape: [
    { timestamp: "2026-11-04T10:00:00Z", server: 1, winner: 1, serve: { type: "first" } },
    { timestamp: "2026-11-04T10:00:10Z", server: 1, winner: 2 }
  ],
  ...overrides
});

test("summarizes raw event fields without inventing point_winner", () => {
  const result = summarizeRawTape(payload().tape);
  assert.equal(result.rows, 2);
  assert.equal(result.timestampRows, 2);
  assert.equal(result.winnerRows, 2);
  assert.equal(result.pointWinnerRows, 0);
  assert.deepEqual(result.winnerValues, { "1": 1, "2": 1 });
});

test("accepts only available observed from_start raw tapes and preserves source rows", () => {
  const source = payload();
  const clean = payload();
  const record = buildObservedTapeRecord(215017, source, { cleanPayload: clean, fetchedAt: "2026-11-24T00:00:00Z" });
  assert.equal(record.match_id, "215017");
  assert.equal(record.request.sequence, "raw");
  assert.equal(record.request.clean_sequence, "clean");
  assert.equal(record.quality.pointsComplete, true);
  assert.equal(record.clean_quality.rows, 2);
  assert.equal(record.tape, source.tape);
  assert.equal(record.clean_tape, clean.tape);
  assert.equal(record.fetched_at, "2026-11-24T00:00:00Z");
});

test("rejects reconstructed, unavailable, and timestamp-incomplete tapes", () => {
  assert.throws(() => buildObservedTapeRecord(1, payload({ meta: { coverage: "reconstructed", point_source: "reconstructed" } })), /non-observed/);
  assert.throws(() => buildObservedTapeRecord(1, payload({ accessStatus: "not_found" })), /not available/);
  assert.throws(() => buildObservedTapeRecord(1, payload({ tape: [{ timestamp: "x" }, {}] })), /missing timestamps/);
});

test("collector is explicit-ID only, deduplicates stored IDs, and uses raw/default endpoint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "observed-tapes-"));
  try {
    const output = join(dir, "tapes.jsonl");
    const requests = [];
    const fetchImpl = async url => {
      requests.push(String(url));
      return new Response(JSON.stringify(payload()), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await collectObservedTapes({
      ids: ["215017", "212252", "215017"], output, base: "https://example.test", fetchImpl, delayMs: 0,
      matchMetadataById: { "215017": { player1: "Player One", player2: "Player Two", date: "2026-11-04T10:00:00Z" } }
    });
    assert.equal(requests.length, 4);
    assert.equal(requests.filter(url => url.includes("sequence=raw")).length, 2);
    assert.equal(requests.filter(url => url.includes("sequence=clean")).length, 2);
    assert.ok(requests.every(url => url.includes("points=default")));
    assert.equal(result.records[0].raw_rows, 2);\n    assert.equal(result.records[0].metadata.player1, "Player One");\n    assert.equal(result.records[0].metadata.player2, "Player Two");
    assert.equal(result.records[0].clean_rows, 2);
    assert.equal(result.totalStored, 2);
    const lines = (await readFile(output, "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map(line => JSON.parse(line).match_id), ["212252", "215017"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("collector refuses more than 20 IDs", async () => {
  await assert.rejects(() => collectObservedTapes({
    ids: Array.from({ length: 21 }, (_, i) => String(i + 1)),
    output: "/tmp/never-written.jsonl",
    fetchImpl: async () => { throw new Error("must not fetch"); }
  }), /between 1 and 20/);
});
