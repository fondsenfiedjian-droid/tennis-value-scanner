import test from "node:test";
import { TextEncoder } from "node:util";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const workerSource = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const frontendSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorkerSource = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const bankrollSource = readFileSync(new URL("../bankroll.js", import.meta.url), "utf8");
const archiveTimingStart = frontendSource.indexOf("function archiveMatchDate(");
const archiveTimingEnd = frontendSource.indexOf("function isFreshCacheTimestamp(", archiveTimingStart);
const archiveTimingSource = frontendSource.slice(archiveTimingStart, archiveTimingEnd);
const archiveStart = frontendSource.indexOf("const ARCHIVE_KEY=");
const archiveEnd = frontendSource.indexOf("function renderArchive()", archiveStart);
const archiveSource = frontendSource.slice(archiveStart, archiveEnd);
const ratingDateStart = frontendSource.indexOf("function validRatingDate(");
const ratingDateEnd = frontendSource.indexOf("function isValidPredictionResult(", ratingDateStart);
const ratingDateSource = frontendSource.slice(ratingDateStart, ratingDateEnd);
function makeArchiveStore(seed = [], options = {}) {
  const data = { 'tvs-prediction-archive-v1': options.corruptSeed ? '{broken-json' : JSON.stringify(seed) };
  const localStorage = {
    getItem: key => data[key] ?? null,
    setItem: (key, value) => { if(options.failWrites)throw new Error('QuotaExceededError'); data[key] = value; }
  };
  const sandbox = { localStorage, indexedDB: options.indexedDB, Date, Math, Number, String, JSON,
    matchDate: () => new Date("2026-11-20T12:00:00Z") };
  vm.runInNewContext(
    ratingDateSource + archiveTimingSource + archiveSource + String.fromCharCode(10) + "globalThis.archiveFns = { readPredictionArchive, persistPredictionArchive, savePredictionSnapshot, mergePredictionArchive, createArchiveBackup, readArchiveBackup, applyVerifiedMatchResult, archiveResultStats, archiveOddsMovement, archiveOddsQuality, archiveProbabilityCalibration, selectArchiveResultCheckIds, stampResultCheck, initializeArchiveStorage, flushArchiveWrites, getArchiveReadError: () => archiveReadError };",
    sandbox
  );
  return sandbox.archiveFns;
}

function makeFakeIndexedDB(options = {}) {
  const state = { records: [], meta: new Map(), nextId: 1 };
  const stores = new Set();
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) { stores.add(name); return {}; },
    transaction(names, mode) {
      const tx = {
        error: null,
        aborted: false,
        abort() { this.aborted = true; },
        objectStore(name) {
          if (name === "records") return {
            getAll() {
              const request = { result: [] };
              Promise.resolve().then(() => { request.result = state.records.map(row => ({ ...row })); request.onsuccess?.(); });
              return request;
            },
            clear() { state.records = []; },
            add(row) { if (options.failAdds) throw new Error('Simulated IndexedDB quota failure'); state.records.push({ ...row, id: state.nextId++ }); }
          };
          return {
            get(key) {
              const request = { result: undefined };
              Promise.resolve().then(() => { request.result = state.meta.get(key); });
              return request;
            },
            put(value, key) { state.meta.set(key, value); }
          };
        }
      };
      setTimeout(() => {
        if (tx.aborted) { tx.error ||= new Error("Transaction aborted"); tx.onabort?.(); }
        else tx.oncomplete?.();
      }, 0);
      return tx;
    }
  };
  return {
    open() {
      const request = { result: db };
      Promise.resolve().then(() => {
        if (!stores.has("records")) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
    state
  };
}

const helperSource = workerSource.slice(0, workerSource.indexOf("async function getPlayerProfile"));
const helperSandbox = { Response, URL, Request, Set, Object, Number, Math, JSON };
vm.runInNewContext(
  helperSource + "\nglobalThis.testHelpers = { findElo, findEloForSurface, normalizeSurface, eloProbability, response };",
  helperSandbox
);
const { findElo, findEloForSurface, normalizeSurface, eloProbability, response } = helperSandbox.testHelpers;

const workerSandbox = {
  Response, Request, URL, URLSearchParams, Set, Object, Number, Math, JSON, Date, Promise, TextEncoder, TextDecoder, Uint8Array, encodeURIComponent,
  caches: { default: { match: async () => null, put: async () => {} } },
  fetch: async () => { throw new Error("Unexpected upstream network call in validation test"); }
};
vm.runInNewContext(
  workerSource.replace("export default {", "globalThis.worker = {"),
  workerSandbox
);
const worker = workerSandbox.worker;
const env = { LIVE_TENNIS_API_KEY: "test-key", APIFY_TOKEN: "test-token" };

async function call(path, method = "GET", body = undefined) {
  const request = new Request("https://worker.test" + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body
  });
  return worker.fetch(request, env);
}

test("player stats endpoint validates IDs and returns read-only API data with access status", async () => {
  let requestedUrl = "";
  let requestedHeaders = null;
  let cachedStatsResponse = null;
  let cachedStatsKey = null;
  workerSandbox.caches.default.put = async (key, value) => { cachedStatsKey = key.url; cachedStatsResponse = value; };
  workerSandbox.fetch = async (url, options) => {
    requestedUrl = url;
    requestedHeaders = options.headers;
    return new Response(JSON.stringify({ player: { id: 123 }, records: { recent: [] } }), { status: 200 });
  };
  for (const invalidId of ["../secret", "abc", "0", "9007199254740992", "1234567890123456"]) {
    const invalid = await call("/player-stats?id=" + encodeURIComponent(invalidId));
    assert.equal(invalid.status, 400, "reject invalid player ID " + invalidId);
  }
  const result = await call("/player-stats?id=123");
  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.equal(payload.playerId, "123");
  assert.equal(payload.accessStatus, "available");
  assert.deepEqual(JSON.parse(JSON.stringify(payload.stats)), { player: { id: 123 }, records: { recent: [] } });
  assert.equal(requestedUrl, "https://api.livetennisapi.com/api/public/v1/players/123/stats");
  assert.equal(requestedHeaders["X-API-Key"], "test-key");
  assert.equal(requestedHeaders.Accept, "application/json");
  assert.equal(cachedStatsResponse.headers.get("Cache-Control"), "public, max-age=60");
  assert.equal(cachedStatsKey, "https://worker.test/__player-stats/123");
  assert.equal(result.headers.get("Cache-Control"), "public, max-age=60");
  assert.equal(result.headers.get("X-Data-Cache"), "MISS");
});

test("player stats endpoint reports forbidden access without inventing ULTRA entitlement", async () => {
  workerSandbox.fetch = async () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  const result = await call("/player-stats?id=123");
  assert.equal(result.status, 403);
  const payload = await result.json();
  assert.equal(payload.accessStatus, "forbidden_or_plan_restricted");
  assert.equal(payload.upstreamStatus, 403);
});

test("player stats endpoint preserves rate-limit retry guidance and identifies merged player IDs", async () => {
  workerSandbox.fetch = async () => new Response(JSON.stringify({
    error: "rate_limited", scope: "day", resets_at: "2026-11-19T00:00:00Z", limit_per_day: 100
  }), { status: 429, headers: { "Retry-After": "30" } });
  const limited = await call("/player-stats?id=123");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "30");
  assert.equal(limited.headers.get("Access-Control-Expose-Headers"), "Retry-After, X-Data-Cache");
  const limitedPayload = await limited.json();
  assert.equal(limitedPayload.accessStatus, "rate_limited");
  assert.deepEqual(JSON.parse(JSON.stringify(limitedPayload.rateLimit)), {
    errorCode: "rate_limited", scope: "day", resetsAt: "2026-11-19T00:00:00Z", retryAtEpoch: null, detail: null
  });

  workerSandbox.fetch = async () => new Response(JSON.stringify({ error: "Player merged" }), { status: 410 });
  const merged = await call("/player-stats?id=123");
  assert.equal(merged.status, 410);
  assert.equal((await merged.json()).accessStatus, "player_merged");
});

test("overall Elo takes precedence over surface Elo", () => {
  assert.equal(findElo({ clay_elo: 2100, stats: { overall_elo: 1850 } }), 1850);
});

test("surface Elo is selected when a matching court rating exists", () => {
  const profile = { overall_elo: 1800, stats: { clay_elo: 1940, hard_elo: 1830, grass_elo: 1710 } };
  assert.deepEqual(JSON.parse(JSON.stringify(findEloForSurface(profile, "Clay"))), { rating: 1940, type: "surface", surface: "clay" });
  assert.equal(findEloForSurface(profile, "Hard court").rating, 1830);
  assert.equal(findEloForSurface(profile, "Grass").rating, 1710);
});

test("surface Elo supports nested provider maps and known surface aliases", () => {
  const profile = { surface_elo: { clay: "1888", hard: 1777 } };
  assert.equal(findEloForSurface(profile, "terre battue").rating, 1888);
  assert.equal(findEloForSurface(profile, "хард").rating, 1777);
  assert.equal(normalizeSurface("indoor hard"), "hard");
  assert.equal(normalizeSurface("unknown"), null);
});

test("surface Elo falls back transparently to overall Elo when unavailable", () => {
  const result = findEloForSurface({ overall_elo: 1820, grass_elo: 1700 }, "clay");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { rating: 1820, type: "overall", surface: "clay" });
  assert.equal(findEloForSurface({ grass_elo: 1700 }, "clay"), null);
});

test("surface Elo rejects invalid ratings and does not treat unrelated fields as court ratings", () => {
  assert.equal(findEloForSurface({ clay_elo: 0, overall_elo: 1800 }, "clay").type, "overall");
  assert.equal(findEloForSurface({ clay_elo: "NaN" }, "clay"), null);
});

test("generic Elo is used when overall Elo is absent", () => {
  assert.equal(findElo({ stats: { elo: 1725 } }), 1725);
});

test("surface-only ratings are not mistaken for overall Elo", () => {
  assert.equal(findElo({ clay_elo: 1900, hard_elo: 1800, grass_elo: 1700 }), null);
});

test("invalid overall rating falls back to valid generic Elo", () => {
  assert.equal(findElo({ overall_elo: 0, elo: 1660 }), 1660);
});

test("Elo values outside the accepted range are rejected", () => {
  assert.equal(findElo({ overall_elo: 5001 }), null);
  assert.equal(findElo({ overall_elo: -10 }), null);
});

test("Elo extraction rejects booleans, arrays, objects, and non-decimal strings", () => {
  assert.equal(findElo({ overall_elo: true }), null);
  assert.equal(findElo({ overall_elo: [1800] }), null);
  assert.equal(findElo({ overall_elo: { value: 1800 } }), null);
  assert.equal(findElo({ overall_elo: "0x708" }), null);
});

test("invalid typed overall Elo falls back to a valid numeric-string Elo", () => {
  assert.equal(findElo({ overall_elo: false, elo: "1660.5" }), 1660.5);
});

test("cyclic profile objects do not cause recursion failure", () => {
  const profile = { elo: 1777 };
  profile.self = profile;
  assert.equal(findElo(profile), 1777);
});

test("equal Elo ratings produce equal win probabilities", () => {
  assert.equal(eloProbability(1800, 1800), 0.5);
});

test("a 400-point Elo advantage produces about 90.91% probability", () => {
  assert.ok(Math.abs(eloProbability(2000, 1600) - 0.9090909) < 0.000001);
});

test("probabilities for reversed players sum to one", () => {
  const pA = eloProbability(1940, 1810);
  const pB = eloProbability(1810, 1940);
  assert.ok(Math.abs(pA + pB - 1) < 1e-12);
});

test("JSON responses include CORS and content type headers", () => {
  const result = response({ ok: true });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("Access-Control-Allow-Origin"), "*");
  assert.ok(result.headers.get("Content-Type").includes("application/json"));
});

test("predict rejects malformed JSON with HTTP 400", async () => {
  const result = await call("/predict", "POST", "{");
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /Invalid JSON/);
});

test("predict rejects invalid UTF-8 request bodies", async () => {
  const request = new Request("https://worker.test/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new Uint8Array([0xff, 0xfe])
  });
  const result = await worker.fetch(request, env);
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /UTF-8/);
});

test("predict enforces the 16 KB limit using actual UTF-8 body bytes", async () => {
  const oversized = JSON.stringify({ note: "x".repeat(16385) });
  const result = await call("/predict", "POST", oversized);
  assert.equal(result.status, 413);
  assert.match((await result.json()).error, /16 KB/);
});

test("predict returns precise Elo probabilities consistent with fair odds", async () => {
  const result = await call("/predict", "POST", JSON.stringify({ ratingA: 1200, ratingB: 2000 }));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.ok(body.probabilityExactA > 0 && body.probabilityExactA < 1);
  assert.ok(Math.abs(body.probabilityExactA + body.probabilityExactB - 1) < 1e-12);
  assert.equal(body.probabilityA, Number((body.probabilityExactA * 100).toFixed(2)));
  assert.ok(Math.abs(body.fairOddsA - 1 / body.probabilityExactA) < 0.00051);
});

test("predict rejects a missing player ID pair", async () => {
  const result = await call("/predict", "POST", JSON.stringify({ playerIdA: "123", ratingB: 1700 }));
  assert.equal(result.status, 400);
});

test("predict rejects out-of-range manual Elo ratings", async () => {
  const result = await call("/predict", "POST", JSON.stringify({ ratingA: 5001, ratingB: 1700 }));
  assert.equal(result.status, 400);
});

test("predict rejects decimal odds at or below one", async () => {
  const result = await call("/predict", "POST", JSON.stringify({ ratingA: 1800, ratingB: 1700, oddsA: 1 }));
  assert.equal(result.status, 400);
});

test("predict rejects coerced non-decimal manual ratings and odds", async () => {
  for (const body of [
    { ratingA: true, ratingB: 1700 },
    { ratingA: "0x708", ratingB: 1700 },
    { ratingA: 1800, ratingB: 1700, oddsA: true },
    { ratingA: 1800, ratingB: 1700, oddsB: "Infinity" }
  ]) {
    const result = await call("/predict", "POST", JSON.stringify(body));
    assert.equal(result.status, 400);
  }
});

test("matches rejects an excessive result limit before upstream access", async () => {
  const result = await call("/matches?limit=201");
  assert.equal(result.status, 400);
});

test("matches rejects an unsupported tour filter", async () => {
  const result = await call("/matches?tour=invalid");
  assert.equal(result.status, 400);
});

test("matches rejects reversed date ranges", async () => {
  const result = await call("/matches?from=2026-11-20&to=2026-11-19");
  assert.equal(result.status, 400);
});

test("matches rejects unsupported HTTP methods", async () => {
  const result = await call("/matches", "POST", "{}");
  assert.equal(result.status, 405);
});

