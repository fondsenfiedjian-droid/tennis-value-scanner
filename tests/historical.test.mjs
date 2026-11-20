import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const sandbox = {
  Response, Request, Headers, URL, URLSearchParams, Set, Object, Number, Math, JSON, Date, Promise,
  encodeURIComponent,
  caches: { default: { match: async () => null, put: async () => {} } },
  fetch: async () => { throw new Error("Unexpected upstream request"); }
};
vm.runInNewContext(source.replace("export default {", "globalThis.worker = {"), sandbox);
const worker = sandbox.worker;

test("historical endpoint requires GET and the Apify secret", async () => {
  const post = await worker.fetch(new Request("https://worker.test/historical", { method: "POST" }), { APIFY_TOKEN: "test-token" });
  assert.equal(post.status, 405);
  const missing = await worker.fetch(new Request("https://worker.test/historical"), {});
  assert.equal(missing.status, 500);
  assert.equal((await missing.json()).error, "APIFY_TOKEN secret is not configured");
});

test("historical endpoint reads the fixed dataset without changing the Winamax feed", async () => {
  let requestedUrl = "";
  let requestedHeaders = null;
  sandbox.fetch = async (url, options) => {
    requestedUrl = url;
    requestedHeaders = options.headers;
    return new Response(JSON.stringify([{
      date: "2026-11-19", tour: "wta-single", player1: "Lazaro Garcia A.",
      player2: "Labrana F.", winner: "Lazaro Garcia A.", score: "6-2 3-6 6-0",
      oddsPlayer1: 1.05, oddsPlayer2: 8.94, surface: "clay", finished: true
    }]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await worker.fetch(new Request("https://worker.test/historical"), { APIFY_TOKEN: "test-token" });
  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.equal(payload.source, "Apify tennis-results historical dataset");
  assert.equal(payload.datasetId, "1UFINeSkMhdbaTfPa");
  assert.equal(payload.datasetName, "tennis-results-history-2026-11-19");
  assert.equal(payload.count, 1);
  assert.equal(payload.diagnostics.finished, 1);
  assert.equal(payload.diagnostics.bothOddsValid, 1);
  assert.equal(payload.diagnostics.surfaceCounts.clay, 1);
  assert.equal(payload.diagnostics.missingWinner, 0);
  assert.equal(payload.items[0].surface, "clay");
  assert.match(payload.retrievedAt, /^2026-\d{2}-\d{2}T/);
  assert.equal(requestedUrl, "https://api.apify.com/v2/datasets/1UFINeSkMhdbaTfPa/items?clean=true&format=json&limit=1000");
  assert.equal(requestedHeaders.Authorization, "Bearer test-token");
  assert.equal(requestedHeaders.Accept, "application/json");
});
