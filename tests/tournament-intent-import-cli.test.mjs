import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runImport } from "../scripts/import-tournament-intent-evidence.mjs";

const targetMatchStart = "2026-11-22T12:00:00Z";
const valid = {
  playerId: "77",
  playerName: "Sample Player",
  eventId: "event-1",
  tournament: "Sample Open",
  targetMatchId: "match-1",
  targetMatchStart,
  type: "explicit_preparation",
  publishedAt: "2026-11-20T09:00:00Z",
  capturedAt: "2026-11-20T10:00:00Z",
  sourceType: "official_tournament",
  sourceName: "Official tournament interview",
  sourceUrl: "https://example.org/interview",
  quote: "I am here for match practice.",
  verified: true,
  reviewedBy: "reviewer"
};

test("CLI imports valid JSON, preserves normalized records and reports rejected rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "intent-import-"));
  try {
    const input = join(dir, "incoming.json");
    const output = join(dir, "registry.json");
    await writeFile(input, JSON.stringify([valid, { ...valid, verified: false }]));
    const result = await runImport(["--input", input, "--out", output]);
    assert.equal(result.summary.acceptedCount, 1);
    assert.equal(result.summary.rejectedCount, 1);
    const saved = JSON.parse(await readFile(output, "utf8"));
    assert.equal(saved.records.length, 1);
    assert.equal(saved.rejected[0].errors.includes("record_not_verified"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI merges with an existing registry and skips duplicate evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "intent-merge-"));
  try {
    const input = join(dir, "incoming.jsonl");
    const existing = join(dir, "existing.json");
    const output = join(dir, "registry.json");
    await writeFile(input, JSON.stringify(valid) + "\n" + JSON.stringify(valid) + "\n");
    await writeFile(existing, JSON.stringify({ records: [] }));
    const first = await runImport(["--input", input, "--existing", existing, "--out", output]);
    assert.equal(first.summary.acceptedCount, 1);
    assert.equal(first.summary.duplicateCount, 1);
    const second = await runImport(["--input", input, "--existing", output, "--out", output]);
    assert.equal(second.summary.acceptedCount, 0);
    assert.equal(second.summary.duplicateCount, 2);
    const saved = JSON.parse(await readFile(output, "utf8"));
    assert.equal(saved.records.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI dry-run validates input without writing a registry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "intent-dry-"));
  try {
    const input = join(dir, "incoming.json");
    const output = join(dir, "registry.json");
    await writeFile(input, JSON.stringify([valid]));
    const result = await runImport(["--input", input, "--dry-run"]);
    assert.equal(result.dryRun, true);
    assert.equal(result.summary.acceptedCount, 1);
    await assert.rejects(readFile(output, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