test("cache timestamps reject stale, invalid, and implausibly future data", () => {
  const start = frontendSource.indexOf("function isFreshCacheTimestamp(");
  const end = frontendSource.indexOf("const ODDS_CACHE_TTL", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = { Date, Number };
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.isFresh = isFreshCacheTimestamp;", sandbox);
  const now = 1_800_000_000_000;
  assert.equal(sandbox.isFresh(now - 60_000, 600_000, now), true);
  assert.equal(sandbox.isFresh(now - 700_000, 600_000, now), false);
  assert.equal(sandbox.isFresh(now + 60_000, 600_000, now), true);
  assert.equal(sandbox.isFresh(now + 6 * 60_000, 600_000, now), false);
  assert.equal(sandbox.isFresh(NaN, 600_000, now), false);
  assert.equal(sandbox.isFresh(0, 600_000, now), false);
});

test("rating update dates accept valid ISO dates and reject malformed dates", () => {
  const sandbox = { Date, Number };
  vm.runInNewContext(ratingDateSource + "\nglobalThis.validateDate = validRatingDate;", sandbox);
  assert.equal(sandbox.validateDate("2026-11-18"), "2026-11-18");
  assert.equal(sandbox.validateDate("2026-02-30"), null);
  assert.equal(sandbox.validateDate("not-a-date"), null);
  assert.equal(sandbox.validateDate(null), null);
});

test("frontend rejects malformed prediction payloads before display or caching", () => {
  const start = frontendSource.indexOf("function isValidPredictionResult(");
  const end = frontendSource.indexOf("async function loadPredictions(", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = { Number, Math };
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.validate = isValidPredictionResult;", sandbox);
  const valid = { ratingA: 1900, ratingB: 1800, probabilityA: 64, probabilityB: 36,
    fairOddsA: 1.563, fairOddsB: 2.778 };
  assert.equal(sandbox.validate(valid), true);
  assert.equal(sandbox.validate({ ...valid, probabilityB: 40 }), false);
  assert.equal(sandbox.validate({ ...valid, ratingA: 0 }), false);
  assert.equal(sandbox.validate({ ...valid, fairOddsA: 1.2 }), false);
  assert.equal(sandbox.validate({ ...valid, probabilityA: 100 }), false);
  assert.equal(sandbox.validate(null), false);
  assert.ok(frontendSource.includes("else localStorage.removeItem(cacheKey)"));
});

test("market margin and no-vig edge are calculated only from one bookmaker", () => {
  const start = frontendSource.indexOf("function calculateMarketContext(");
  const end = frontendSource.indexOf("function isValidPredictionResult(", start);
  const sandbox = { Number, String };
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.calculate = calculateMarketContext;", sandbox);
  const result = sandbox.calculate(1.8, 2.1, "Winamax", "winamax", 0.6, 0.4);
  assert.ok(Math.abs(result.marginPercent - 3.1746031746) < 1e-8);
  assert.ok(Math.abs(result.marketProbabilityA - 53.8461538462) < 1e-8);
  assert.ok(Math.abs(result.edgeA - 6.1538461538) < 1e-8);
  assert.equal(sandbox.calculate(1.8, 2.1, "Winamax", "Betclic", 0.6, 0.4), null);
  assert.equal(sandbox.calculate(1, 2.1, "Winamax", "Winamax", 0.6, 0.4), null);
});

test("frontend validates precise Elo probabilities against fair odds without rounding drift", () => {
  const start = frontendSource.indexOf("function isValidPredictionResult(");
  const end = frontendSource.indexOf("async function loadPredictions(", start);
  const sandbox = { Number, Math };
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.validate = isValidPredictionResult;", sandbox);
  const p = 1 / (1 + Math.pow(10, 2));
  const exact = {
    ratingA: 1200, ratingB: 2000,
    probabilityA: Number((p * 100).toFixed(2)),
    probabilityB: Number(((1 - p) * 100).toFixed(2)),
    probabilityExactA: p, probabilityExactB: 1 - p,
    fairOddsA: Number((1 / p).toFixed(3)),
    fairOddsB: Number((1 / (1 - p)).toFixed(3))
  };
  assert.equal(sandbox.validate(exact), true);
  assert.equal(sandbox.validate({ ...exact, probabilityExactB: exact.probabilityExactB - 0.01 }), false);
  assert.equal(sandbox.validate({ ...exact, fairOddsA: 2 }), false);
});

test("daily best bet respects the configured minimum EV and odds floor", () => {
  const start = frontendSource.indexOf("function selectBestBet(");
  const end = frontendSource.indexOf("function renderBestBet(", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = { Number };
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.select = selectBestBet;", sandbox);
  const bets = [
    { player: "A", odds: 2.4, ev: 2.9, freshnessLevel: "good" },
    { player: "B", odds: 1.8, ev: 20, freshnessLevel: "good" },
    { player: "C", odds: 2.1, ev: 6, freshnessLevel: "limited" },
    { player: "D", odds: 2.2, ev: 4, freshnessLevel: "medium" },
    { player: "E", odds: 2.05, ev: 5, freshnessLevel: "good" }
  ];
  assert.equal(sandbox.select(bets, 3).player, "E");
  assert.equal(sandbox.select(bets, 7), null);
  assert.equal(sandbox.select(bets, 0).player, "E");
  assert.equal(sandbox.select(bets, 2, 2.3).player, "A");
  assert.equal(sandbox.select(bets, 2, 2.5), null);
});

test("daily best bet has its own persisted odds threshold setting and does not reuse the general odds filter", () => {
  assert.ok(frontendSource.includes('id="bestBetMinOdds"'));
  assert.ok(frontendSource.includes('min="1.50" max="15" step="1" value="1.50"'));
  assert.ok(frontendSource.includes("bestBetMinOdds<1.5||bestBetMinOdds>15"));
  assert.ok(frontendSource.includes("'minEv','minOdds','maxOdds','bestBetMinOdds'"));
  assert.ok(frontendSource.includes("selectBestBet(bets,minEv,bestBetMinOdds)"));
  assert.ok(frontendSource.includes("Не меняет EV, вероятность модели или размер ставки"));
});

test("stake sizing maps good, medium and limited freshness correctly", () => {
  const start = frontendSource.indexOf("function freshnessStakeMultiplier(");
  const end = frontendSource.indexOf("function selectBestBet(", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.multiplier = freshnessStakeMultiplier;", sandbox);
  assert.equal(sandbox.multiplier("good"), 1);
  assert.equal(sandbox.multiplier("medium"), 0.5);
  assert.equal(sandbox.multiplier("limited"), 0);
  assert.equal(sandbox.multiplier("unknown"), 0);
});

test("odds freshness continues aging while the model prediction is loading", () => {
  const start = frontendSource.indexOf("function currentOddsAgeMinutes(");
  const end = frontendSource.indexOf("function assessDataFreshness(", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = { Date, Number, Math, String };
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.age = currentOddsAgeMinutes;", sandbox);
  const observedAt = Date.parse("2026-11-18T12:00:00Z");
  const now = observedAt + 45 * 60 * 1000;
  assert.equal(sandbox.age(20, observedAt, now), 65);
  assert.equal(sandbox.age("", observedAt, now), null);
  assert.equal(sandbox.age("invalid", observedAt, now), null);
  assert.equal(sandbox.age(20, null, now), null);
  assert.equal(sandbox.age(20, now + 6000, now), null);
});

test("data freshness is labelled conservatively from rating dates and odds age", () => {
  const start = frontendSource.indexOf("function assessDataFreshness(");
  const end = frontendSource.indexOf("function renderBestBet(", start);
  assert.ok(start >= 0 && end > start);
  const validDateStart = frontendSource.indexOf("function validRatingDate(");
  const validDateEnd = frontendSource.indexOf("function isValidPredictionResult(", validDateStart);
  const sandbox = { Date, Number, Math };
  vm.runInNewContext(frontendSource.slice(validDateStart, validDateEnd) +
    frontendSource.slice(start, end) + "\nglobalThis.assess = assessDataFreshness;", sandbox);
  const now = Date.parse("2026-11-18T12:00:00Z");
  assert.equal(sandbox.assess("2026-11-10", "2026-11-11", 20, now).level, "good");
  assert.equal(sandbox.assess("2026-10-20", "2026-10-21", 60, now).level, "medium");
  assert.equal(sandbox.assess(null, "2026-11-11", 10, now).level, "limited");
  assert.equal(sandbox.assess("2026-10-01", "2026-10-02", 10, now).level, "limited");
  assert.equal(sandbox.assess("2026-11-10", "2026-11-11", 120, now).level, "limited");
});

test("frontend inline JavaScript parses without syntax errors", () => {
  const start = frontendSource.indexOf("<script>");
  const end = frontendSource.indexOf("</script>", start);
  assert.ok(start >= 0 && end > start, "inline application script should exist");
  const script = frontendSource.slice(start + 8, end);
  assert.doesNotThrow(() => new Function(script));
});

test("prediction archive and CSV export remain connected to the UI", () => {
  assert.ok(frontendSource.includes('id="statsView"'));
  assert.ok(frontendSource.includes("savePredictionSnapshot(m,el,result,modelCalculatedAt)"));
  assert.ok(frontendSource.includes("tennis-value-archive.csv"));
  assert.ok(frontendSource.includes("createArchiveBackup(rows)"));
  assert.ok(frontendSource.includes("readArchiveBackup(payload)"));
  assert.ok(frontendSource.includes("'ratingAsOf'"));
});

test("archive stores both priced player outcomes with calculated EV", () => {
  const { readPredictionArchive, savePredictionSnapshot } = makeArchiveStore();
  const match = { id: 123, tournament_name: "ATP Finals", tour: "ATP", surface: "Hard" };
  const element = { dataset: {
    nameA: "Ben Shelton", nameB: "Rafael Jodar",
    playerA: "1", playerB: "2", oddsA: "1.80", oddsB: "2.10",
    quoteCapturedA: String(Date.parse("2026-11-18T09:59:00Z")),
    quoteCapturedB: String(Date.parse("2026-11-18T09:58:30Z")),
    oddsObservedAt: String(Date.parse("2026-11-18T09:59:30Z"))
  }};
  savePredictionSnapshot(match, element, {
    probabilityA: 60, probabilityB: 40, ratingA: 1900, ratingB: 1800,
    ratingsAsOfA: "2026-11-10", ratingsAsOfB: "2026-11-11"
  }, Date.parse("2026-11-18T09:59:45Z"));
  const rows = readPredictionArchive();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tour, "atp");
  assert.equal(rows[0].surface, "Hard");
  assert.equal(rows.find(row => row.side === "A").matchId, 123);
  assert.equal(rows.find(row => row.side === "A").ev, 8);
  assert.equal(rows.find(row => row.side === "B").ev, -16);
  assert.equal(rows.find(row => row.side === "A").ratingAsOf, "2026-11-10");
  assert.equal(rows.find(row => row.side === "A").quoteCapturedAt, Date.parse("2026-11-18T09:59:00Z"));
  assert.equal(rows.find(row => row.side === "B").quoteCapturedAt, Date.parse("2026-11-18T09:58:30Z"));
  assert.equal(rows.find(row => row.side === "A").quoteObservedAt, Date.parse("2026-11-18T09:59:30Z"));
  assert.equal(rows.find(row => row.side === "A").modelCalculatedAt, Date.parse("2026-11-18T09:59:45Z"));
});

test("archive suppresses identical snapshots but records changed odds", () => {
  const { readPredictionArchive, savePredictionSnapshot } = makeArchiveStore();
  const match = { id: "match-456" };
  const element = { dataset: {
    nameA: "Player A", nameB: "Player B", playerA: "1", playerB: "2",
    oddsA: "1.80", oddsB: "2.10"
  }};
  const result = { probabilityA: 60, probabilityB: 40, ratingA: 1900, ratingB: 1800 };
  savePredictionSnapshot(match, element, result);
  savePredictionSnapshot(match, element, result);
  assert.equal(readPredictionArchive().length, 2);
  element.dataset.oddsA = "1.90";
  savePredictionSnapshot(match, element, result);
  assert.equal(readPredictionArchive().length, 3);
  assert.equal(readPredictionArchive().find(row => row.odds === 1.9).ev, 14);
  result.ratingA = 1901;
  savePredictionSnapshot(match, element, result);
  assert.equal(readPredictionArchive().length, 4);
});

test("failed IndexedDB transaction leaves the localStorage recovery copy readable", async () => {
  const indexedDB = makeFakeIndexedDB({ failAdds: true });
  const store = makeArchiveStore([], { indexedDB });
  await store.initializeArchiveStorage();
  const row = { matchKey: "fallback", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 55, ev: 10, capturedAt: 1800000000002 };
  store.persistPredictionArchive([row]);
  const flushed = await store.flushArchiveWrites();
  assert.equal(flushed.ok, false);
  assert.equal(store.readPredictionArchive().length, 1);
  assert.equal(store.readPredictionArchive()[0].matchKey, "fallback");
});

test("IndexedDB retains the full archive when the localStorage backup is full", async () => {
  const indexedDB = makeFakeIndexedDB();
  const store = makeArchiveStore([], { indexedDB, failWrites: true });
  await store.initializeArchiveStorage();
  const rows = Array.from({ length: 350 }, (_, i) => ({
    matchKey: "quota-" + i, side: "A", player: "A", opponent: "B",
    odds: 2, probability: 55, ev: 10, capturedAt: 1800000000000 + i
  }));
  const saved = store.persistPredictionArchive(rows);
  assert.equal(saved.storage, "indexeddb");
  assert.equal(saved.saved, 350);
  await store.flushArchiveWrites();
  assert.equal(indexedDB.state.records.length, 350);
  assert.equal(store.readPredictionArchive().length, 350);
});

test("queued archive writes merge stale snapshots instead of dropping earlier tab records", async () => {
  const indexedDB = makeFakeIndexedDB();
  const store = makeArchiveStore([], { indexedDB });
  await store.initializeArchiveStorage();
  const rowA = { matchKey: "tab-a", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 55, ev: 10, capturedAt: 1800000000100 };
  const rowB = { matchKey: "tab-b", side: "B", player: "B", opponent: "A",
    odds: 2.1, probability: 52, ev: 9.2, capturedAt: 1800000000200 };
  store.persistPredictionArchive([rowA]);
  store.persistPredictionArchive([rowB]);
  const flushed = await store.flushArchiveWrites();
  assert.equal(flushed.ok, true);
  assert.deepEqual(indexedDB.state.records.map(row => row.matchKey).sort(), ["tab-a", "tab-b"]);
});

test("archive waits for IndexedDB transaction before reporting it flushed", async () => {
  const indexedDB = makeFakeIndexedDB();
  const store = makeArchiveStore([], { indexedDB });
  await store.initializeArchiveStorage();
  const row = { matchKey: "durable", side: "A", player: "A", opponent: "B",
    odds: 2.2, probability: 52, ev: 14.4, capturedAt: 1800000000001 };
  const saved = store.persistPredictionArchive([row]);
  assert.equal(saved.saved, 1);
  const flushed = await store.flushArchiveWrites();
  assert.equal(flushed.ok, true);
  assert.equal(indexedDB.state.records.length, 1);
  assert.equal(indexedDB.state.records[0].matchKey, "durable");
});

test("IndexedDB migration is repeatable and preserves legacy snapshots", async () => {
  const indexedDB = makeFakeIndexedDB();
  const legacy = [{ matchKey: "migrated", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 55, ev: 10, capturedAt: 1800000000000 }];
  const store = makeArchiveStore(legacy, { indexedDB });
  const first = await store.initializeArchiveStorage();
  assert.equal(first.mode, "indexeddb");
  assert.equal(first.migrated, true);
  assert.equal(store.readPredictionArchive().length, 1);
  const second = await store.initializeArchiveStorage();
  assert.equal(second.mode, "indexeddb");
  assert.equal(store.readPredictionArchive().length, 1);
  assert.equal(indexedDB.state.records.length, 1);
  assert.equal(indexedDB.state.meta.get("initialized"), true);
});

test("IndexedDB migration never replaces a newer official result with a later-checked stale backup", async () => {
  const stored = { matchKey: "same", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 60, ev: 20, capturedAt: 1800000000000,
    resultOutcome: "completed", resultWinner: 1, resultVersion: 5, resultCheckedAt: 1000 };
  const staleBackup = { ...stored, resultWinner: 2, resultVersion: 4, resultCheckedAt: 2000 };
  const indexedDB = makeFakeIndexedDB();
  indexedDB.state.records.push({ ...stored, id: 1 });
  indexedDB.state.meta.set("initialized", true);
  const store = makeArchiveStore([staleBackup], { indexedDB });
  const preflight = store.mergePredictionArchive([stored], [staleBackup]);
  assert.equal(preflight.rows[0].resultVersion, 5);
  const initialization = await store.initializeArchiveStorage();
  assert.equal(initialization.mode, "indexeddb");
  const migrated = store.readPredictionArchive()[0];
  assert.equal(migrated.resultVersion, 5);
  assert.equal(migrated.resultWinner, 1);
});

test("archive memory cache remains readable when localStorage quota is exhausted", () => {
  const store = makeArchiveStore([], { failWrites: true });
  const row = { matchKey: "memory-only", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 55, ev: 10, capturedAt: 1800000000000 };
  const saved = store.persistPredictionArchive([row]);
  assert.equal(saved.saved, 0);
  assert.equal(store.readPredictionArchive().length, 1);
  assert.equal(store.readPredictionArchive()[0].matchKey, "memory-only");
  const returned = store.readPredictionArchive();
  returned[0].player = "mutated";
  assert.equal(store.readPredictionArchive()[0].player, "A");
});

test("corrupt local archive is reported and never silently overwritten", async () => {
  const store = makeArchiveStore([], { corruptSeed: true });
  const read = store.readPredictionArchive();
  assert.equal(read.length, 0);
  assert.ok(store.getArchiveReadError() instanceof Error);
  const saved = store.persistPredictionArchive([{ matchKey: "new", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 55, ev: 10, capturedAt: 1800000000000 }]);
  assert.equal(saved.saved, 0);
  assert.ok(saved.error);
  assert.match(store.getArchiveReadError().message, /JSON|позици/i);
});

test("archive keeps the legacy localStorage copy when IndexedDB is unavailable", async () => {
  const legacy = [{ matchKey: "legacy-match", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 55, ev: 10, capturedAt: 1800000000000 }];
  const store = makeArchiveStore(legacy);
  const result = await store.initializeArchiveStorage();
  assert.equal(result.mode, "local");
  assert.equal(store.readPredictionArchive().length, 1);
  assert.equal(store.readPredictionArchive()[0].matchKey, "legacy-match");
});

test("archive backup v2 detects corruption and preserves legacy v1 compatibility", () => {
  const { createArchiveBackup, readArchiveBackup } = makeArchiveStore();
  const records = [{ matchKey: "m1", side: "A", capturedAt: 123 }];
  const backup = createArchiveBackup(records, "2026-11-18T12:00:00.000Z");
  assert.equal(backup.version, 2);
  assert.equal(backup.recordCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(readArchiveBackup(backup).records)), records);
  assert.equal(readArchiveBackup(backup).legacy, false);
  const corrupted = { ...backup, records: [{ ...records[0], odds: 2.1 }] };
  assert.throws(() => readArchiveBackup(corrupted), /Контрольная сумма/);
  assert.throws(() => readArchiveBackup({ ...backup, recordCount: 99 }), /Количество записей/);
  assert.throws(() => readArchiveBackup({ ...backup, version: 77 }), /не поддерживается/);
  const legacy = readArchiveBackup({ format: "tennis-value-scanner-archive", version: 1, records });
  assert.equal(legacy.legacy, true);
  assert.deepEqual(JSON.parse(JSON.stringify(legacy.records)), records);
});

test("archive merge preserves official result status and restatement metadata", () => {
  const { mergePredictionArchive } = makeArchiveStore();
  const row = { matchKey: "m-result", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 55, ev: 10, capturedAt: 1000, resultOutcome: "completed",
    resultWinner: 1, resultVersion: 2, resultCheckedAt: 2000,
    resultStatus: "completed", resultRestatedAt: "2026-11-18T10:00:00Z" };
  const merged = mergePredictionArchive([], [row]).rows[0];
  assert.equal(merged.resultStatus, "completed");
  assert.equal(merged.resultRestatedAt, "2026-11-18T10:00:00Z");
});

test("archive import merges newer official result metadata into an identical snapshot", () => {
  const { mergePredictionArchive } = makeArchiveStore();
  const original = { matchKey: "merge-result", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 60, ev: 20, capturedAt: 1000, resultOutcome: null, resultVersion: null };
  const verified = { ...original, resultOutcome: "completed", resultWinner: 1, resultVersion: 2, resultCheckedAt: 3000 };
  const merged = mergePredictionArchive([original], [verified]);
  assert.equal(merged.added, 0);
  assert.equal(merged.updated, 1);
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].resultOutcome, "completed");
  assert.equal(merged.rows[0].resultWinner, 1);
  assert.equal(merged.rows[0].resultVersion, 2);
  const stale = mergePredictionArchive(merged.rows, [{ ...verified, resultWinner: 2, resultVersion: 1 }]);
  assert.equal(stale.updated, 0);
  assert.equal(stale.rows[0].resultWinner, 1);
});

test("archive import rejects unknown result outcome labels", () => {
  const { mergePredictionArchive } = makeArchiveStore();
  const row = { matchKey: "bad-outcome", side: "A", player: "A", opponent: "B",
    odds: 2, probability: 55, ev: 10, capturedAt: 1000,
    resultOutcome: "winner", resultWinner: 1, resultVersion: 99 };
  const merged = mergePredictionArchive([], [row]);
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].resultOutcome, null);
  assert.equal(merged.rows[0].resultWinner, null);
  assert.equal(merged.rows[0].resultVersion, null);
});

test("archive import validates records, merges duplicates, and retains up to 3000 entries", () => {
  const { mergePredictionArchive } = makeArchiveStore();
  const row = { matchKey: "m1", side: "A", player: "Player A", opponent: "Player B",
    odds: 1.8, probability: 60, ev: 8, capturedAt: 1000, rating: 1800, ratingAsOf: "not-a-date", tour: "wta", surface: "Clay" };
  const result = mergePredictionArchive([row], [row,
    { ...row, matchKey: "m2", capturedAt: 2000, ev: 999 },
    { ...row, odds: 1, matchKey: "bad" }]);
  assert.equal(result.added, 1);
  assert.equal(result.ignored, 1);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.find(item => item.matchKey === "m2").ev, 8);
  assert.equal(result.rows.find(item => item.matchKey === "m2").ratingAsOf, null);
  assert.equal(result.rows.find(item => item.matchKey === "m2").tour, "wta");
  assert.equal(result.rows.find(item => item.matchKey === "m2").surface, "Clay");
  const many = Array.from({ length: 3005 }, (_, i) => ({ ...row, matchKey: "m" + i, capturedAt: i + 1 }));
  const capped = mergePredictionArchive([], many);
  assert.equal(capped.rows.length, 3000);
  assert.equal(capped.rows[0].capturedAt, 6);
  const mixed = many.map((item, i) => i === 0 ? { ...item, resultOutcome: "completed", resultWinner: 1 } : item);
  const retained = mergePredictionArchive([], mixed.slice(0, 3005));
  assert.equal(retained.rows.length, 3000);
  assert.ok(retained.rows.some(item => item.matchKey === "m0"), "verified completed records take priority over pending snapshots");
  assert.equal(retained.dropped, 5);
});

test("predict rejects the same player ID on both sides before API calls", async () => {
  const response = await worker.fetch(new Request("https://example.com/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerIdA: "player-123", playerIdB: "player-123" })
  }), { LIVE_TENNIS_API_KEY: "test-key" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /different players/);
});

test("result endpoint validates the match ID and HTTP method", async () => {
  assert.equal((await call("/result?id=0")).status, 400);
  assert.equal((await call("/result?id=12x")).status, 400);
  assert.equal((await call("/result?id=123", "POST", "{}")).status, 405);
});

test("result endpoint proxies one match with the configured API key", async () => {
  let requestedUrl = "";
  let requestedKey = "";
  workerSandbox.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedKey = options.headers["X-API-Key"];
    return new Response(JSON.stringify({ id: 123, status: "completed", outcome: "completed", winner: 1, result_version: 1 }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };
  const res = await call("/result?id=123");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.match(requestedUrl, /\/matches\/123$/);
  assert.equal(requestedKey, "test-key");
  assert.equal(body.winner, 1);
});

test("result check batches rotate by oldest check time instead of starving later matches", () => {
  const { selectArchiveResultCheckIds } = makeArchiveStore();
  const now=Date.parse("2026-11-20T18:00:00Z");
  const rows=Array.from({length:15},(_,index)=>({
    matchId:index+1,matchDate:new Date(now-5*60*60*1000-index*60000).toISOString(),
    resultCheckedAt:index<10?now-10*60*1000:null
  }));
  assert.deepEqual(JSON.parse(JSON.stringify(selectArchiveResultCheckIds(rows,now,10))),[15,14,13,12,11]);
  const next=rows.map(row=>({...row,resultCheckedAt:row.matchId>10?now:row.resultCheckedAt}));
  assert.deepEqual(JSON.parse(JSON.stringify(selectArchiveResultCheckIds(next,now+31*60*1000,10))),[10,9,8,7,6,5,4,3,2,1]);
});

test("result check selector ignores future, too-recent and invalid match records", () => {
  const { selectArchiveResultCheckIds } = makeArchiveStore();
  const now=Date.parse("2026-11-20T18:00:00Z");
  const rows=[
    {matchId:1,matchDate:new Date(now-4*60*60*1000).toISOString()},
    {matchId:2,matchDate:new Date(now-2*60*60*1000).toISOString()},
    {matchId:3,matchDate:new Date(now-4*60*60*1000).toISOString(),resultCheckedAt:now-5*60*1000},
    {matchId:0,matchDate:new Date(now-4*60*60*1000).toISOString()}
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(selectArchiveResultCheckIds(rows,now,10))),[1]);
});

