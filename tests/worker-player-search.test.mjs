import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const workerSource = readFileSync(new URL("../worker.js", import.meta.url), "utf8");

function makeWorker(upstream) {
  const stored = new Map();
  let calls = 0;
  let lastUrl = null;
  const sandbox = {
    Response, Request, Headers, URL, URLSearchParams, Set, Object, Number, Math, JSON, Date,
    Promise, TextEncoder, TextDecoder, Uint8Array, encodeURIComponent,
    caches: { default: {
      match: async key => stored.get(key.url)?.clone() || null,
      put: async (key, value) => { stored.set(key.url, value.clone()); }
    }},
    fetch: async (url, options) => {
      calls++;
      lastUrl = String(url);
      return upstream(url, options);
    }
  };
  vm.runInNewContext(workerSource.replace("export default {", "globalThis.worker = {"), sandbox);
  return {
    call: (path, env = { LIVE_TENNIS_API_KEY: "test-key" }, method = "GET") =>
      sandbox.worker.fetch(new Request("https://worker.test" + path, { method }), env),
    calls: () => calls,
    lastUrl: () => lastUrl
  };
}

test("player search validates method, API key, query and limit without upstream calls", async () => {
  const app = makeWorker(() => { throw new Error("unexpected upstream call"); });
  assert.equal((await app.call("/players/search?search=Alcaraz", undefined, "POST")).status, 405);
  assert.equal((await app.call("/players/search?search=Alcaraz", {})).status, 500);
  assert.equal((await app.call("/players/search?search=A")).status, 400);
  assert.equal((await app.call("/players/search?search=Alcaraz&limit=21")).status, 400);
  assert.equal(app.calls(), 0);
});

test("player search requests the documented endpoint and returns validated player rows", async () => {
  const app = makeWorker(async url => {
    assert.equal(new URL(url).pathname, "/api/public/v1/players");
    assert.equal(new URL(url).searchParams.get("search"), "Carlos Alcaraz");
    assert.equal(new URL(url).searchParams.get("limit"), "10");
    return new Response(JSON.stringify({ data: [
      { id: 123, name: "Carlos Alcaraz", tour: "atp", country: "ESP" },
      { id: "456", name: "Carlos Alcaraz Jr." },
      { id: "bad", name: "Invalid ID" },
      { id: 789 }
    ], meta: { count: 4 } }), { status: 200 });
  });
  const res = await app.call("/players/search?search=Carlos%20Alcaraz");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.count, 2);
  assert.deepEqual(body.players.map(player => player.name), ["Carlos Alcaraz", "Carlos Alcaraz Jr."]);
  assert.equal(res.headers.get("X-Data-Cache"), "MISS");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=900");
});

test("player search caches normalized query and avoids duplicate quota use", async () => {
  const app = makeWorker(async () => new Response(JSON.stringify({
    data: [{ id: 123, name: "Carlos Alcaraz" }]
  }), { status: 200 }));
  const first = await app.call("/players/search?search=Carlos%20Alcaraz");
  const second = await app.call("/players/search?search=carlos%20alcaraz");
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("X-Data-Cache"), "HIT");
  assert.equal(app.calls(), 1);
});

test("player search sanitizes upstream errors and forwards Retry-After", async () => {
  const app = makeWorker(async () => new Response(JSON.stringify({
    error: "rate_limited", scope: "minute", detail: "sensitive provider text"
  }), { status: 429, headers: { "Retry-After": "30" } }));
  const res = await app.call("/players/search?search=Novak");
  const body = await res.json();
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "30");
  assert.equal(body.accessStatus, "rate_limited");
  assert.equal(JSON.stringify(body).includes("sensitive provider text"), false);
});

test("player search rejects malformed successful provider payloads and does not cache them", async () => {
  const app = makeWorker(async () => new Response(JSON.stringify({ players: [] }), { status: 200 }));
  const res = await app.call("/players/search?search=Novak");
  assert.equal(res.status, 502);
  assert.equal((await res.json()).accessStatus, "invalid_payload");
});