test("probability calibration uses one latest pre-match A-side prediction per verified match", () => {
  const { archiveProbabilityCalibration } = makeArchiveStore();
  const start = Date.parse("2026-11-20T12:00:00Z");
  const rows = [
    { matchId: 1, matchKey: "1", side: "A", probability: 60, capturedAt: start-60000, matchDate: new Date(start).toISOString(), resultOutcome: "completed", resultWinner: 1, resultVersion: 1 },
    { matchId: 1, matchKey: "1", side: "B", probability: 40, capturedAt: start-60000, matchDate: new Date(start).toISOString(), resultOutcome: "completed", resultWinner: 1, resultVersion: 1 },
    { matchId: 1, matchKey: "1", side: "A", bookmaker: "Betclic", probability: 60, capturedAt: start-60000, matchDate: new Date(start).toISOString(), resultOutcome: "completed", resultWinner: 1, resultVersion: 1 },
    { matchId: 1, matchKey: "1", side: "A", probability: 70, capturedAt: start-30000, matchDate: new Date(start).toISOString(), resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ];
  const result = archiveProbabilityCalibration(rows);
  assert.equal(result.sampleSize, 1);
  assert.equal(result.buckets[0].lower, 70);
  assert.equal(result.buckets[0].count, 1);
  assert.ok(Math.abs(result.brierScore-0.09)<1e-12);
  assert.ok(result.preliminary);
});

test("calibration excludes live snapshots even when scheduled start is still in the future", () => {
  const { archiveProbabilityCalibration } = makeArchiveStore();
  const scheduled=Date.parse("2026-11-20T12:00:00Z");
  const liveAt=scheduled-15*60*1000;
  const rows=[
    {matchId:81,matchKey:"81",side:"A",probability:65,capturedAt:liveAt+60000,
      matchDate:new Date(scheduled).toISOString(),captureStatus:"live",resultOutcome:"completed",resultWinner:1},
    {matchId:82,matchKey:"82",side:"A",probability:65,capturedAt:scheduled-60000,
      matchDate:new Date(scheduled).toISOString(),captureStatus:"upcoming",resultOutcome:"completed",resultWinner:1},
    {matchId:83,matchKey:"83",side:"A",probability:65,capturedAt:scheduled,
      matchDate:new Date(scheduled).toISOString(),captureStatus:"upcoming",resultOutcome:"completed",resultWinner:1}
  ];
  const result=archiveProbabilityCalibration(rows);
  assert.equal(result.sampleSize,1);
  assert.equal(result.postStart,2);
});

test("snapshot stores API capture status and uses live_at as the actual-start cutoff", () => {
  const { readPredictionArchive, savePredictionSnapshot } = makeArchiveStore();
  const scheduled="2026-11-20T12:00:00Z";
  const liveAt="2026-11-20T11:45:00Z";
  const element={dataset:{nameA:"Player A",nameB:"Player B",playerA:"1",playerB:"2",oddsA:"2.1",oddsB:"1.8",bookmakerA:"Winamax",bookmakerB:"Winamax"}};
  savePredictionSnapshot({id:901,status:"live",scheduled_time:scheduled,live_at:liveAt,players:{p1:{id:1},p2:{id:2}}},element,{probabilityA:60,probabilityB:40,ratingA:1800,ratingB:1750});
  const rows=readPredictionArchive();
  assert.equal(rows.length,2);
  assert.equal(rows[0].captureStatus,"live");
  assert.equal(rows[0].matchDate,new Date(liveAt).toISOString());
  const imported=makeArchiveStore().mergePredictionArchive([],rows);
  assert.equal(imported.rows[0].captureStatus,"live");
});

test("probability calibration places exact bucket boundaries and computes proper scores", () => {
  const { archiveProbabilityCalibration } = makeArchiveStore();
  const start = Date.parse("2026-11-20T12:00:00Z");
  const make = (id, probability, winner) => ({ matchId:id, matchKey:String(id), side:"A", probability,
    capturedAt:start-1000, matchDate:new Date(start).toISOString(), resultOutcome:"completed", resultWinner:winner });
  const result = archiveProbabilityCalibration([make(1,55,1),make(2,100,2),make(3,0,2)]);
  assert.equal(result.sampleSize,3);
  assert.deepEqual(JSON.parse(JSON.stringify(result.buckets.map(bucket=>[bucket.lower,bucket.upper,bucket.count]))),[[0,5,1],[55,60,1],[95,100,1]]);
  assert.ok(Math.abs(result.brierScore-(0.2025+1+0)/3)<1e-12);
  assert.ok(Number.isFinite(result.logLoss));
});

test("probability calibration excludes unresolved, retired, malformed, missing-date and post-start records", () => {
  const { archiveProbabilityCalibration } = makeArchiveStore();
  const start = Date.parse("2026-11-20T12:00:00Z");
  const make = (id, extra={}) => ({ matchId:id,matchKey:String(id),side:"A",probability:65,capturedAt:start-1000,
    matchDate:new Date(start).toISOString(),resultOutcome:"completed",resultWinner:1,...extra });
  const rows = [
    make(1,{resultOutcome:"retired"}),
    make(2,{probability:null}),
    make(3,{capturedAt:start}),
    make(4,{matchDate:null}),
    make(5,{resultWinner:null}),
    { ...make(6), side:"X" }
  ];
  const result=archiveProbabilityCalibration(rows);
  assert.equal(result.sampleSize,0);
  assert.equal(result.excluded,1);
  assert.equal(result.postStart,1);
  assert.equal(result.missingStart,1);
  assert.equal(result.invalid,1);
  assert.equal(result.ambiguous,1);
});

test("probability calibration can derive the match-side probability from a B-only archive snapshot", () => {
  const { archiveProbabilityCalibration } = makeArchiveStore();
  const start=Date.parse("2026-11-20T12:00:00Z");
  const result=archiveProbabilityCalibration([{
    matchId:77,matchKey:"77",side:"B",probability:65,capturedAt:start-1000,
    matchDate:new Date(start).toISOString(),resultOutcome:"completed",resultWinner:2
  }]);
  assert.equal(result.sampleSize,1);
  assert.equal(result.buckets[0].lower,35);
  assert.ok(Math.abs(result.brierScore-0.1225)<1e-12);
});

test("probability calibration rejects conflicting latest snapshots and counts duplicate exact snapshots once", () => {
  const { archiveProbabilityCalibration } = makeArchiveStore();
  const start=Date.parse("2026-11-20T12:00:00Z");
  const base={side:"A",capturedAt:start-1000,matchDate:new Date(start).toISOString(),resultOutcome:"completed",resultWinner:1};
  const rows=[
    {...base,matchId:1,matchKey:"1",probability:60},
    {...base,matchId:1,matchKey:"1",probability:60},
    {...base,matchId:2,matchKey:"2",probability:60},
    {...base,matchId:2,matchKey:"2",probability:65}
  ];
  const result=archiveProbabilityCalibration(rows);
  assert.equal(result.sampleSize,1);
  assert.equal(result.ambiguous,1);
});

test("result verification rejects mismatched match IDs, missing player identity and swapped players", () => {
  const { applyVerifiedMatchResult } = makeArchiveStore();
  const rows=[
    {matchId:321,side:"A",player:"Player One",opponent:"Player Two"},
    {matchId:321,side:"B",player:"Player Two",opponent:"Player One"}
  ];
  const valid={id:321,players:{p1:{name:"Player One"},p2:{name:"Player Two"}},outcome:"completed",winner:1,result_version:1};
  assert.equal(applyVerifiedMatchResult(rows,{...valid,id:322}).updated,0);
  assert.equal(applyVerifiedMatchResult(rows,{...valid,players:{p1:{name:"Player One"}}}).updated,0);
  assert.equal(applyVerifiedMatchResult(rows,{...valid,players:{p1:{name:"Player Two"},p2:{name:"Player One"}}}).updated,0);
  assert.equal(applyVerifiedMatchResult(rows,valid).updated,2);
});

test("result identity prefers stable player IDs and tolerates harmless display-name changes", () => {
  const { applyVerifiedMatchResult, mergePredictionArchive } = makeArchiveStore();
  const imported=mergePredictionArchive([],[
    {matchKey:"ids",matchId:4321,side:"A",player:"Player One",opponent:"Player Two",playerId:11,opponentId:22,odds:2,probability:60,ev:20,capturedAt:100},
    {matchKey:"ids",matchId:4321,side:"B",player:"Player Two",opponent:"Player One",playerId:22,opponentId:11,odds:2,probability:40,ev:-20,capturedAt:100}
  ]).rows;
  assert.equal(imported[0].playerId,11);
  const base={id:4321,players:{p1:{id:11,name:"Player One"},p2:{id:22,name:"Player Two"}},outcome:"completed",winner:1,result_version:1};
  assert.equal(applyVerifiedMatchResult(imported,{...base,players:{p1:{id:99,name:"Player One"},p2:{id:22,name:"Player Two"}}}).updated,0);
  assert.equal(applyVerifiedMatchResult(imported,{...base,players:{p1:{id:11,name:"P. One"},p2:{id:22,name:"P. Two"}}}).updated,2);
  assert.equal(applyVerifiedMatchResult(imported,base).updated,2);
});

test("result identity rejects swapped stable IDs even when names appear in the expected order", () => {
  const { applyVerifiedMatchResult } = makeArchiveStore();
  const rows=[
    {matchId:4322,side:"A",player:"Player One",opponent:"Player Two",playerId:11,opponentId:22},
    {matchId:4322,side:"B",player:"Player Two",opponent:"Player One",playerId:22,opponentId:11}
  ];
  const swapped={id:4322,players:{p1:{id:22,name:"Player One"},p2:{id:11,name:"Player Two"}},outcome:"completed",winner:1,result_version:1};
  assert.equal(applyVerifiedMatchResult(rows,swapped).updated,0);
});

test("result identity fallback normalizes accented Latin and Cyrillic player names", () => {
  const { applyVerifiedMatchResult } = makeArchiveStore();
  const latin=[
    {matchId:4323,side:"A",player:"João Fonseca",opponent:"Nuno Borges"},
    {matchId:4323,side:"B",player:"Nuno Borges",opponent:"João Fonseca"}
  ];
  const latinResult={id:4323,players:{p1:{name:"Joao Fonseca"},p2:{name:"Nuno Borges"}},outcome:"completed",winner:1,result_version:1};
  assert.equal(applyVerifiedMatchResult(latin,latinResult).updated,2);
  const cyrillic=[
    {matchId:4324,side:"A",player:"Андрей Рублёв",opponent:"Даниил Медведев"},
    {matchId:4324,side:"B",player:"Даниил Медведев",opponent:"Андрей Рублёв"}
  ];
  const cyrillicResult={id:4324,players:{p1:{name:"Андрей Рублев"},p2:{name:"Даниил Медведев"}},outcome:"completed",winner:2,result_version:1};
  assert.equal(applyVerifiedMatchResult(cyrillic,cyrillicResult).updated,2);
});

test("result verification refuses completed matches without a valid winner or unknown outcomes", () => {
  const { applyVerifiedMatchResult } = makeArchiveStore();
  const rows=[{matchId:654,side:"A",player:"Player One",opponent:"Player Two"}];
  const base={id:654,players:{p1:{name:"Player One"},p2:{name:"Player Two"}}};
  assert.equal(applyVerifiedMatchResult(rows,{...base,outcome:"completed",winner:null}).updated,0);
  assert.equal(applyVerifiedMatchResult(rows,{...base,outcome:"mystery",winner:1}).updated,0);
  assert.equal(applyVerifiedMatchResult(rows,{...base,outcome:"unresolved",winner:null}).rows[0].resultOutcome,"unresolved");
});

test("archive applies only verified completed results and honours result revisions", () => {
  const { applyVerifiedMatchResult, archiveResultStats } = makeArchiveStore();
  const rows = [
    { matchId: 123, matchKey: "123", side: "A", player:"Carlos Alcaraz", opponent:"Jannik Sinner", probability: 61, capturedAt: 100, matchDate:"1970-01-01T00:00:01.000Z", resultVersion: 1 },
    { matchId: 123, matchKey: "123", side: "B", player:"Jannik Sinner", opponent:"Carlos Alcaraz", probability: 39, capturedAt: 100, matchDate:"1970-01-01T00:00:01.000Z", resultVersion: 1 },
    { matchId: 456, matchKey: "456", side: "A", probability: 70, capturedAt: 100 }
  ];
  const apiMatch = { id:123, players:{p1:{name:"Carlos Alcaraz"},p2:{name:"Jannik Sinner"}} };
  const ignoredRevision = applyVerifiedMatchResult(rows, { ...apiMatch, status: "completed", outcome: "completed", winner: 2, result_version: 0 }, 500);
  assert.equal(ignoredRevision.rows[0].resultWinner, undefined);
  const applied = applyVerifiedMatchResult(rows, { ...apiMatch, status: "completed", outcome: "completed", winner: 1, result_version: 2 }, 600);
  assert.equal(applied.updated, 2);
  assert.equal(applied.rows[0].resultOutcome, "completed");
  assert.equal(applied.rows[0].resultWinner, 1);
  const stats = archiveResultStats(applied.rows);
  assert.equal(stats.settled, 1);
  assert.equal(stats.accuracy, 100);
  const withdrawn = applyVerifiedMatchResult(applied.rows, { ...apiMatch, status: "completed", outcome: "retired", winner: 1, result_version: 3 }, 700);
  assert.equal(withdrawn.rows[0].resultOutcome, "retired");
  assert.equal(archiveResultStats(withdrawn.rows).settled, 0);
});

test("archive accuracy honours newer non-completed result versions and rejects conflicting predictions", () => {
  const { archiveResultStats } = makeArchiveStore();
  const rows = [
    { matchId: 888, matchKey: "888", side: "A", probability: 60, capturedAt: 100, matchDate:"1970-01-01T00:00:01.000Z", resultOutcome: "completed", resultWinner: 1, resultVersion: 1 },
    { matchId: 888, matchKey: "888", side: "A", probability: 60, capturedAt: 200, matchDate:"1970-01-01T00:00:01.000Z", resultOutcome: "retired", resultWinner: 1, resultVersion: 2 },
    { matchId: 889, matchKey: "889", side: "A", probability: 60, capturedAt: 100, matchDate:"1970-01-01T00:00:01.000Z", resultOutcome: "completed", resultWinner: 1, resultVersion: 1 },
    { matchId: 889, matchKey: "889", side: "B", probability: 60, capturedAt: 100, matchDate:"1970-01-01T00:00:01.000Z", resultOutcome: "completed", resultWinner: 1, resultVersion: 1 },
    { matchId: 890, matchKey: "890", side: "A", probability: null, capturedAt: null, matchDate:"1970-01-01T00:00:01.000Z", resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ];
  const stats = archiveResultStats(rows);
  assert.equal(stats.settled, 0);
  assert.equal(stats.excluded, 1);
  assert.equal(stats.ambiguous, 2);
});

test("archive prediction accuracy gives exact 50 percent Elo ties half credit", () => {
  const { archiveResultStats } = makeArchiveStore();
  const rows = [
    { matchId: 765, matchKey: "765", side: "A", probability: 50, capturedAt: 100, matchDate:"1970-01-01T00:00:01.000Z", resultOutcome: "completed", resultWinner: 1 },
    { matchId: 765, matchKey: "765", side: "B", probability: 50, capturedAt: 100, matchDate:"1970-01-01T00:00:01.000Z", resultOutcome: "completed", resultWinner: 1 }
  ];
  const stats = archiveResultStats(rows);
  assert.equal(stats.settled, 1);
  assert.equal(stats.accuracy, 50);
});

test("archive accuracy selects the latest coherent pre-match snapshot and ignores post-start forecasts", () => {
  const { archiveResultStats } = makeArchiveStore();
  const start=Date.parse("2026-11-20T12:00:00Z");
  const date=new Date(start).toISOString();
  const rows=[
    {matchId:7001,side:"A",probability:60,capturedAt:start-60000,matchDate:date,resultOutcome:"completed",resultWinner:1},
    {matchId:7001,side:"B",probability:40,capturedAt:start-60000,matchDate:date,resultOutcome:"completed",resultWinner:1},
    {matchId:7001,side:"A",probability:30,capturedAt:start-30000,matchDate:date,resultOutcome:"completed",resultWinner:1},
    {matchId:7001,side:"B",probability:70,capturedAt:start-30000,matchDate:date,resultOutcome:"completed",resultWinner:1},
    {matchId:7001,side:"A",probability:99,capturedAt:start+1000,matchDate:date,captureStatus:"live",resultOutcome:"completed",resultWinner:1}
  ];
  const result=archiveResultStats(rows);
  assert.equal(result.settled,1);
  assert.equal(result.accuracy,0);
  assert.equal(result.postStart,1);
});

test("archive accuracy does not combine sides from different capture times or accept malformed latest rows", () => {
  const { archiveResultStats } = makeArchiveStore();
  const start=Date.parse("2026-11-20T12:00:00Z"),date=new Date(start).toISOString();
  const differentTimes=[
    {matchId:7002,side:"A",probability:80,capturedAt:start-60000,matchDate:date,resultOutcome:"completed",resultWinner:1},
    {matchId:7002,side:"B",probability:80,capturedAt:start-30000,matchDate:date,resultOutcome:"completed",resultWinner:1}
  ];
  const malformed=[
    {matchId:7003,side:"A",probability:80,capturedAt:start-30000,matchDate:date,resultOutcome:"completed",resultWinner:1},
    {matchId:7003,side:"B",probability:null,capturedAt:start-30000,matchDate:date,resultOutcome:"completed",resultWinner:1}
  ];
  assert.equal(archiveResultStats(differentTimes).settled,1);
  assert.equal(archiveResultStats(differentTimes).accuracy,0);
  assert.equal(archiveResultStats(malformed).settled,0);
  assert.equal(archiveResultStats(malformed).ambiguous,1);
});

test("archive rejects conflicting results at the same version and unversioned regressions", () => {
  const { applyVerifiedMatchResult } = makeArchiveStore();
  const rows = [
    { matchId: 321, matchKey: "321", side: "A", player:"Player One", opponent:"Player Two", resultOutcome: "completed", resultWinner: 1, resultVersion: 4 },
    { matchId: 321, matchKey: "321", side: "B", player:"Player Two", opponent:"Player One", resultOutcome: "completed", resultWinner: 1, resultVersion: 4 },
    { matchId: 654, matchKey: "654", side: "A", player:"Player One", opponent:"Player Two", resultOutcome: "completed", resultWinner: 2, resultVersion: 3 }
  ];
  const apiPlayers={players:{p1:{name:"Player One"},p2:{name:"Player Two"}}};
  const sameVersionConflict = applyVerifiedMatchResult(rows, {
    ...apiPlayers, id: 321, status: "completed", outcome: "completed", winner: 2, result_version: 4
  }, 900);
  assert.equal(sameVersionConflict.updated, 0);
  assert.equal(sameVersionConflict.rows[0].resultWinner, 1);
  const unversionedRegression = applyVerifiedMatchResult(sameVersionConflict.rows, {
    ...apiPlayers, id: 654, status: "completed", outcome: "completed", winner: 1
  }, 901);
  assert.equal(unversionedRegression.updated, 0);
  assert.equal(unversionedRegression.rows[2].resultWinner, 2);
  const newer = applyVerifiedMatchResult(unversionedRegression.rows, {
    ...apiPlayers, id: 321, status: "completed", outcome: "completed", winner: 2, result_version: 5
  }, 902);
  assert.equal(newer.updated, 2);
  assert.equal(newer.rows[0].resultWinner, 2);
});

test("archive accepts the first unversioned official result for a record with no result version", () => {
  const { applyVerifiedMatchResult } = makeArchiveStore();
  const rows = [{ matchId: 987, matchKey: "987", side: "A", player:"Player One", opponent:"Player Two", resultVersion: null }];
  const applied = applyVerifiedMatchResult(rows, {
    id: 987, players:{p1:{name:"Player One"},p2:{name:"Player Two"}}, status: "completed", outcome: "completed", winner: 1
  }, 1000);
  assert.equal(applied.updated, 1);
  assert.equal(applied.rows[0].resultOutcome, "completed");
  assert.equal(applied.rows[0].resultWinner, 1);
});

test("approved interface palette removes green and animates the best bet copper-pink to ruby", () => {
  assert.match(frontendSource, /--yellow:#e6bd58/);
  assert.doesNotMatch(frontendSource, /--green:|#35d07f|#286547|#7de6a8|#123323|#16834e|#20b86b|#75e6a3|#9af0bd/);
  assert.match(frontendSource, /--copper-pink:#d58a8e/);
  assert.match(frontendSource, /--ruby:#a51f45/);
  assert.match(frontendSource, /@keyframes bestBetGlow/);
  assert.match(frontendSource, /\.best-bet\.has-pick\{animation:bestBetGlow/);
  assert.match(frontendSource, /prefers-reduced-motion:reduce\)\{\.best-bet\.has-pick\{animation:none\}\}/);
  assert.match(frontendSource, /box\.classList\.toggle\('has-pick',!!best\)/);
  assert.match(frontendSource, /prefers-reduced-motion:reduce/);
});

test("auto-refresh setting is normalized and restored from persisted settings", () => {
  const start = frontendSource.indexOf("function normalizeRefreshRate(");
  const end = frontendSource.indexOf("\n  const saved=readSettings()", start);
  assert.ok(start >= 0 && end > start);
  const source = frontendSource.slice(start, end);
  const sandbox = { Number };
  vm.runInNewContext(source + "\nglobalThis.normalize = normalizeRefreshRate;", sandbox);
  assert.equal(sandbox.normalize(0), 0);
  assert.equal(sandbox.normalize("30"), 30);
  assert.equal(sandbox.normalize(60), 60);
  assert.equal(sandbox.normalize("180"), 180);
  assert.equal(sandbox.normalize("invalid"), 60);
  assert.match(frontendSource, /data\.refreshRate=refreshRate/);
  assert.match(frontendSource, /normalizeRefreshRate\(readSettings\(\)\.refreshRate\)/);
  assert.match(frontendSource, /window\.addEventListener\('pageshow'/);
});

test("failed result lookups receive a cooldown timestamp without changing other matches", () => {
  const { stampResultCheck } = makeArchiveStore();
  const rows = [{ matchId: 123, resultCheckedAt: 10 }, { matchId: 456, resultCheckedAt: 20 }];
  const stamped = stampResultCheck(rows, 123, 999);
  assert.equal(stamped[0].resultCheckedAt, 999);
  assert.equal(stamped[1].resultCheckedAt, 20);
  assert.equal(stampResultCheck(rows, 0, 999), rows);
});
test("archive tracks opening-to-latest odds movement per match side", () => {
  const { archiveOddsMovement } = makeArchiveStore();
  const rows = [
    { matchId: 1, side: "A", odds: 2.10, capturedAt: 100 },
    { matchId: 1, side: "A", odds: 1.90, capturedAt: 200 },
    { matchId: 1, side: "B", odds: 1.80, capturedAt: 100 },
    { matchId: 1, side: "B", odds: 2.00, capturedAt: 200 },
    { matchId: 2, side: "A", odds: 1.70, capturedAt: 100 },
    { matchId: 2, side: "A", odds: 1.70, capturedAt: 200 },
    { matchId: 3, side: "A", odds: 1.50, capturedAt: 100 },
    { matchId: 4, side: "A", odds: 2.10, capturedAt: 100 },
    { matchId: 4, side: "A", odds: 2.10, capturedAt: 200 },
    { matchId: 5, side: "A", odds: 2.00, capturedAt: 100 },
    { matchId: 5, side: "A", odds: 2.05, capturedAt: 100 },
    { matchId: 5, side: "A", odds: 2.10, capturedAt: 200 },
    { side: "A", odds: 2.00, capturedAt: 100 },
    { side: "A", odds: 2.10, capturedAt: 200 }
  ];
  const movement = archiveOddsMovement(rows);
  assert.equal(movement.shortened, 1);
  assert.equal(movement.drifted, 1);
  assert.equal(movement.unchanged, 2);
  assert.equal(movement.comparable, 4);
  assert.equal(movement.conflicting, 1);
  assert.equal(movement.byBookmaker["Не указан"].shortened, 1);
  assert.equal(movement.byBookmaker["Не указан"].drifted, 1);
});


test("archive odds quality audits bookmaker coverage, freshness and malformed records", () => {
  const { archiveOddsQuality } = makeArchiveStore();
  const now = Date.parse("2026-11-18T12:00:00Z");
  const rows = [
    { matchId: 1, matchKey: "1", matchDate: "2026-11-18T14:00:00Z", side: "A", bookmaker: "Winamax", odds: 2.1, capturedAt: now - 10 * 60 * 1000 },
    { matchId: 1, matchKey: "1", matchDate: "2026-11-18T14:00:00Z", side: "B", bookmaker: "Winamax", odds: 1.8, capturedAt: now - 40 * 60 * 1000 },
    { matchId: 1, matchKey: "1", matchDate: "2026-11-18T14:00:00Z", side: "A", bookmaker: "Betclic", odds: 2.0, capturedAt: now - 3 * 60 * 60 * 1000 },
    { matchId: 2, matchKey: "2", side: "A", bookmaker: "", odds: 2.2, capturedAt: now + 10 * 60 * 1000 },
    { matchKey: "bad", side: "X", odds: 1, capturedAt: now }
  ];
  const result = archiveOddsQuality(rows, now);
  assert.equal(result.totalRows, 5);
  assert.equal(result.validRows, 4);
  assert.equal(result.invalidRows, 1);
  assert.equal(result.missingBookmakerRows, 1);
  assert.equal(result.universeMatchSides, 3);
  const winamax = result.byBookmaker.find(item => item.bookmaker === "Winamax");
  assert.equal(winamax.matchSides, 2);
  assert.equal(winamax.completeMatches, 1);
  assert.equal(winamax.coveragePercent, 66.7);
  assert.equal(winamax.fresh30m, 1);
  assert.equal(winamax.fresh2h, 1);
  const betclic = result.byBookmaker.find(item => item.bookmaker === "Betclic");
  assert.equal(betclic.stale, 1);
  const unknown = result.byBookmaker.find(item => item.bookmaker === "Не указан");
  assert.equal(unknown.future, 1);
});

test("archive odds quality flags conflicting snapshots without mixing bookmakers", () => {
  const { archiveOddsQuality } = makeArchiveStore();
  const now = 1_800_000_000_000;
  const rows = [
    { matchId: 8, side: "A", bookmaker: "Winamax", odds: 2.0, capturedAt: now },
    { matchId: 8, side: "A", bookmaker: "Winamax", odds: 2.1, capturedAt: now },
    { matchId: 8, side: "A", bookmaker: "Betclic", odds: 1.9, capturedAt: now },
    { matchId: 8, side: "A", bookmaker: "Winamax", odds: 2.0, capturedAt: now }
  ];
  const result = archiveOddsQuality(rows, now);
  assert.equal(result.byBookmaker.find(item => item.bookmaker === "Winamax").conflicts, 1);
  assert.equal(result.byBookmaker.find(item => item.bookmaker === "Winamax").duplicates, 1);
  assert.equal(result.byBookmaker.find(item => item.bookmaker === "Betclic").conflicts, 0);
});

test("concurrent predictions share in-flight player profile requests", async () => {
  let upstreamCalls = 0;
  workerSandbox.fetch = async url => {
    upstreamCalls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    const id = String(url).split("/").pop();
    return new Response(JSON.stringify({ name: "Player " + id, stats: { overall_elo: id === "101" ? 1900 : 1800 } }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };
  const payload = JSON.stringify({ playerIdA: "101", playerIdB: "202" });
  const [first, second] = await Promise.all([
    call("/predict", "POST", payload),
    call("/predict", "POST", payload)
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(upstreamCalls, 2);
  const firstBody = await first.json();
  assert.equal(firstBody.ratingA, 1900);
  assert.equal(firstBody.ratingB, 1800);
});

test("bankroll backup restore can replace a corrupt stored record after explicit confirmation", () => {
  assert.match(frontendSource, /function restoreBankrollBackup\(state\)/);
  assert.match(frontendSource, /TVSBankroll\.parseBackup\(JSON\.parse\(localStorage\.getItem\(bankrollStorageKey\(\)\)\)\)/);
  assert.match(frontendSource, /if\(restoreBankrollBackup\(restored\)\)renderBankroll\(\)/);
  assert.ok(frontendSource.includes("Текущие записи будут заменены."));
});

test("bankroll dashboard is connected to navigation and uses a separate versioned store", () => {
  assert.ok(frontendSource.includes('id="bankrollView"'));
  assert.ok(frontendSource.includes('id="navBankroll"'));
  assert.ok(frontendSource.includes("const BANKROLL_VIRTUAL_KEY='tvs-bankroll-v1'"));
  assert.ok(frontendSource.includes("const BANKROLL_ACTUAL_KEY='tvs-bankroll-actual-v1'"));
  assert.ok(frontendSource.includes("TVSBankroll.recommendPortfolio"));
  assert.ok(frontendSource.includes("TVSBankroll.reconcilePortfolioPlan"));
  assert.ok(frontendSource.includes("data-plan-stake"));
  assert.ok(frontendSource.includes("data-plan-odds"));
  assert.ok(frontendSource.includes("bet.plannedStake"));
  assert.ok(frontendSource.includes("actualOdds"));
  assert.ok(frontendSource.includes("stakeMultiplier"));
  assert.match(frontendSource, /freshnessStakeMultiplier\(freshness\.level\)/);
  assert.ok(frontendSource.includes("TVSBankroll.settleBet"));
  assert.ok(frontendSource.includes("TVSBankroll.settleVerifiedResults"));
  assert.ok(frontendSource.includes("reconcileBankrollWithArchive"));
  assert.ok(frontendSource.includes("TVSBankroll.serializeBackup"));
  assert.ok(frontendSource.includes("bankExportCsv"));
  assert.ok(frontendSource.includes("bankDailyStaked"));
  assert.ok(frontendSource.includes('id="bankInitialBankroll"'));
  assert.ok(frontendSource.includes("summary.initialBankroll"));
  assert.ok(frontendSource.includes("bankDeposits"));
  assert.ok(frontendSource.includes("bankWithdrawals"));
  assert.ok(frontendSource.includes("tennis-value-bankroll-ledger.csv"));
  assert.ok(frontendSource.includes("'stake','profit','outcome','source','betId','matchId','side','resultVersion','plannedStake','plannedOdds','actualStake','actualOdds','note','betSnapshot'"));
  assert.ok(frontendSource.includes("JSON.stringify(value)"));
  assert.ok(frontendSource.includes("if(typeof value==='string'&&/^\\s*[=+@-]/.test(cell))"));
  assert.match(frontendSource, /typeof value==='string'.*test\(cell\)/);
  assert.ok(frontendSource.includes("Деньги букмекеру не отправляются."));
  assert.ok(frontendSource.includes('<script src="./bankroll.js"></script>'));
});


test("portfolio proposals do not debit bankroll until the user confirms manual bookmaker placement", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const initial = api.createInitialState(100);
  const portfolio = api.recommendPortfolio(initial, [{
    matchKey: "match:101", matchId: 101, match: "ATP · Player A — Player B",
    player: "Player A", opponent: "Player B", side: "A", bookmaker: "Winamax",
    probability: 0.62, odds: 2.1, freshnessLevel: "good"
  }]);
  assert.equal(portfolio.suggestions.length, 1);
  const planned = api.savePortfolioPlan(initial, portfolio.suggestions);
  assert.equal(planned.balance, 100);
  assert.equal(planned.openBets.length, 0);
  assert.equal(planned.pendingPlan.suggestions.length, 1);
  const confirmed = api.confirmPortfolioPlan(planned, planned.pendingPlan.id);
  assert.equal(confirmed.state.pendingPlan, null);
  assert.equal(confirmed.state.openBets.length, 1);
  assert.ok(confirmed.state.balance < 100);
  assert.equal(confirmed.bets[0].matchId, 101);
  assert.throws(() => api.confirmPortfolioPlan(planned, "wrong-plan"), /не найден/);
  const secondPortfolio = api.recommendPortfolio(initial, [{
    matchKey: "match:202", match: "WTA · Player C — Player D",
    player: "Player C", opponent: "Player D", probability: 0.6,
    odds: 2.0, freshnessLevel: "medium", stakeMultiplier: 0.5
  }]);
  const secondPlan = api.savePortfolioPlan(initial, secondPortfolio.suggestions);
  const cancelled = api.cancelPortfolioPlan(secondPlan, secondPlan.pendingPlan.id);
  assert.equal(cancelled.pendingPlan, null);
  assert.equal(cancelled.balance, 100);
  assert.equal(cancelled.openBets.length, 0);
  assert.equal(cancelled.transactions.length, initial.transactions.length);
});

test("open exposure concentration groups bookmaker and overlapping player risk without changing the ledger", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(100);
  state = api.placeBet(state, {
    matchKey: "cluster-1", match: "Player A — Player B", player: "Player A", opponent: "Player B",
    bookmaker: "Winamax", probability: 0.62, odds: 2.1, stake: 2
  }).state;
  state = api.placeBet(state, {
    matchKey: "cluster-2", match: "Player A — Player C", player: "Player A", opponent: "Player C",
    bookmaker: "Betclic", probability: 0.62, odds: 2.1, stake: 2
  }).state;
  const before = JSON.stringify(state);
  const exposure = api.getExposureConcentration(state);
  assert.equal(exposure.totalOpenStake, 4);
  assert.equal(exposure.byBookmaker.length, 2);
  assert.equal(exposure.byPlayer[0].name, "Player A");
  assert.equal(exposure.byPlayer[0].stake, 4);
  assert.equal(exposure.byPlayer[0].sharePercent, 100);
  assert.equal(exposure.byPlayer[0].highConcentration, true);
  assert.match(exposure.note, /пересекается/);
  assert.equal(JSON.stringify(state), before);
});

test("portfolio manager blocks the same match across different keys, labels and IDs", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const initial = api.createInitialState(100);
  const candidates = [
    { matchKey: "provider:event:501", matchId: 501, side: "A", match: "Player A — Player B", probability: 0.62, odds: 2.1 },
    { matchKey: "different-key:501", matchId: 501, side: "A", match: "A different display label", probability: 0.64, odds: 2.2 },
    { matchKey: "provider:event:502", matchId: 502, side: "A", match: "Player C — Player D", probability: 0.62, odds: 2.1 },
    { matchKey: "alternate-key:502", matchId: 999, side: "A", match: "Player C — Player D", probability: 0.63, odds: 2.15 }
  ];
  const portfolio = api.recommendPortfolio(initial, candidates);
  assert.equal(portfolio.suggestions.length, 2);
  assert.equal(portfolio.suggestions.map(item => item.matchId).join(","), "501,999");
  const first = api.placeBet(initial, {
    matchKey: "open:601", matchId: 601, side: "A", match: "Player E — Player F",
    probability: 0.62, odds: 2.1, stake: 2
  });
  const againstOpen = api.recommendPortfolio(first.state, [{
    matchKey: "another-key:601", matchId: 601, side: "A", match: "Other label",
    probability: 0.62, odds: 2.1
  }]);
  assert.equal(againstOpen.suggestions.length, 0);
  assert.throws(() => api.savePortfolioPlan(initial, [
    { matchKey: "plan:key:701", matchId: 701, match: "Player G — Player H", probability: 0.62, odds: 2.1, stake: 1 },
    { matchKey: "plan:key:702", matchId: 702, match: "Player G — Player H", probability: 0.62, odds: 2.1, stake: 1 }
  ]), /повторную ставку/);
});

test("expired portfolio plans are cleared automatically and cannot block the next plan", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const initial = api.createInitialState(100);
  const suggestions = api.recommendPortfolio(initial, [{
    matchKey: "match:expiry-1", match: "ATP · Expiry A — Expiry B",
    probability: 0.62, odds: 2.1
  }]).suggestions;
  const planned = api.savePortfolioPlan(initial, suggestions);
  const expiredAt = Date.parse(planned.pendingPlan.expiresAt) + 1;
  const expired = api.expirePortfolioPlan(planned, expiredAt);
  assert.equal(expired.expired, true);
  assert.equal(expired.state.pendingPlan, null);
  assert.equal(expired.state.balance, 100);
  assert.equal(expired.state.openBets.length, 0);
  const stalePlan = JSON.parse(JSON.stringify(planned));
  stalePlan.pendingPlan.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.throws(() => api.reconcilePortfolioPlan(stalePlan, stalePlan.pendingPlan.id, stalePlan.pendingPlan.suggestions.map(item => ({ matchKey: item.matchKey, stake: item.stake, odds: item.odds }))), /устарел/);
  const nextPlan = api.savePortfolioPlan(expired.state, suggestions);
  assert.ok(nextPlan.pendingPlan);
  assert.notEqual(nextPlan.pendingPlan.id, planned.pendingPlan.id);
});
test("bankroll UI keeps virtual and actual financial storage isolated", () => {
  const modeBlock = frontendSource.slice(frontendSource.indexOf("const BANKROLL_VIRTUAL_KEY"), frontendSource.indexOf("function renderBankroll()"));
  assert.match(modeBlock, /tvs-bankroll-v1/);
  assert.match(modeBlock, /tvs-bankroll-actual-v1/);
  assert.match(modeBlock, /BANKROLL_MODE_KEY/);
  assert.match(modeBlock, /bankrollStorageKey/);
  assert.match(modeBlock, /if\(!raw&&bankrollMode==='actual'\)/);
});

test("bankroll drawdown tracks betting losses and ignores external deposits", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(100);
  const first = api.placeBet(state, { matchKey: "drawdown-1", match: "Drawdown loss", probability: 0.62, odds: 2.1, stake: 2 });
  state = api.settleBet(first.state, first.bet.id, "lost");
  state = api.addDeposit(state, 50, "Внешнее пополнение");
  let summary = api.getSummary(state);
  assert.equal(summary.currentDrawdown, 2);
  assert.equal(summary.currentDrawdownPercent, 2);
  assert.equal(summary.maxDrawdown, 2);
  assert.equal(summary.maxDrawdownPercent, 2);
  const second = api.placeBet(state, { matchKey: "drawdown-2", match: "Drawdown recovery", probability: 0.62, odds: 2.1, stake: 2 });
  state = api.settleBet(second.state, second.bet.id, "won");
  summary = api.getSummary(state);
  assert.equal(summary.currentDrawdown, 0);
  assert.equal(summary.maxDrawdown, 2);
});
test("PWA app shell precaches the bankroll module and invalidates the previous cache", () => {
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
  assert.match(serviceWorkerSource, /"\.\/pfe\.js"/);
  assert.match(serviceWorkerSource, /"\.\/bankroll\.js"/);
  assert.match(serviceWorkerSource, /self\.skipWaiting\(\)/);
});


test("minimum odds setting reflects the scanner's hard 1.90 eligibility floor", () => {
  assert.match(frontendSource, /id="minOdds" type="number" min="1\.90" max="100" step="0\.05" value="1\.90"/);
  assert.match(frontendSource, /Math\.max\(1\.9,Number\(\$\('#minOdds'\)\.value\|\|1\.5\)\)/);
  assert.match(frontendSource, /minOdds<1\.9/);
  assert.match(frontendSource, /maxOdds>100/);
});


test("prediction scanner reuses all fresh cached candidates and caps only uncached API lookups", () => {
  assert.match(frontendSource, /const allCandidates=matches\.map/);
  assert.match(frontendSource, /const cachedCandidates=\[\],uncachedCandidates=\[\]/);
  assert.match(frontendSource, /const candidates=\[\.\.\.cachedCandidates,\.\.\.uncachedCandidates\.slice\(0,3\)\]/);
  assert.match(frontendSource, /const totalCandidates=allCandidates\.length/);
  assert.match(frontendSource, /renderBestBet\(dayBets,checked,totalCandidates,failed\)/);
});


test("Winamax CSV parser normalizes French amounts and avoids duplicate imports", () => {
  const sandbox = {};
  vm.runInNewContext(readFileSync(new URL("../winamax-import.js", import.meta.url), "utf8") + "\nglobalThis.importApi = TVSWinamaxImport;", sandbox);
  const api = sandbox.importApi;
  const parsed = api.parseWinamaxCsv('Référence;Date;Match;Mise;Cote;Gain;Résultat\nW-100;2026-11-17;Player A - Player B;2,50;2,10;5,25;Gagné\nW-101;2026-11-17;Player C - Player D;1,00;1,90;0,00;Perdu');
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].stake, 2.5);
  assert.equal(parsed.records[0].odds, 2.1);
  assert.equal(parsed.records[0].profit, 2.75);
  assert.equal(parsed.records[0].outcome, "won");
  assert.equal(parsed.records[0].bookmaker, "Winamax");
  assert.ok(parsed.records[0].externalKey.startsWith("winamax:"));
  assert.equal(parsed.records[1].outcome, "lost");
  const merged = api.mergeImportedHistory([], parsed.records);
  assert.equal(merged.added, 2);
  const repeated = api.mergeImportedHistory(merged.rows, parsed.records);
  assert.equal(repeated.added, 0);
  assert.equal(repeated.duplicates, 2);
  const summary = api.summarize(merged.rows);
  assert.equal(summary.settledBets, 2);
  assert.equal(summary.totalStaked, 3.5);
  assert.equal(summary.profit, 1.75);
  const byBookmaker = api.summarizeByBookmaker(merged.rows);
  assert.equal(byBookmaker.Winamax.settledBets, 2);
  assert.equal(byBookmaker.Winamax.profit, 1.75);
});

test("Winamax importer is isolated from the financial ledger and validates preview before import", () => {
  assert.ok(frontendSource.includes("const WINAMAX_HISTORY_KEY='tvs-winamax-history-v1'"));
  assert.ok(frontendSource.includes('TVSWinamaxImport.parseWinamaxCsv'));
  assert.ok(frontendSource.includes('TVSWinamaxImport.mergeImportedHistory'));
  assert.ok(frontendSource.includes('Le solde du bankroll ne sera pas modifié.'));
  assert.ok(frontendSource.includes('id="bankWinamaxFile"'));
  assert.ok(frontendSource.includes('id="bankWinamaxImport"'));
  assert.ok(frontendSource.includes('<script src="./winamax-import.js"></script>'));
  assert.ok(frontendSource.includes('renderWinamaxHistory();'));
  assert.ok(frontendSource.includes('class="bookmaker-tag"'));
  assert.ok(frontendSource.includes("const ODDS_PROVIDER_REGISTRY=Object.freeze"));
});

test("PWA app shell precaches the Winamax import module and advances cache version", () => {
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
  assert.ok(serviceWorkerSource.includes('"./winamax-import.js"'));
  assert.ok(serviceWorkerSource.includes('"./bankroll.js"'));
});


test("odds matching supports provider-specific event IDs and keeps the best price per player side", () => {
  assert.match(frontendSource, /const ODDS_PROVIDER_REGISTRY=Object\.freeze/);
  assert.match(frontendSource, /Event IDs are bookmaker-specific: never require two providers to share one/);
  assert.match(frontendSource, /const bestQuoteForSide=side=>matched\.filter/);
  assert.match(frontendSource, /data-bookmaker-a=/);
  assert.match(frontendSource, /bookmaker:el\.dataset\.bookmakerA/);
  assert.match(frontendSource, /escapeHtml\(best\.bookmaker\|\|'Winamax'\)/);
});

test("PWA app shell advances cache after multi-bookmaker quote selection changes", () => {
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
  assert.ok(serviceWorkerSource.includes('"./winamax-import.js"'));
  assert.ok(serviceWorkerSource.includes('"./bankroll.js"'));
});


test("bankroll preserves bookmaker attribution from placement through settlement", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(100);
  const placed = api.placeBet(state, {
    matchKey: "bookmaker-audit-1", match: "Player A — Player B",
    player: "Player A", opponent: "Player B", bookmaker: "Betclic",
    probability: 0.62, odds: 2.1, stake: 2
  });
  state = placed.state;
  assert.equal(placed.bet.bookmaker, "Betclic");
  assert.equal(state.transactions.at(-1).bookmaker, "Betclic");
  state = api.settleBet(state, placed.bet.id, "won");
  assert.equal(state.transactions.at(-1).bookmaker, "Betclic");
  assert.equal(state.transactions.at(-1).betSnapshot.bookmaker, "Betclic");
});


test("bankroll reports independent settled ROI and open exposure per bookmaker", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(100);
  const betclic = api.placeBet(state, { matchKey: "provider-stats-a", match: "A — B", bookmaker: "Betclic", probability: 0.62, odds: 2.1, stake: 2 });
  state = api.settleBet(betclic.state, betclic.bet.id, "won");
  const winamax = api.placeBet(state, { matchKey: "provider-stats-b", match: "C — D", bookmaker: "Winamax", probability: 0.62, odds: 2.1, stake: 2 });
  state = api.settleBet(winamax.state, winamax.bet.id, "lost");
  const unknown = api.placeBet(state, { matchKey: "provider-stats-c", match: "E — F", probability: 0.62, odds: 2.1, stake: 1 });
  state = api.settleBet(unknown.state, unknown.bet.id, "void");
  delete state.transactions.at(-1).bookmaker;
  delete state.transactions.at(-1).betSnapshot.bookmaker;
  const open = api.placeBet(state, { matchKey: "provider-stats-d", match: "G — H", bookmaker: "Betclic", probability: 0.62, odds: 2.1, stake: 1 });
  state = open.state;
  const stats = api.getBookmakerSummary(state);
  const byName = Object.fromEntries(stats.map(row => [row.bookmaker, row]));
  assert.equal(byName.Betclic.wins, 1);
  assert.equal(byName.Betclic.openBets, 1);
  assert.equal(byName.Betclic.openStake, 1);
  assert.equal(byName.Betclic.profit, 2.2);
  assert.equal(byName.Betclic.roiPercent, 110);
  assert.equal(byName.Winamax.losses, 1);
  assert.equal(byName.Winamax.profit, -2);
  assert.equal(byName.Winamax.roiPercent, -100);
  assert.equal(byName["Не указан"].voids, 1);
  assert.equal(byName["Не указан"].totalStaked, 0);
  assert.equal(byName["Не указан"].voidedStake, 1);
  assert.equal(byName["Не указан"].roiPercent, null);
});

test("bankroll UI displays per-bookmaker ledger results without merging imported history", () => {
  assert.match(frontendSource, /id="bankBookmakerStats"/);
  assert.match(frontendSource, /TVSBankroll\.getBookmakerSummary\(state\)/);
  assert.match(frontendSource, /Результаты по букмекерам/);
  assert.match(frontendSource, /фактический журнал/);
});


test("prediction archive records bookmaker identity and keeps odds histories separate", () => {
  const { readPredictionArchive, savePredictionSnapshot, archiveOddsMovement, mergePredictionArchive } = makeArchiveStore();
  const match = { id: 987, tournament_name: "ATP Test" };
  const element = { dataset: {
    nameA: "Player A", nameB: "Player B", playerA: "1", playerB: "2",
    oddsA: "2.10", oddsB: "1.80", bookmakerA: "Winamax", bookmakerB: "Betclic"
  }};
  savePredictionSnapshot(match, element, { probabilityA: 55, probabilityB: 45, ratingA: 1800, ratingB: 1750 });
  const rows = readPredictionArchive();
  assert.equal(rows.find(row => row.side === "A").bookmaker, "Winamax");
  assert.equal(rows.find(row => row.side === "B").bookmaker, "Betclic");
  const imported = mergePredictionArchive([], rows).rows;
  assert.equal(imported.find(row => row.side === "B").bookmaker, "Betclic");
  const movement = archiveOddsMovement([
    { matchId: 987, side: "A", bookmaker: "Winamax", odds: 2.1, capturedAt: 100 },
    { matchId: 987, side: "A", bookmaker: "Winamax", odds: 1.9, capturedAt: 200 },
    { matchId: 987, side: "A", bookmaker: "Betclic", odds: 2.3, capturedAt: 100 },
    { matchId: 987, side: "A", bookmaker: "Betclic", odds: 2.4, capturedAt: 200 }
  ]);
  assert.equal(movement.comparable, 2);
  assert.equal(movement.shortened, 1);
  assert.equal(movement.drifted, 1);
  assert.match(frontendSource, /String\(row\.bookmaker\|\|''\)/);
});


test("archive odds movement exposes provider-level comparison counts", () => {
  const { archiveOddsMovement } = makeArchiveStore();
  const movement = archiveOddsMovement([
    { matchId: 91, side: "A", bookmaker: "Winamax", odds: 2.2, capturedAt: 100 },
    { matchId: 91, side: "A", bookmaker: "Winamax", odds: 2.0, capturedAt: 200 },
    { matchId: 91, side: "A", bookmaker: "Betclic", odds: 2.4, capturedAt: 100 },
    { matchId: 91, side: "A", bookmaker: "Betclic", odds: 2.5, capturedAt: 200 }
  ]);
  assert.equal(movement.byBookmaker.Winamax.shortened, 1);
  assert.equal(movement.byBookmaker.Betclic.drifted, 1);
  assert.match(frontendSource, /archiveOddsByBookmaker/);
});


test("CLV uses the latest same-bookmaker pre-match quote and never substitutes another provider", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const placed = api.placeBet(api.createInitialState(100), {
    matchKey: "clv-match-1", matchId: 501, side: "A", matchDate: "2026-11-20T18:00:00.000Z",
    match: "Player A — Player B", player: "Player A", opponent: "Player B",
    bookmaker: "Winamax", probability: 0.62, odds: 2.1, stake: 2
  });
  const placedAt = Date.parse(placed.bet.placedAt);
  const archive = [
    { matchId: 501, side: "A", bookmaker: "Betclic", odds: 1.7, capturedAt: placedAt + 60000 },
    { matchId: 501, side: "A", bookmaker: "Winamax", odds: 1.95, capturedAt: placedAt + 120000 },
    { matchId: 501, side: "A", bookmaker: "Winamax", odds: 1.9, capturedAt: Date.parse("2026-11-20T17:30:00.000Z") },
    { matchId: 501, side: "A", bookmaker: "Winamax", odds: 1.5, capturedAt: Date.parse("2026-11-20T18:01:00.000Z") }
  ];
  const summary = api.getClvSummary(placed.state, archive);
  assert.equal(summary.sampleSize, 1);
  assert.equal(summary.missingCount, 0);
  assert.equal(summary.matched[0].closingOdds, 1.9);
  assert.equal(summary.averageClvPercent, 10.53);
  assert.equal(summary.positive, 1);
});

test("CLV excludes live/post-start snapshots and treats same-time conflicting prices as ambiguous", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const placed = api.placeBet(api.createInitialState(100), {
    matchKey: "clv-live-guard", matchId: 503, side: "A", matchDate: "2026-11-20T18:00:00.000Z",
    match: "Player E — Player F", bookmaker: "Winamax", probability: 0.6, odds: 2.2, stake: 2
  });
  const placedAt = Date.parse(placed.bet.placedAt);
  const start = Date.parse("2026-11-20T18:00:00.000Z");
  const liveOnly = api.getClvSummary(placed.state, [
    {matchId:503,side:"A",bookmaker:"Winamax",odds:1.8,capturedAt:start-60000,captureStatus:"live"},
    {matchId:503,side:"A",bookmaker:"Winamax",odds:1.7,capturedAt:start,captureStatus:"upcoming"}
  ]);
  assert.equal(liveOnly.sampleSize,0);
  assert.equal(liveOnly.missingCount,1);
  const conflicting = api.getClvSummary(placed.state, [
    {matchId:503,side:"A",bookmaker:"Winamax",odds:1.9,capturedAt:start-60000,captureStatus:"upcoming"},
    {matchId:503,side:"A",bookmaker:"Winamax",odds:1.8,capturedAt:start-60000,captureStatus:"upcoming"}
  ]);
  assert.equal(conflicting.sampleSize,0);
  assert.equal(conflicting.missingCount,1);
  assert.match(conflicting.missing[0].reason,/Конфликтующие котировки/);
});

test("CLV bookmaker matching is case-insensitive but remains provider-specific", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const placed = api.placeBet(api.createInitialState(100), {
    matchKey:"clv-case",matchId:504,side:"B",matchDate:"2026-11-20T18:00:00.000Z",
    match:"Player G — Player H",bookmaker:"Winamax",probability:0.55,odds:2.1,stake:2
  });
  const placedAt=Date.parse(placed.bet.placedAt);
  const summary=api.getClvSummary(placed.state,[
    {matchId:504,side:"B",bookmaker:"winamax",odds:1.9,capturedAt:Date.parse("2026-11-20T17:59:00.000Z"),captureStatus:"upcoming"},
    {matchId:504,side:"B",bookmaker:"Betclic",odds:1.5,capturedAt:Date.parse("2026-11-20T17:58:00.000Z"),captureStatus:"upcoming"}
  ]);
  assert.equal(summary.sampleSize,1);
  assert.equal(summary.matched[0].closingOdds,1.9);
});

test("CLV reports missing data instead of inventing zero and requires match timing", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const placed = api.placeBet(api.createInitialState(100), {
    matchKey: "clv-match-no-close", matchId: 502, side: "B",
    match: "Player C — Player D", bookmaker: "Winamax",
    probability: 0.62, odds: 2.1, stake: 2
  });
  const summary = api.getClvSummary(placed.state, []);
  assert.equal(summary.sampleSize, 0);
  assert.equal(summary.missingCount, 1);
  assert.equal(summary.averageClvPercent, null);
  assert.equal(summary.coveragePercent, 0);
});

test("CLV is surfaced in bankroll UI and the PWA cache is versioned", () => {
  assert.ok(frontendSource.includes('id="bankClvStats"'));
  assert.ok(frontendSource.includes("TVSBankroll.getClvSummary(state,readPredictionArchive())"));
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
});


test("player rating audit distinguishes fresh, recent, stale, unknown and invalid dates", () => {
  const start = workerSource.indexOf("function extractRatingAsOf(");
  const end = workerSource.indexOf("function normalizeSurface(", start);
  assert.ok(start >= 0 && end > start);
  const auditSource = workerSource.slice(start, end) +
    "\nglobalThis.ratingAudit = { extractRatingAsOf, assessRatingFreshness };";
  const sandbox = {};
  vm.runInNewContext(auditSource, sandbox);
  const api = sandbox.ratingAudit;
  const now = Date.parse("2026-11-18T12:00:00.000Z");
  assert.equal(api.extractRatingAsOf({ stats: { ratings_as_of: "2026-11-17" } }), "2026-11-17");
  assert.equal(api.extractRatingAsOf({ ratingsAsOf: "2026-11-17T08:30:00Z" }), "2026-11-17");
  assert.equal(api.extractRatingAsOf({ stats: { elo_updated_at: 1795000000 } }), new Date(1795000000 * 1000).toISOString().slice(0, 10));
  assert.equal(api.extractRatingAsOf({ ratings_as_of: "2026-02-31" }), null);
  assert.equal(api.extractRatingAsOf({ ratings_as_of: "not-a-date" }), null);
  assert.equal(api.extractRatingAsOf({}), null);
  assert.deepEqual(JSON.parse(JSON.stringify(api.assessRatingFreshness("2026-11-17", now))), { status: "fresh", ageDays: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(api.assessRatingFreshness("2026-11-01", now))), { status: "recent", ageDays: 17 });
  assert.deepEqual(JSON.parse(JSON.stringify(api.assessRatingFreshness("2026-10-01", now))), { status: "stale", ageDays: 48 });
  assert.deepEqual(JSON.parse(JSON.stringify(api.assessRatingFreshness(null, now))), { status: "unknown", ageDays: null });
  assert.deepEqual(JSON.parse(JSON.stringify(api.assessRatingFreshness("2026-11-19", now))), { status: "invalid", ageDays: null });
});

test("prediction UI displays each player's rating freshness separately", () => {
  assert.match(frontendSource, /ratingFreshnessA/);
  assert.match(frontendSource, /ratingFreshnessB/);
  assert.match(frontendSource, /дата неизвестна/);
  assert.match(frontendSource, /устаревший/);
});


test("Elo plausibility audit flags unusual ratings without rejecting them", () => {
  const start = workerSource.indexOf("function assessRatingPlausibility(");
  const end = workerSource.indexOf("function normalizeSurface(", start);
  assert.ok(start >= 0 && end > start);
  const source = workerSource.slice(start, end) +
    "\nglobalThis.ratingQuality = assessRatingPlausibility;";
  const sandbox = {};
  vm.runInNewContext(source, sandbox);
  const check = sandbox.ratingQuality;
  assert.equal(check(1800).status, "plausible");
  assert.equal(check(800).status, "plausible");
  assert.equal(check(3200).status, "plausible");
  assert.equal(check(799).status, "review");
  assert.equal(check(3201).status, "review");
  assert.equal(check(5001).status, "invalid");
  assert.equal(check(NaN).status, "invalid");
  assert.match(check(600).reason, /провер/);
});

test("prediction UI warns about unusual Elo without suppressing the calculation", () => {
  assert.match(workerSource, /ratingQualityGap/);
  assert.match(frontendSource, /Проверка Elo/);
  assert.match(frontendSource, /Значения не исключены автоматически/);
});

test("prediction reliability is transparent, excludes unavailable calibration and never claims win probability", () => {
  const start = frontendSource.indexOf("function assessPredictionReliability(");
  const end = frontendSource.indexOf("function freshnessStakeMultiplier(", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.assess = assessPredictionReliability;", sandbox);
  const assess = sandbox.assess;
  const base = {
    freshness: { level: "good", details: "fresh" },
    ratingQualityA: { status: "plausible" }, ratingQualityB: { status: "plausible" },
    ratingQualityGap: "normal", oddsKnown: true, matchDateKnown: true,
    bookmakerKnown: true, probabilitiesValid: true, calibration: { sampleSize: 12, brierScore: 0.14 }
  };
  const preliminary = assess(base);
  assert.equal(preliminary.score, 80);
  assert.equal(preliminary.maxScore, 80);
  assert.equal(preliminary.calibrationIncluded, false);
  assert.ok(preliminary.reasons.some(reason => reason.includes("не менее 30")));
  const calibrated = assess({ ...base, calibration: { sampleSize: 40, brierScore: 0.17 } });
  assert.equal(calibrated.score, 100);
  assert.equal(calibrated.maxScore, 100);
  assert.equal(calibrated.calibrationIncluded, true);
  assert.equal(calibrated.tier, "высокая");
  const weak = assess({
    ...base, freshness: { level: "limited", details: "stale" },
    ratingQualityA: { status: "review" }, ratingQualityB: { status: "invalid" },
    ratingQualityGap: "review", oddsKnown: false, matchDateKnown: false,
    bookmakerKnown: false, probabilitiesValid: false,
    calibration: { sampleSize: 35, brierScore: 0.31 }
  });
  assert.equal(weak.score, 13);
  assert.equal(weak.maxScore, 100);
  assert.equal(weak.tier, "ограниченная");
  assert.ok(weak.reasons.length >= 4);
  assert.match(frontendSource, /не вероятность победы и не рекомендация по размеру ставки/);
});

test("archive segment calibration groups only known surfaces and tournament categories", () => {
  const start = frontendSource.indexOf("function archiveSegmentCalibration(");
  const end = frontendSource.indexOf("\n  function ", start + 10);
  assert.ok(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.segment = archiveSegmentCalibration;", sandbox);
  const rows = [
    { matchKey: "m1", surface: "Clay", tour: "atp" },
    { matchKey: "m2", surface: "Грунт", tour: "atp" },
    { matchKey: "m3", surface: "Hard court", tour: "wta" },
    { matchKey: "m4", surface: "Grass", tour: "challenger" },
    { matchKey: "m5", surface: "", tour: "unknown" },
    { matchKey: "m6", surface: "Unknown", tour: "" }
  ];
  const result = sandbox.segment(rows, segmentRows => ({
    sampleSize: new Set(segmentRows.map(row => row.matchKey)).size,
    brierScore: 0.2, logLoss: 0.6, preliminary: true, excluded: 0, ambiguous: 0
  }));
  const surfaces = result.find(group => group.key === "surface").items;
  const tours = result.find(group => group.key === "tour").items;
  assert.deepEqual(Array.from(surfaces, item => [item.name, item.sampleSize]), [["Грунт", 2], ["Трава", 1], ["Хард", 1]]);
  assert.deepEqual(Array.from(tours, item => [item.name, item.sampleSize]), [["ATP", 2], ["Challenger", 1], ["WTA", 1]]);
  assert.ok(result.every(group => group.items.every(item => item.preliminary)));
  assert.match(frontendSource, /archiveSegmentCalibration\(rows\)/);
  assert.match(frontendSource, /id="archiveSegmentCalibration"/);
});



test("segment performance uses settled ledger only, separates bookmaker, excludes void/open and enriches only exact archive identity", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(1000);
  const addAndSettle = (input, details, outcome) => {
    const placed = api.placeBet(input, {
      matchKey: details.matchKey, matchId: details.matchId, side: details.side || "A",
      match: details.match || details.matchKey, player: details.player || "Player A",
      opponent: details.opponent || "Player B", bookmaker: details.bookmaker,
      surface: details.surface, tour: details.tour,
      probability: 0.7, odds: 2.1, stake: 2
    });
    return api.settleBet(placed.state, placed.bet.id, outcome);
  };
  state = addAndSettle(state, {
    matchKey: "segment-clay-win", matchId: 7001, player: "Player A", opponent: "Player B",
    bookmaker: "Betclic", surface: "Clay", tour: "atp"
  }, "won");
  state = addAndSettle(state, {
    matchKey: "segment-grass-loss", matchId: 7002, player: "Player C", opponent: "Player D",
    bookmaker: "Winamax", surface: "Grass", tour: "wta"
  }, "lost");
  state = addAndSettle(state, {
    matchKey: "segment-void", matchId: 7003, player: "Player E", opponent: "Player F",
    bookmaker: "Betclic", surface: "Clay", tour: "atp"
  }, "void");
  state = addAndSettle(state, {
    matchKey: "segment-enrich", matchId: 7004, player: "José Nadal", opponent: "Test Player",
    bookmaker: "Winamax"
  }, "won");
  const open = api.placeBet(state, {
    matchKey: "segment-open", matchId: 7005, side: "A", player: "Open Player",
    opponent: "Other Player", bookmaker: "Betclic", surface: "Clay", tour: "atp",
    probability: 0.7, odds: 2.1, stake: 2
  });
  state = open.state;
  const archive = [{
    matchId: 7004, side: "A", player: "Jose Nadal", opponent: "Test Player",
    surface: "Clay", tour: "atp"
  }];
  const result = api.getSegmentPerformance(state, archive);
  const clay = result.surface.find(row => row.name === "Грунт");
  const grass = result.surface.find(row => row.name === "Трава");
  const unknownSurface = result.surface.find(row => row.name === "Неизвестно");
  assert.equal(clay.settledBets, 2);
  assert.equal(clay.wins, 2);
  assert.equal(clay.voids, 1);
  assert.equal(clay.settledStake, 4);
  assert.equal(clay.voidedStake, 2);
  assert.equal(clay.profit, 4.4);
  assert.equal(clay.roiPercent, 110);
  assert.equal(grass.losses, 1);
  assert.equal(grass.roiPercent, -100);
  assert.equal(unknownSurface, undefined);
  const byBookmaker = Object.fromEntries(result.bookmaker.map(row => [row.name, row]));
  assert.equal(byBookmaker.Betclic.settledBets, 1);
  assert.equal(byBookmaker.Betclic.voids, 1);
  assert.equal(byBookmaker.Betclic.roiPercent, 110);
  assert.equal(byBookmaker.Winamax.settledBets, 2);
  assert.equal(byBookmaker.Winamax.roiPercent, 5);
  assert.equal(result.tour.find(row => row.name === "ATP").settledBets, 2);
  assert.equal(result.tour.find(row => row.name === "WTA").settledBets, 1);
  assert.ok(result.surface.every(row => row.preliminary));
});

test("segment performance keeps unknown metadata visible and excludes invalid or zero-stake settlements", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(100);
  const placed = api.placeBet(state, {
    matchKey: "segment-zero", match: "Unknown match", bookmaker: "",
    probability: 0.7, odds: 2.1, stake: 2
  });
  state = api.settleBet(placed.state, placed.bet.id, "won");
  state.transactions.at(-1).stake = 0;
  delete state.transactions.at(-1).bookmaker;
  delete state.transactions.at(-1).betSnapshot.bookmaker;
  const result = api.getSegmentPerformance(state, []);
  const surfaceUnknown = result.surface.find(row => row.name === "Неизвестно");
  const bookmakerUnknown = result.bookmaker.find(row => row.name === "Неизвестно");
  assert.equal(surfaceUnknown.settledBets, 0);
  assert.equal(surfaceUnknown.excluded, 1);
  assert.equal(surfaceUnknown.roiPercent, null);
  assert.equal(bookmakerUnknown.excluded, 1);
  assert.equal(bookmakerUnknown.settledStake, 0);
});

test("segment performance UI uses the selected ledger and cache version advances", () => {
  assert.ok(frontendSource.includes("TVSBankroll.getSegmentPerformance(state,readPredictionArchive())"));
  assert.ok(frontendSource.includes('id="bankSegmentPerformance"'));
  assert.match(frontendSource, /Доходность по сегментам/);
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
});



test("segment ROI follows the latest verified result revision without double-counting superseded settlements", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const placed = api.placeBet(api.createInitialState(100), {
    matchKey: "segment-revision", matchId: 8801, side: "A",
    match: "Player A — Player B", player: "Player A", opponent: "Player B",
    bookmaker: "Winamax", surface: "Hard", tour: "atp",
    probability: 0.7, odds: 2.1, stake: 2
  });
  const first = [{ matchId: 8801, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }];
  const settled = api.settleVerifiedResults(placed.state, first).state;
  const revised = [{ matchId: 8801, resultOutcome: "completed", resultWinner: 2, resultVersion: 2 }];
  const corrected = api.settleVerifiedResults(settled, revised).state;
  const performance = api.getSegmentPerformance(corrected, []);
  const hard = performance.surface.find(row => row.name === "Хард");
  assert.equal(hard.settledBets, 1);
  assert.equal(hard.wins, 0);
  assert.equal(hard.losses, 1);
  assert.equal(hard.profit, -2);
  assert.equal(hard.roiPercent, -100);
  assert.equal(performance.bookmaker.find(row => row.name === "Winamax").settledBets, 1);
});


test("segment performance groups settled bets by original odds and EV, not settlement prices", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(1000);
  const add = (key, odds, probability, outcome) => {
    const placed = api.placeBet(state, {
      matchKey: key, match: key, player: "A", opponent: "B", bookmaker: "Winamax",
      probability, odds, stake: 2,
      options: { minOdds: 1.01, minEv: -10, maxStakePercent: 100, maxExposurePercent: 100, maxDailyStakePercent: 100 }
    });
    state = api.settleBet(placed.state, placed.bet.id, outcome);
  };
  add("odds-low", 1.7, 0.7, "won");
  add("odds-mid", 2.2, 0.55, "lost");
  add("odds-high", 3.2, 0.7, "lost");
  add("ev-low", 1.6, 0.65, "lost");
  const result = api.getSegmentPerformance(state, []);
  const odds = Object.fromEntries(result.oddsBand.map(row => [row.name, row]));
  assert.equal(odds["1.50–1.79"].settledBets, 2);
  assert.equal(odds["1.50–1.79"].wins, 1);
  assert.equal(odds["2.10–2.49"].losses, 1);
  assert.equal(odds["3.00+"].settledBets, 1);
  const ev = Object.fromEntries(result.evBand.map(row => [row.name, row]));
  assert.equal(ev["15%+"].settledBets, 3);
  assert.equal(ev["0–4.99%"].settledBets, 1);
  assert.equal(ev["10–14.99%"], undefined);
  assert.equal(result.oddsBand.reduce((sum, row) => sum + row.settledBets, 0), 4);
  assert.equal(result.evBand.reduce((sum, row) => sum + row.settledBets, 0), 4);
});

test("odds and EV segmentation keeps missing source values unknown and labels are displayed", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(100);
  const placed = api.placeBet(state, {
    matchKey: "unknown-price", match: "Unknown", probability: 0.7, odds: 2.1, stake: 2,
    options: { minOdds: 1.01, minEv: -10, maxStakePercent: 100, maxExposurePercent: 100, maxDailyStakePercent: 100 }
  });
  state = api.settleBet(placed.state, placed.bet.id, "won");
  const tx = state.transactions.find(item => item.type === "settlement");
  delete tx.betSnapshot.odds;
  delete tx.betSnapshot.ev;
  const result = api.getSegmentPerformance(state, []);
  assert.equal(result.oddsBand.find(row => row.name === "Неизвестно").settledBets, 1);
  assert.equal(result.evBand.find(row => row.name === "Неизвестно").settledBets, 1);
  assert.ok(frontendSource.includes("Коэффициенты при размещении"));
  assert.ok(frontendSource.includes("Ожидаемый EV при размещении"));
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
});


test("segment performance groups settled bets by original model probability", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(1000);
  const add = (key, probability, odds, outcome) => {
    const placed = api.placeBet(state, {
      matchKey: key, match: key, probability, odds, stake: 2,
      options: { minOdds: 1.01, minEv: 0, maxStakePercent: 100, maxExposurePercent: 100, maxDailyStakePercent: 100 }
    });
    state = api.settleBet(placed.state, placed.bet.id, outcome);
  };
  add("prob-52", 0.52, 2.1, "won");
  add("prob-62", 0.62, 2.1, "lost");
  add("prob-72", 0.72, 2.1, "won");
  add("prob-82", 0.82, 2.1, "lost");
  const result = api.getSegmentPerformance(state, []);
  const groups = Object.fromEntries(result.probabilityBand.map(row => [row.name, row]));
  assert.equal(groups["50–54.99%"].wins, 1);
  assert.equal(groups["60–64.99%"].losses, 1);
  assert.equal(groups["70–74.99%"].roiPercent, 110);
  assert.equal(groups["80%+"].roiPercent, -100);
  assert.equal(result.probabilityBand.reduce((sum, row) => sum + row.settledBets, 0), 4);
  assert.ok(frontendSource.includes("Вероятность модели при размещении"));
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
});


test("outcome sequence diagnostics order results, ignore voids and calculate streaks and profit factor", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(1000);
  const add = (key, outcome, at) => {
    const placed = api.placeBet(state, {
      matchKey: key, match: key, probability: 0.7, odds: 2.1, stake: 2,
      options: { minOdds: 1.01, minEv: -10, maxStakePercent: 100, maxExposurePercent: 100, maxDailyStakePercent: 100 }
    });
    state = api.settleBet(placed.state, placed.bet.id, outcome);
    state.transactions.at(-1).at = at;
  };
  add("streak-win-1", "won", "2026-11-18T10:00:00.000Z");
  add("streak-void", "void", "2026-11-18T11:00:00.000Z");
  add("streak-loss-1", "lost", "2026-11-18T12:00:00.000Z");
  add("streak-loss-2", "lost", "2026-11-18T13:00:00.000Z");
  add("streak-win-2", "won", "2026-11-18T14:00:00.000Z");
  const stats = api.getOutcomeSequenceStats(state);
  assert.equal(stats.wins, 2);
  assert.equal(stats.losses, 2);
  assert.equal(stats.voids, 1);
  assert.equal(stats.winRatePercent, 50);
  assert.equal(stats.longestWinStreak, 1);
  assert.equal(stats.longestLossStreak, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(stats.currentStreak)), { type: "won", length: 1 });
  assert.equal(stats.grossProfit, 4.4);
  assert.equal(stats.grossLoss, 4);
  assert.equal(stats.profitFactor, 1.1);
  assert.equal(api.getSummary(state).outcomeSequence.settledBets, 4);
  const unknownState = JSON.parse(JSON.stringify(state));
  unknownState.transactions.find(tx => tx.type === "settlement" && tx.outcome === "void").outcome = "unknown";
  const withUnknown = api.getOutcomeSequenceStats(unknownState);
  assert.equal(withUnknown.voids, 0);
  assert.equal(withUnknown.excluded, 1);
  assert.equal(withUnknown.settledBets, 4);
});

test("outcome sequence diagnostics count only the latest verified settlement after a result revision", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const placed = api.placeBet(api.createInitialState(100), {
    matchKey: "sequence-revision", matchId: 9901, side: "A",
    match: "Player A — Player B", player: "Player A", opponent: "Player B",
    probability: 0.7, odds: 2.1, stake: 2
  });
  const first = api.settleVerifiedResults(placed.state, [
    { matchId: 9901, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ]).state;
  const revised = api.settleVerifiedResults(first, [
    { matchId: 9901, resultOutcome: "completed", resultWinner: 2, resultVersion: 2 }
  ]).state;
  const stats = api.getOutcomeSequenceStats(revised);
  assert.equal(stats.settledBets, 1);
  assert.equal(stats.wins, 0);
  assert.equal(stats.losses, 1);
  assert.equal(stats.longestLossStreak, 1);
});

test("outcome sequence diagnostics are surfaced for the selected bankroll and cache is versioned", () => {
  assert.ok(frontendSource.includes("summary.outcomeSequence"));
  assert.ok(frontendSource.includes('id="bankOutcomeSequenceNote"'));
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
});


test("outcome dispersion diagnostics normalize returns and identify top-win concentration", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  let state = api.createInitialState(1000);
  const add = (key, outcome, odds, stake) => {
    const placed = api.placeBet(state, {
      matchKey: key, match: key, probability: 0.7, odds, stake,
      options: { minOdds: 1.01, minEv: -10, maxStakePercent: 100, maxExposurePercent: 100, maxDailyStakePercent: 100 }
    });
    state = api.settleBet(placed.state, placed.bet.id, outcome);
  };
  add("dispersion-win-a", "won", 2, 10);
  add("dispersion-loss", "lost", 2, 20);
  add("dispersion-win-b", "won", 3, 10);
  add("dispersion-void", "void", 2, 10);
  const stats = api.getOutcomeDispersionStats(state);
  assert.equal(stats.sampleSize, 3);
  assert.equal(stats.voids, 1);
  assert.equal(stats.excluded, 0);
  assert.equal(stats.netProfit, 10);
  assert.equal(stats.meanReturnPercent, 66.67);
  assert.equal(stats.medianReturnPercent, 100);
  assert.equal(stats.largestWin, 20);
  assert.equal(stats.largestLoss, -20);
  assert.equal(stats.topThreeWinSharePercent, 100);
  assert.equal(stats.netProfitWithoutTopThreeWins, -20);
  assert.equal(api.getSummary(state).outcomeDispersion.sampleSize, 3);
});

test("outcome dispersion diagnostics exclude malformed and superseded settlement records", () => {
  const sandbox = {};
  vm.runInNewContext(bankrollSource + "\nglobalThis.bankrollApi = TVSBankroll;", sandbox);
  const api = sandbox.bankrollApi;
  const placed = api.placeBet(api.createInitialState(100), {
    matchKey: "dispersion-revision", matchId: 9911, side: "A",
    match: "Player A — Player B", player: "Player A", opponent: "Player B",
    probability: 0.7, odds: 2, stake: 5,
    options: { minOdds: 1.01, minEv: -10, maxStakePercent: 100, maxExposurePercent: 100, maxDailyStakePercent: 100 }
  });
  const first = api.settleVerifiedResults(placed.state, [
    { matchId: 9911, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ]).state;
  const revised = api.settleVerifiedResults(first, [
    { matchId: 9911, resultOutcome: "completed", resultWinner: 2, resultVersion: 2 }
  ]).state;
  const stats = api.getOutcomeDispersionStats(revised);
  assert.equal(stats.sampleSize, 1);
  assert.equal(stats.netProfit, -5);
  const malformed = JSON.parse(JSON.stringify(revised));
  malformed.transactions.find(tx => tx.type === "settlement").profit = 0;
  const excluded = api.getOutcomeDispersionStats(malformed);
  assert.equal(excluded.sampleSize, 0);
  assert.equal(excluded.excluded, 1);
});

test("outcome dispersion diagnostics are shown in the selected bankroll interface", () => {
  assert.ok(frontendSource.includes("summary.outcomeDispersion"));
  assert.ok(frontendSource.includes('id="bankOutcomeDispersionNote"'));
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
});


test("PFE player stats loader accepts numeric IDs and rejects malformed IDs before fetching", () => {
  const start = frontendSource.indexOf("async function loadPfePlayerStats(");
  const end = frontendSource.indexOf("\n  function explicitMatchBestOf", start);
  assert.ok(start >= 0 && end > start);
  const loader = frontendSource.slice(start, end);
  const match = loader.match(/if\(!\/(.+?)\/\.test\(id\)/);
  assert.ok(match, "player ID validation regex must exist");
  const idPattern = new RegExp(match[1]);
  assert.equal(idPattern.test("123"), true);
  assert.equal(idPattern.test("987654321"), true);
  assert.equal(idPattern.test("abc"), false);
  assert.equal(idPattern.test("12/3"), false);
});

test("PFE stats loader keeps PRO form independent of missing ULTRA data and rejects identity mismatch", async () => {
  const start = frontendSource.indexOf("async function loadPfePlayerStats(");
  const end = frontendSource.indexOf("\n  function explicitMatchBestOf", start);
  assert.ok(start >= 0 && end > start);
  const loader = frontendSource.slice(start, end);
  const runLoader = async (payload, status = 200, retryHeader = "45") => {
    const calls = { recent: 0, serve: 0, requested: "" };
    const sandbox = {
      API: "https://worker.test",
      Date, Number, String, encodeURIComponent, Map,
      pfePlayerStatsCache: new Map(),
      fetch: async url => {
        calls.requested = url;
        return {
          ok: status >= 200 && status < 300, status,
          headers: { get: name => name === "Retry-After" && status === 429 ? retryHeader : null },
          json: async () => payload
        };
      },
      TVSPFE: {
        normalizeRecentFormProfile: (value, options) => {
          calls.recent++;
          return { status: "ready_for_modeling", playerId: value.player.id, requestedId: options.playerId };
        },
        normalizeServeReturnProfile: () => {
          calls.serve++;
          return { status: "unavailable", reason: "serve_return_requires_ultra" };
        }
      }
    };
    vm.runInNewContext(loader + "\nglobalThis.loadStats = loadPfePlayerStats;", sandbox);
    return { result: await sandbox.loadStats(123), calls };
  };
  const partial = await runLoader({ accessStatus: "available", stats: { records: { recent: [] } } });
  assert.equal(partial.result.accessStatus, "available");
  assert.equal(partial.result.recent.status, "ready_for_modeling");
  assert.equal(partial.result.recent.playerId, 123);
  assert.equal(partial.result.serve.status, "unavailable");
  assert.equal(partial.calls.recent, 1);
  assert.equal(partial.calls.serve, 1);
  assert.equal(partial.calls.requested, "https://worker.test/player-stats?id=123");

  const mismatch = await runLoader({ accessStatus: "available", stats: { player: { id: 456 }, records: { recent: [] } } });
  assert.equal(mismatch.result.accessStatus, "player_identity_mismatch");
  assert.equal(mismatch.calls.recent, 0);
  assert.equal(mismatch.calls.serve, 0);

  const forbidden = await runLoader({ accessStatus: "forbidden_or_plan_restricted" }, 403);
  assert.equal(forbidden.result.accessStatus, "forbidden_or_plan_restricted");
  assert.equal(forbidden.calls.recent, 0);
  assert.equal(forbidden.calls.serve, 0);

  const limited = await runLoader({ accessStatus: "rate_limited", error: "Rate limited" }, 429);
  assert.equal(limited.result.accessStatus, "rate_limited");
  assert.equal(limited.result.retryAfterSeconds, 45);
  assert.equal(limited.calls.recent, 0);
  assert.equal(limited.calls.serve, 0);

  const dailyReset = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const daily = await runLoader({
    accessStatus: "rate_limited", error: "Rate limited",
    rateLimit: { errorCode: "rate_limited", scope: "day", resetsAt: dailyReset, retryAtEpoch: null }
  }, 429, "30");
  assert.equal(daily.result.rateLimitScope, "day");
  assert.equal(daily.result.resetsAt, dailyReset);
  assert.ok(daily.result.retryAfterSeconds >= 7199 && daily.result.retryAfterSeconds <= 7200,
    "daily reset must take precedence over the short Retry-After header");

  const abuse = await runLoader({
    accessStatus: "rate_limited", error: "Rate limited",
    rateLimit: { errorCode: "abuse_throttled", scope: null, resetsAt: null, retryAtEpoch: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000) }
  }, 429, "30");
  assert.equal(abuse.result.rateLimitError, "abuse_throttled");
  assert.ok(abuse.result.retryAfterSeconds >= 86399 && abuse.result.retryAfterSeconds <= 86401,
    "abuse retry epoch must take precedence over Retry-After");

  const dateRetry = await runLoader(
    { accessStatus: "rate_limited", error: "Rate limited" },
    429,
    new Date(Date.now() + 60000).toUTCString()
  );
  assert.ok(dateRetry.result.retryAfterSeconds >= 1 && dateRetry.result.retryAfterSeconds <= 60);
});

test("PFE player stats are connected read-only and score simulation is gated by verified inputs and explicit format", () => {
  const start = frontendSource.indexOf("function explicitMatchBestOf(");
  const end = frontendSource.indexOf("\n  async function loadPredictions", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(frontendSource.slice(start, end) + "\nglobalThis.bestOf = explicitMatchBestOf;", sandbox);
  assert.equal(sandbox.bestOf({ best_of: 3 }), 3);
  assert.equal(sandbox.bestOf({ match_format: "Best of 5" }), 5);
  assert.equal(sandbox.bestOf({ format: "BO3" }), 3);
  assert.equal(sandbox.bestOf({ format: "BO5" }), 5);
  assert.equal(sandbox.bestOf({ match_format: "BO3" }), 3);
  assert.equal(sandbox.bestOf({}), null);
  assert.ok(frontendSource.includes("fetch(API+'/player-stats?id='+encodeURIComponent(id))"));
  assert.match(frontendSource, /const cachedTtl=cached\?\.value\?\.accessStatus==='available'\?60\*1000/);
  assert.match(frontendSource, /normalizeRecentFormProfile/);
  assert.match(frontendSource, /normalizeServeReturnProfile/);
  assert.match(frontendSource, /pfeServeInputs\.status==='ready_for_score_simulation'&&matchBestOf/);
  assert.match(frontendSource, /runMatchMonteCarlo/);
  assert.match(frontendSource, /confidenceInterval95A/);
  assert.match(frontendSource, /Доступ Live Tennis API:/);
  assert.match(frontendSource, /Форма PRO:/);
  assert.match(frontendSource, /Подача\/приём ULTRA:/);
  assert.match(frontendSource, /rate_limited:profile\?\.rateLimitScope==='day'\?'дневная квота исчерпана'/);
  assert.ok(frontendSource.includes("player_merged:'ID игрока объединён с другой записью'"));
  assert.match(serviceWorkerSource, /tennis-value-static-v96/);
});

test("PFE groups dependent models before fusion and flags a single-model estimate as provisional", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  const single = pfe.fusePredictions([{ id: "elo", probability: 0.61 }]);
  assert.equal(single.status, "provisional");
  assert.equal(single.probability, 0.61);
  const fused = pfe.fusePredictions([
    { id: "elo", probability: 0.62, dependencyGroup: "results", quality: 1 },
    { id: "form", probability: 0.70, dependencyGroup: "results", quality: 1 },
    { id: "serve", probability: 0.54, dependencyGroup: "serve", quality: 1 }
  ]);
  assert.equal(fused.independentGroups, 2);
  assert.equal(fused.modelCount, 3);
  assert.equal(fused.status, "consensus");
  assert.ok(Math.abs(fused.probability - 0.60) < 1e-12);
  assert.ok(Math.abs(fused.groups.find(group => group.dependencyGroup === "results").probability - 0.66) < 1e-12);
});

test("PFE merges overlapping and transitively connected dependencies without double-counting", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const result = sandbox.pfe.fusePredictions([
    { id: "elo", probability: 0.60, dependencyGroups: ["elo-ratings"] },
    { id: "form", probability: 0.70, dependencyGroups: ["elo-ratings", "recent-results"] },
    { id: "load", probability: 0.80, dependencyGroups: ["recent-results", "match-load"] },
    { id: "market", probability: 0.55, dependencyGroups: ["market"] }
  ]);
  assert.equal(result.modelCount, 4);
  assert.equal(result.independentGroups, 2);
  assert.equal(result.status, "consensus");
  assert.equal(result.groups.find(group => group.modelIds.includes("elo")).modelIds.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(result.groups.find(group => group.modelIds.includes("elo")).dependencyGroups)),
    ["elo-ratings", "match-load", "recent-results"]);
});

test("PFE dependencyGroups retains legacy dependencyGroup behavior and registry copies dependency metadata", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  const result = pfe.fusePredictions([
    { id: "elo", probability: 0.60, dependencyGroup: "ratings" },
    { id: "form", probability: 0.70, dependencyGroup: "ratings" },
    { id: "market", probability: 0.55, dependencyGroup: "market" }
  ]);
  assert.equal(result.independentGroups, 2);
  const registry = pfe.getModelRegistry();
  registry.find(row => row.id === "recent-form").dependencyGroups.push("mutated");
  assert.equal(pfe.getModelRegistry().find(row => row.id === "recent-form").dependencyGroups.includes("mutated"), false);
});

test("PFE rejects invalid inputs, detects model conflict and keeps calibrated weights bounded", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const result = sandbox.pfe.fusePredictions([
    { id: "a", probability: 0.8, calibratedWeight: 2 },
    { id: "b", probability: 0.5, calibratedWeight: 1 },
    { id: "bad", probability: 1.2 },
    { id: "a", probability: 0.6 }
  ]);
  assert.equal(result.status, "conflict");
  assert.equal(result.rejected.length, 2);
  assert.ok(result.probability > 0.69 && result.probability < 0.71);
});

test("PFE Monte Carlo is reproducible and labels the limits of its stress simulation", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const models = [
    { id: "elo", probability: 0.62, dependencyGroup: "rating", uncertainty: 0.03 },
    { id: "serve", probability: 0.58, dependencyGroup: "serve", uncertainty: 0.02 }
  ];
  const first = sandbox.pfe.runMonteCarlo(models, { iterations: 1000, seed: 42 });
  const second = sandbox.pfe.runMonteCarlo(models, { iterations: 1000, seed: 42 });
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(first.iterations, 1000);
  assert.equal(first.hasUncertaintyInputs, true);
  assert.ok(first.forecastInterval90[0] < first.forecastInterval90[1]);
  const fixed = sandbox.pfe.runMonteCarlo([{ id: "elo", probability: 0.62 }], { iterations: 100 });
  assert.equal(fixed.hasUncertaintyInputs, false);
  assert.match(fixed.note, /не симуляция розыгрышей или счёта|неинформативен/);
});


test("live prediction cards connect the Elo estimate to PFE without changing the source probability", () => {
  assert.ok(frontendSource.includes("TVSPFE.fusePredictions(pfeModels)"));
  assert.ok(frontendSource.includes("marketContext.marketProbabilityA/100"));
  assert.ok(frontendSource.includes("currentOddsAge<=90"));
  assert.ok(frontendSource.includes("pfeAssessment.disagreement"));
  assert.ok(frontendSource.includes("pfeSourceLabels"));
  assert.ok(frontendSource.includes("PFE: '+escapeHtml(pfeLabel)"));
  assert.ok(frontendSource.includes("PFE не меняет исходную вероятность, EV или размер ставки"));
});


test("PFE treats a fresh two-sided bookmaker market as a separate source and flags disagreement", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  const agreement = pfe.fusePredictions([
    { id: "general-elo-v2", dependencyGroup: "elo-ratings", probability: 0.61 },
    { id: "market-consensus", dependencyGroup: "bookmaker-market", probability: 0.59 }
  ]);
  assert.equal(agreement.status, "consensus");
  assert.equal(agreement.independentGroups, 2);
  assert.ok(Math.abs(agreement.probability - 0.6) < 1e-12);
  const conflict = pfe.fusePredictions([
    { id: "general-elo-v2", dependencyGroup: "elo-ratings", probability: 0.72 },
    { id: "market-consensus", dependencyGroup: "bookmaker-market", probability: 0.54 }
  ]);
  assert.equal(conflict.status, "conflict");
});

test("PFE registry exposes active and planned models with explicit dependency groups", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const registry = sandbox.pfe.getModelRegistry();
  assert.ok(registry.some(model => model.id === "general-elo-v2" && model.status === "active"));
  assert.ok(registry.some(model => model.id === "surface-elo" && model.status === "planned"));
  assert.ok(registry.some(model => model.id === "market-consensus" && model.status === "active" && model.currentlyIntegrated));
  assert.equal(registry.find(model => model.id === "general-elo-v2").dependencyGroup, "elo-ratings");
  registry[0].requires.push("mutated");
  assert.equal(sandbox.pfe.getModelRegistry()[0].requires.includes("mutated"), false);
});

test("PFE builds one immutable pre-match history observation per model and match from verified archive rows", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const base = {
    model: "general-elo-v2", matchId: 7101, probability: 64, side: "A",
    player: "Player A", opponent: "Player B", playerId: 11, opponentId: 22,
    capturedAt: Date.parse("2025-01-01T10:00:00Z"),
    matchDate: "2025-01-01T12:00:00Z", captureStatus: "upcoming",
    resultOutcome: "completed", resultWinner: 1, resultCheckedAt: Date.parse("2025-01-02T10:00:00Z"),
    modelVersion: "2", surface: "Clay", tour: "ATP"
  };
  const result = sandbox.pfe.buildModelHistoryRecords([
    base,
    { ...base, capturedAt: Date.parse("2025-01-01T10:30:00Z"), probability: 67 },
    { ...base, matchId: 7102, capturedAt: Date.parse("2025-01-01T12:00:00Z") },
    { ...base, matchId: 7103, resultOutcome: "unresolved" },
    { ...base, matchId: 7104, captureStatus: "live" },
    { ...base, matchId: 7105, side: "B" }
  ]);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].probability, 0.64);
  assert.equal(result.records[0].outcome, 1);
  assert.equal(result.records[0].playerId, 11);
  assert.equal(result.records[0].modelVersion, "2");
  assert.equal(result.records[1].outcome, 0);
  assert.equal(result.records[0].surface, "clay");
  assert.equal(result.records[0].tour, "atp");
  assert.equal(result.rejected.length, 3);
});

test("PFE serve-return adapter respects ULTRA availability, sample sizes and missing values", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  assert.equal(pfe.normalizeServeReturnProfile({ records: {} }).status, "unavailable");
  const ratio = (numerator, denominator, matches) => ({
    numerator, denominator, matches, pct: Number((numerator / denominator * 100).toFixed(1))
  });
  const profile = {
    matches: 12, matches_with_stats: 10, matches_incomplete: 2,
    serve: {
      first_serve_in: ratio(620, 1000, 10),
      first_serve_points_won: ratio(430, 620, 10),
      second_serve_points_won: ratio(210, 380, 10),
      service_games_won: ratio(150, 180, 10),
      break_points_saved: ratio(32, 50, 10)
    },
    return: {
      first_serve_return_points_won: ratio(190, 620, 10),
      second_serve_return_points_won: ratio(170, 380, 10),
      return_games_won: ratio(35, 180, 10),
      break_points_converted: ratio(18, 45, 10)
    }
  };
  const ready = pfe.normalizeServeReturnProfile({ serve_return: profile });
  assert.equal(ready.status, "ready_for_modeling");
  assert.equal(ready.matchesWithStats, 10);
  assert.equal(ready.metrics.firstServePointsWon.pct, 430 / 620 * 100);
  assert.equal(ready.availableMetrics, 9);
  const sparseMetric = pfe.normalizeServeReturnProfile({
    ...profile,
    serve: { ...profile.serve, first_serve_points_won: ratio(43, 62, 2) }
  });
  assert.equal(sparseMetric.status, "insufficient_sample");
  assert.equal(sparseMetric.reason, "insufficient_metric_sample");
  const small = pfe.normalizeServeReturnProfile(profile, { minMatches: 11 });
  assert.equal(small.status, "insufficient_sample");
  const missing = pfe.normalizeServeReturnProfile({
    ...profile, serve: { ...profile.serve, first_serve_points_won: null }
  });
  assert.equal(missing.status, "partial");
  assert.equal(missing.metrics.firstServePointsWon, undefined);
  const invalid = pfe.normalizeServeReturnProfile({
    ...profile, return: { ...profile.return, return_games_won: ratio(50, 30, 10) }
  });
  assert.equal(invalid.status, "partial");
  assert.equal(invalid.metrics.returnGamesWon, undefined);
});

test("PFE interface states that serve-return model requires verified ULTRA data and does not activate without it", () => {
  assert.ok(frontendSource.includes("Подача и приём требуют агрегатов ULTRA"));
  assert.ok(frontendSource.includes("без них модель не активируется"));
});

test("PFE tie-break, set and match models are symmetric and respond to stronger point probabilities", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  assert.ok(Math.abs(pfe.calculateTiebreakWinProbability(0.6, 0.6, true) - 0.5) < 1e-10);
  assert.ok(Math.abs(pfe.calculateTiebreakWinProbability(0.6, 0.6, false) - 0.5) < 1e-10);
  assert.ok(Math.abs(pfe.calculateSetWinProbability(0.6, 0.6, true) - 0.5) < 1e-10);
  assert.ok(Math.abs(pfe.calculateSetWinProbability(0.6, 0.6, false) - 0.5) < 1e-10);
  assert.ok(pfe.calculateSetWinProbability(0.65, 0.55, true) > 0.5);
  assert.ok(pfe.calculateSetWinProbability(0.65, 0.55, false) > 0.5);
  const bestOf3 = pfe.calculateMatchWinProbability(0.65, 0.55, { bestOf: 3 });
  const bestOf5 = pfe.calculateMatchWinProbability(0.65, 0.55, { bestOf: 5 });
  assert.equal(bestOf3.status, "provisional");
  assert.ok(bestOf3.probabilityA > 0.5 && bestOf3.probabilityA < 1);
  assert.ok(bestOf5.probabilityA > 0.5 && bestOf5.probabilityA < 1);
  assert.ok(bestOf5.probabilityA > bestOf3.probabilityA);
  assert.equal(pfe.calculateMatchWinProbability(0.6, 0.6, { bestOf: 7 }).status, "invalid");
});

test("PFE analytical match probability tracks point-by-point simulation with between-set service rotation", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  for (const [pointA, pointB, bestOf] of [[0.64, 0.58, 3], [0.66, 0.54, 5], [0.57, 0.63, 3]]) {
    const exact = pfe.calculateMatchWinProbability(pointA, pointB, { bestOf });
    const simulated = pfe.runMatchMonteCarlo(pointA, pointB, { bestOf, iterations: 100000, seed: 77123 });
    assert.equal(exact.status, "provisional");
    assert.ok(Math.abs(exact.probabilityA - simulated.probabilityA) < 0.012,
      "analytic=" + exact.probabilityA + " simulated=" + simulated.probabilityA);
    assert.ok(exact.firstServerProbabilities.startA >= 0 && exact.firstServerProbabilities.startA <= 1);
    assert.ok(exact.firstServerProbabilities.startB >= 0 && exact.firstServerProbabilities.startB <= 1);
  }
});

test("PFE point-by-point match simulation is reproducible, bounded and reports scoreline scenarios", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  const first = pfe.runMatchMonteCarlo(0.64, 0.58, { iterations: 1200, seed: 17, bestOf: 3 });
  const second = pfe.runMatchMonteCarlo(0.64, 0.58, { iterations: 1200, seed: 17, bestOf: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(first.status, "scenario");
  assert.equal(first.iterations, 1200);
  assert.ok(first.probabilityA > 0.5);
  assert.ok(first.probabilityA < 1);
  assert.ok(first.confidenceInterval95A[0] <= first.probabilityA);
  assert.ok(first.confidenceInterval95A[1] >= first.probabilityA);
  assert.ok(first.averageTotalGames >= 12);
  assert.ok(first.topScorelines.length > 0);
  assert.ok(first.topScorelines.every(row => row.probability > 0 && row.probability <= 1));
  const bestOfFive = pfe.runMatchMonteCarlo(0.64, 0.58, { iterations: 800, seed: 29, bestOf: 5 });
  assert.equal(bestOfFive.bestOf, 5);
  assert.ok(bestOfFive.averageSets >= 3 && bestOfFive.averageSets <= 5);
  assert.ok(bestOfFive.topScorelines.every(row => /^(3-0|3-1|3-2|0-3|1-3|2-3) /.test(row.score)));
  const forward = pfe.runMatchMonteCarlo(0.64, 0.58, { iterations: 20000, seed: 23 });
  const swapped = pfe.runMatchMonteCarlo(0.58, 0.64, { iterations: 20000, seed: 23 });
  const equal = pfe.runMatchMonteCarlo(0.6, 0.6, { iterations: 20000, seed: 41 });
  assert.ok(Math.abs(equal.probabilityA - 0.5) < 0.02);
  assert.ok(Math.abs(forward.probabilityA + swapped.probabilityA - 1) < 0.04);
  assert.equal(pfe.runMatchMonteCarlo(-0.1, 0.6).status, "invalid");
  assert.equal(pfe.runMatchMonteCarlo(0.6, 0.6, { bestOf: 7 }).reason, "unsupported_match_format");
});

test("PFE calculates exact standard service-game hold probability from point probability", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const calculate = sandbox.pfe.calculateHoldProbability;
  assert.equal(calculate(0), 0);
  assert.equal(calculate(0.5), 0.5);
  assert.equal(calculate(1), 1);
  assert.ok(Math.abs(calculate(0.6) - 0.7357292307692308) < 1e-12);
  assert.equal(calculate(-0.01), null);
  assert.equal(calculate(1.01), null);
  assert.equal(calculate("not-a-number"), null);
});

test("PFE derives serve-point inputs only when serve and opponent-return evidence agrees", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  const make = (playerId, firstServeIn, firstWon, secondWon, returnFirst, returnSecond) => ({
    status: "ready_for_modeling", playerId, metrics: {
      firstServeIn: { pct: firstServeIn },
      firstServePointsWon: { pct: firstWon },
      secondServePointsWon: { pct: secondWon },
      firstServeReturnPointsWon: { pct: returnFirst },
      secondServeReturnPointsWon: { pct: returnSecond }
    }
  });
  const a = make(101, 62, 72, 51, 34, 48);
  const b = make(202, 60, 70, 50, 35, 49);
  const result = pfe.deriveServeReturnMatchInputs(a, b);
  assert.equal(result.status, "ready_for_score_simulation");
  assert.ok(result.playerA.servicePointWin > 0 && result.playerA.servicePointWin < 1);
  assert.ok(result.playerB.servicePointWin > 0 && result.playerB.servicePointWin < 1);
  assert.ok(result.playerA.disagreement <= 0.08);
  const mismatch = pfe.deriveServeReturnMatchInputs(a, make(202, 60, 70, 50, 5, 5));
  assert.equal(mismatch.status, "review");
  assert.equal(mismatch.playerA.servicePointWin, null);
  assert.equal(pfe.deriveServeReturnMatchInputs(a, a).reason, "player_identity_mismatch");
});

test("PFE recent-form adapter filters non-completed and out-of-window matches and computes recency weighting", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const now = Date.parse("2026-11-18T12:00:00Z");
  const daysAgo = days => new Date(now - days * 86400000).toISOString();
  const recent = [
    { match_id: 1, date: daysAgo(1), won: true, outcome: "completed", surface: "hard", level: "atp" },
    { match_id: 2, date: daysAgo(10), won: true, outcome: "completed", surface: "hard", level: "atp" },
    { match_id: 3, date: daysAgo(20), won: false, outcome: "completed", surface: "clay", level: "atp" },
    { match_id: 4, date: daysAgo(30), won: false, outcome: "completed", surface: "grass", level: "wta" },
    { match_id: 5, date: daysAgo(40), won: true, outcome: "completed", surface: "hard", level: "challenger" },
    { match_id: 6, date: daysAgo(5), won: true, outcome: "retired", surface: "hard" },
    { match_id: 7, date: daysAgo(220), won: true, outcome: "completed", surface: "hard" },
    { match_id: 1, date: daysAgo(2), won: false, outcome: "completed", surface: "hard" },
    { match_id: 8, date: daysAgo(-1), won: true, outcome: "completed", surface: "hard" }
  ];
  const pfe = sandbox.pfe;
  const result = pfe.normalizeRecentFormProfile({ player: { id: 123 }, records: { recent } }, { now, playerId: 123, minMatches: 6 });
  assert.equal(result.status, "insufficient_sample");
  assert.equal(result.sampleSize, 5);
  assert.equal(result.wins, 3);
  assert.equal(result.losses, 2);
  assert.equal(result.excluded.non_completed, 1);
  assert.equal(result.excluded.outside_window, 2);
  assert.equal(result.excluded.duplicate, 1);
  assert.ok(result.recencyWeightedWinRate > result.winRate);
  assert.equal(result.bySurface.hard.matches, 3);
  assert.equal(pfe.normalizeRecentFormProfile({ player: { id: 456 }, records: { recent } }, { playerId: 123 }).reason,
    "player_identity_mismatch");
  const ready = pfe.normalizeRecentFormProfile({ player: { id: 123 }, records: { recent } }, { now, minMatches: 5 });
  assert.equal(ready.status, "ready_for_modeling");
});

test("PFE recent-form UI explains PRO access and dependency with Elo", () => {
  assert.ok(frontendSource.includes("Форма игроков требует PRO-историю завершённых матчей"));
  assert.ok(frontendSource.includes("учитывается как зависимая от Elo информация"));
});

test("PFE builds one verified pre-match market record per match from paired same-bookmaker quotes", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  const start = Date.parse("2026-11-20T18:00:00Z");
  const make = (side, odds, capturedAt, bookmaker = "Winamax", extra = {}) => ({
    matchId: 777, side, player: side === "A" ? "Player Á" : "Player B",
    opponent: side === "A" ? "Player B" : "Player A",
    bookmaker, odds, capturedAt, matchDate: new Date(start).toISOString(),
    captureStatus: "upcoming", resultOutcome: "completed", resultWinner: 1,
    resultCheckedAt: start + 3600000, ...extra
  });
  const rows = [
    make("A", 1.9, start - 7200000), make("B", 1.9, start - 7200000),
    make("A", 1.8, start - 3600000), make("B", 2.1, start - 3600000),
    make("A", 1.7, start - 1800000, "Betclic"), make("B", 2.2, start - 1800000, "Betclic"),
    make("A", 1.5, start + 1000), make("B", 2.5, start + 1000)
  ];
  const result = pfe.buildMarketHistoryRecords(rows);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].modelId, "market-consensus");
  assert.equal(result.records[0].outcome, 1);
  assert.equal(result.records[0].bookmakerCount, 2);
  assert.equal(result.records[0].capturedAt, new Date(start - 1800000).toISOString());
  assert.ok(result.records[0].probability > 0.5);
  assert.equal(pfe.evaluateModelHistory(result.records).models.find(row => row.modelId === "market-consensus").status,
    "insufficient_sample");
});


test("PFE market history enforces the 90-minute quote freshness window and verified result timing", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const pfe = sandbox.pfe;
  const start = Date.parse("2026-11-20T18:00:00Z");
  const make = (side, capturedAt, extra = {}) => ({
    matchId: 779, side, player: side === "A" ? "Player A" : "Player B",
    opponent: side === "A" ? "Player B" : "Player A", bookmaker: "Winamax",
    odds: side === "A" ? 1.9 : 2.1, capturedAt, matchDate: new Date(start).toISOString(),
    captureStatus: "upcoming", resultOutcome: "completed", resultWinner: 1,
    resultCheckedAt: start + 3600000, ...extra
  });
  const stale = pfe.buildMarketHistoryRecords([
    make("A", start - 91 * 60000), make("B", start - 91 * 60000)
  ]);
  assert.equal(stale.records.length, 0);
  assert.equal(stale.rejected[0].reason, "stale_market_quote");
  const boundary = pfe.buildMarketHistoryRecords([
    make("A", start - 90 * 60000), make("B", start - 90 * 60000)
  ]);
  assert.equal(boundary.records.length, 1);
  const unverified = pfe.buildMarketHistoryRecords([
    make("A", start - 30 * 60000, { resultCheckedAt: start - 1000 }),
    make("B", start - 30 * 60000, { resultCheckedAt: start - 1000 })
  ]);
  assert.equal(unverified.records.length, 0);
  assert.equal(unverified.rejected[0].reason, "result_not_verified");
  const scheduleMismatch = pfe.buildMarketHistoryRecords([
    make("A", start - 30 * 60000),
    make("B", start - 30 * 60000, { matchDate: new Date(start + 120000).toISOString() })
  ]);
  assert.equal(scheduleMismatch.records.length, 0);
  assert.equal(scheduleMismatch.rejected[0].reason, "match_schedule_mismatch");
});


test("PFE market history aligns bookmaker quotes within a bounded time skew", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const start = Date.parse("2026-11-20T18:00:00Z");
  const make = (side, capturedAt, bookmaker) => ({
    matchId: 781, side, player: side === "A" ? "Player A" : "Player B",
    opponent: side === "A" ? "Player B" : "Player A", bookmaker,
    odds: side === "A" ? 1.9 : 2.1, capturedAt, matchDate: new Date(start).toISOString(),
    captureStatus: "upcoming", resultOutcome: "completed", resultWinner: 1,
    resultCheckedAt: start + 3600000
  });
  const rows = [
    make("A", start - 40 * 60000, "Winamax"),
    make("B", start - 40 * 60000, "Winamax"),
    make("A", start - 5 * 60000, "Betclic"),
    make("B", start - 5 * 60000, "Betclic")
  ];
  const result = sandbox.pfe.buildMarketHistoryRecords(rows);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].bookmakerCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.records[0].bookmakers)), ["Betclic"]);
  const wider = sandbox.pfe.buildMarketHistoryRecords(rows, { maxProviderQuoteSkewMinutes: 40 });
  assert.equal(wider.records[0].bookmakerCount, 2);
});

test("PFE rejects the entire market history match when bookmakers disagree on player identity", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const start = Date.parse("2026-11-20T18:00:00Z");
  const make = (matchId, side, player, opponent, bookmaker) => ({
    matchId, side, player, opponent, bookmaker, odds: side === "A" ? 1.9 : 2.1,
    capturedAt: start - 30 * 60000, matchDate: new Date(start).toISOString(),
    captureStatus: "upcoming", resultOutcome: "completed", resultWinner: 1,
    resultCheckedAt: start + 3600000
  });
  const rows = [
    make(780, "A", "Player A", "Player B", "Winamax"),
    make(780, "B", "Player B", "Player A", "Winamax"),
    make(780, "A", "Different A", "Different B", "Betclic"),
    make(780, "B", "Different B", "Different A", "Betclic")
  ];
  const result = sandbox.pfe.buildMarketHistoryRecords(rows);
  assert.equal(result.records.length, 0);
  assert.equal(result.rejected[0].reason, "cross_bookmaker_identity_mismatch");
});

test("PFE market history rejects mismatched identities, unverified results and ambiguous latest quotes", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const start = Date.parse("2026-11-20T18:00:00Z");
  const base = (side, odds, extra = {}) => ({
    matchId: 778, side, player: side === "A" ? "Player A" : "Player B",
    opponent: side === "A" ? "Player B" : "Player A", bookmaker: "Winamax",
    odds, capturedAt: start - 3600000, matchDate: new Date(start).toISOString(),
    captureStatus: "upcoming", resultOutcome: "completed", resultWinner: 1,
    resultCheckedAt: start + 3600000, ...extra
  });
  const mismatch = sandbox.pfe.buildMarketHistoryRecords([
    base("A", 1.8), base("B", 2.1, { player: "Other Player" })
  ]);
  assert.equal(mismatch.records.length, 0);
  assert.equal(mismatch.rejected[0].reason, "player_identity_mismatch");
  const unverified = sandbox.pfe.buildMarketHistoryRecords([
    base("A", 1.8), base("B", 2.1, { resultCheckedAt: 0 })
  ]);
  assert.equal(unverified.records.length, 0);
  const ambiguous = sandbox.pfe.buildMarketHistoryRecords([
    base("A", 1.8), base("A", 1.9), base("B", 2.1)
  ]);
  assert.equal(ambiguous.records.length, 0);
  assert.equal(ambiguous.rejected[0].reason, "ambiguous_same_time_quote");
});

test("PFE history evaluation uses chronological holdout and neutral weights for small samples", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const rows = Array.from({ length: 60 }, (_, index) => ({
    modelId: "general-elo-v2", matchId: "hist-" + index,
    probability: index % 2 ? 0.7 : 0.3, outcome: index % 2 ? 1 : 0,
    capturedAt: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    matchStart: new Date(Date.UTC(2025, 0, index + 1, 12)).toISOString(),
    resultVerified: true
  }));
  const evaluated = sandbox.pfe.evaluateModelHistory(rows);
  assert.equal(evaluated.status, "evaluated");
  assert.equal(evaluated.split, "chronological_70_30");
  assert.equal(evaluated.models[0].training.sampleSize, 42);
  assert.equal(evaluated.models[0].validation.sampleSize, 18);
  assert.equal(evaluated.models[0].status, "validated");
  assert.ok(evaluated.models[0].calibratedWeight > 1);
  const small = sandbox.pfe.evaluateModelHistory(rows.slice(0, 20));
  assert.equal(small.models[0].status, "insufficient_sample");
  assert.equal(small.models[0].calibratedWeight, 1);
});

test("PFE history evaluation rejects post-start, unverified, duplicate and unknown observations", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const base = {
    modelId: "general-elo-v2", matchId: "strict-1", probability: 0.62, outcome: 1,
    capturedAt: "2025-01-01T10:00:00Z", matchStart: "2025-01-01T12:00:00Z", resultVerified: true
  };
  const result = sandbox.pfe.evaluateModelHistory([
    base, { ...base }, { ...base, matchId: "late", capturedAt: "2025-01-01T12:00:00Z" },
    { ...base, matchId: "unverified", resultVerified: false },
    { ...base, modelId: "imaginary-model", matchId: "unknown" }
  ]);
  assert.equal(result.models[0].training.sampleSize, 0);
  assert.equal(result.models[0].validation.sampleSize, 1);
  assert.equal(result.rejected.length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rejected.map(row => row.reason).sort())),
    ["duplicate_match_model", "not_pre_match", "unknown_model", "unverified_result"].sort());
});



test("PFE paired history compares Elo and market only on identical verified matches", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const start = Date.parse("2025-01-01T12:00:00Z") + i * 86400000;
    const outcome = i % 2;
    const base = { matchId: String(1000 + i), outcome, resultVerified: true,
      capturedAt: new Date(start - 3600000).toISOString(),
      matchStart: new Date(start).toISOString() };
    rows.push({ ...base, modelId: "general-elo-v2", probability: outcome ? 0.7 : 0.3 });
    rows.push({ ...base, modelId: "market-consensus", outcome: i === 0 ? 1 - outcome : outcome, probability: outcome ? 0.65 : 0.35 });
  }
  rows.push({ modelId: "market-consensus", matchId: "unpaired", probability: 0.9, outcome: 1,
    capturedAt: "2025-04-01T10:00:00Z", matchStart: "2025-04-01T12:00:00Z", resultVerified: true });
  rows.push({ ...rows[0], modelId: "market-consensus", matchId: rows[0].matchId, outcome: 0 });
  const result = sandbox.pfe.compareModelHistory(rows, {
    minTraining: 5, minValidation: 5, stabilityWindows: [5, 10, 20]
  });
  assert.equal(result.status, "evaluated");
  assert.equal(result.matchedSampleSize, 59);
  assert.equal(result.trainingSampleSize, 41);
  assert.equal(result.validationSampleSize, 18);
  assert.equal(result.excluded.unpaired, 1);
  assert.equal(result.excluded.outcomeConflict, 1);
  assert.equal(result.excluded.invalid, 1);
  assert.equal(result.models.length, 2);
  assert.equal(result.models[0].validation.sampleSize, 18);
  assert.equal(result.models[1].validation.sampleSize, 18);
  assert.equal(result.comparisons[0].stability.length, 2);
  assert.ok(result.comparisons[0].validationDeltaBrier > 0);
  assert.ok(result.comparisons[0].validationDeltaLogLoss > 0);
});


test("PFE paired comparison scores the neutral Elo-market fusion against Elo and a 50 percent baseline", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const start = Date.parse("2025-01-01T12:00:00Z") + i * 86400000;
    const outcome = i % 2;
    const base = { matchId: String(3000 + i), outcome, resultVerified: true,
      capturedAt: new Date(start - 3600000).toISOString(), matchStart: new Date(start).toISOString(),
      surface: i % 2 ? "hard" : "clay", tour: i % 3 ? "atp" : "wta" };
    rows.push({ ...base, modelId: "general-elo-v2", probability: outcome ? 0.6 : 0.4 });
    rows.push({ ...base, modelId: "market-consensus", probability: outcome ? 0.8 : 0.2 });
  }
  const result = sandbox.pfe.compareModelHistory(rows, { minTraining: 5, minValidation: 5 });
  assert.equal(result.status, "evaluated");
  assert.equal(result.trainingScores.combined.sampleSize, 42);
  assert.equal(result.validationScores.combined.sampleSize, 18);
  assert.equal(result.validationScores.baseline.sampleSize, 18);
  assert.ok(result.validationScores.combined.brierScore < result.validationScores.models["general-elo-v2"].brierScore);
  assert.ok(result.validationScores.combined.brierScore < result.validationScores.baseline.brierScore);
  assert.ok(result.segments.some(row => row.dimension === "surface" && row.value === "hard"));
  assert.ok(result.segments.some(row => row.dimension === "tour" && row.value === "atp"));
  assert.ok(result.segments.every(row => row.trainingSampleSize + row.validationSampleSize <= 60));
});

test("PFE segment comparisons retain one global chronological split and mark small segments preliminary", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const start = Date.parse("2025-01-01T12:00:00Z") + i * 86400000;
    const base = { matchId: String(4000 + i), outcome: i % 2, resultVerified: true,
      capturedAt: new Date(start - 3600000).toISOString(), matchStart: new Date(start).toISOString(),
      surface: i < 6 ? "grass" : "hard", tour: "challenger" };
    rows.push({ ...base, modelId: "general-elo-v2", probability: 0.55 });
    rows.push({ ...base, modelId: "market-consensus", probability: 0.55 });
  }
  const result = sandbox.pfe.compareModelHistory(rows, { minTraining: 10, minValidation: 10 });
  const grass = result.segments.find(row => row.dimension === "surface" && row.value === "grass");
  assert.ok(grass);
  assert.equal(grass.status, "preliminary");
  assert.equal(grass.trainingSampleSize + grass.validationSampleSize, 6);
});

test("PFE paired comparison remains neutral when the common sample is too small", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const rows = [];
  for (let i = 0; i < 20; i++) {
    const start = Date.parse("2025-01-01T12:00:00Z") + i * 86400000;
    const base = { matchId: String(2000 + i), outcome: i % 2, resultVerified: true,
      capturedAt: new Date(start - 3600000).toISOString(), matchStart: new Date(start).toISOString() };
    rows.push({ ...base, modelId: "general-elo-v2", probability: 0.55 });
    rows.push({ ...base, modelId: "market-consensus", probability: 0.55 });
  }
  const result = sandbox.pfe.compareModelHistory(rows, { minTraining: 10, minValidation: 10 });
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.models[0].calibratedWeight, 1);
  assert.equal(result.models[1].calibratedWeight, 1);
  assert.equal(result.models[0].rawWeight, null);
});


test("PFE prediction card exposes fused model, baseline and segment diagnostics", () => {
  assert.ok(frontendSource.includes("Объединённый Elo + рынок:"));
  assert.ok(frontendSource.includes("Δ к базовым 50%:"));
  assert.ok(frontendSource.includes("Сегменты:"));
  assert.ok(frontendSource.includes("pfePairedComparison.segments"));
});

test("PFE paired comparison is surfaced as an out-of-sample diagnostic", () => {
  assert.ok(frontendSource.includes("TVSPFE.compareModelHistory(pfeCombinedHistory"));
  assert.ok(frontendSource.includes("Сравнение на общей выборке:"));
  assert.ok(frontendSource.includes("Устойчивость рынка:"));
  assert.ok(frontendSource.includes("pfeMarketDelta.stability.map"));
  assert.ok(frontendSource.includes("окна устойчивости появятся после накопления общей истории"));
});

test("PFE model history evaluation is displayed as diagnostic and snapshots retain model version", () => {
  assert.ok(frontendSource.includes("TVSPFE.buildModelHistoryRecords(pfeArchiveRows)"));
  assert.ok(frontendSource.includes("вес-кандидат "));
  assert.ok(frontendSource.includes("Кандидатные веса пока не применяются автоматически"));
  assert.ok(frontendSource.includes("modelVersion:'2'"));
});

test("prediction card shows the registered PFE model count without claiming planned models are active", () => {
  assert.ok(frontendSource.includes("TVSPFE.getModelRegistry()"));
  assert.ok(frontendSource.includes("Реестр PFE: '+pfeRegistry.length+' моделей, активных: '+pfeActiveCount"));
});


test("PFE does not understate uncertainty inside correlated dependency groups", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const result = sandbox.pfe.fusePredictions([
    { id: "model-a", probability: 0.62, dependencyGroup: "shared-source", uncertainty: 0.1 },
    { id: "model-b", probability: 0.66, dependencyGroup: "shared-source", uncertainty: 0.2 }
  ]);
  assert.equal(result.independentGroups, 1);
  assert.ok(Math.abs(result.groups[0].uncertainty - 0.15) < 1e-12);
  assert.ok(Math.abs(result.probability - 0.64) < 1e-12);
});

test("settings provide a persistent app-wide switch between black and olive skins", () => {
  assert.ok(frontendSource.includes('id="skinSelect"'));
  assert.ok(frontendSource.includes('value="black"'));
  assert.ok(frontendSource.includes('value="olive"'));
  assert.ok(frontendSource.includes("saved.skin==='olive'?'olive':'black'"));
  assert.ok(frontendSource.includes("document.body.dataset.skin=selected"));
  assert.ok(frontendSource.includes("data.skin=$('#skinSelect').value==='olive'?'olive':'black'"));
  assert.ok(frontendSource.includes('body[data-skin="olive"]'));
  assert.ok(frontendSource.includes('#626744'));
});


test("PFE fixed-weight sensitivity evaluates five Elo/market ratios on one chronological holdout", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const rows = [];
  for (let i = 0; i < 80; i++) {
    const start = Date.parse("2025-01-01T12:00:00Z") + i * 86400000;
    const outcome = i % 2;
    const base = { matchId: String(5000 + i), outcome, resultVerified: true,
      capturedAt: new Date(start - 3600000).toISOString(),
      matchStart: new Date(start).toISOString(),
      surface: i % 2 ? "hard" : "clay", tour: i % 3 ? "atp" : "wta" };
    rows.push({ ...base, modelId: "general-elo-v2", probability: outcome ? 0.62 : 0.38 });
    rows.push({ ...base, modelId: "market-consensus", probability: outcome ? 0.78 : 0.22 });
  }
  const result = sandbox.pfe.compareModelHistory(rows, { minTraining: 10, minValidation: 5 });
  assert.equal(result.weightSensitivity.length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(result.weightSensitivity.map(row => row.label))),
    ["100/0", "75/25", "50/50", "25/75", "0/100"]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.weightSensitivity.map(row => row.marketWeight))),
    [0, 0.25, 0.5, 0.75, 1]);
  assert.ok(result.weightSensitivity.every(row => row.training.sampleSize === 56));
  assert.ok(result.weightSensitivity.every(row => row.validation.sampleSize === 24));
  assert.ok(result.weightSensitivity.every(row => row.segments.some(segment =>
    segment.dimension === "surface" && segment.value === "hard")));
  assert.ok(result.weightSensitivity.every(row => row.segments.every(segment =>
    segment.trainingSampleSize + segment.validationSampleSize <= 80)));
  assert.equal(result.weightSensitivity[2].validation.brierScore,
    result.validationScores.combined.brierScore);
});

test("PFE fixed-weight sensitivity stays empty when Elo and market are not both selected", () => {
  const source = readFileSync(new URL("../pfe.js", import.meta.url), "utf8");
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.pfe = TVSPFE;", sandbox);
  const rows = Array.from({ length: 20 }, (_, i) => ({
    modelId: "general-elo-v2", matchId: "single-" + i, probability: 0.6,
    outcome: i % 2, resultVerified: true,
    capturedAt: "2025-01-01T10:00:00Z", matchStart: "2025-01-01T12:00:00Z"
  }));
  const result = sandbox.pfe.compareModelHistory(rows, { modelIds: ["general-elo-v2"] });
  assert.equal(result.weightSensitivity.length, 0);
});


test("PFE fixed-weight sensitivity is surfaced as a diagnostic and never auto-applied", () => {
  assert.ok(frontendSource.includes("pfePairedComparison.weightSensitivity"));
  assert.ok(frontendSource.includes("Чувствительность весов (только диагностика):"));
  assert.ok(frontendSource.includes("Elo/рынок "));
  assert.ok(frontendSource.includes("Кандидатные веса пока не применяются автоматически"));
});
