import test from "node:test";
import { TextEncoder } from "node:util";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const workerSource = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const frontendSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorkerSource = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const bankrollSource = readFileSync(new URL("../bankroll.js", import.meta.url), "utf8");
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
    ratingDateSource + archiveSource + String.fromCharCode(10) + "globalThis.archiveFns = { readPredictionArchive, persistPredictionArchive, savePredictionSnapshot, mergePredictionArchive, createArchiveBackup, readArchiveBackup, applyVerifiedMatchResult, archiveResultStats, archiveOddsMovement, stampResultCheck, initializeArchiveStorage, flushArchiveWrites, getArchiveReadError: () => archiveReadError };",
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
  helperSource + "\nglobalThis.testHelpers = { findElo, eloProbability, response };",
  helperSandbox
);
const { findElo, eloProbability, response } = helperSandbox.testHelpers;

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

test("overall Elo takes precedence over surface Elo", () => {
  assert.equal(findElo({ clay_elo: 2100, stats: { overall_elo: 1850 } }), 1850);
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
  assert.ok(frontendSource.includes("savePredictionSnapshot(m,el,result)"));
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
    playerA: "1", playerB: "2", oddsA: "1.80", oddsB: "2.10"
  }};
  savePredictionSnapshot(match, element, {
    probabilityA: 60, probabilityB: 40, ratingA: 1900, ratingB: 1800,
    ratingsAsOfA: "2026-11-10", ratingsAsOfB: "2026-11-11"
  });
  const rows = readPredictionArchive();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tour, "atp");
  assert.equal(rows[0].surface, "Hard");
  assert.equal(rows.find(row => row.side === "A").matchId, 123);
  assert.equal(rows.find(row => row.side === "A").ev, 8);
  assert.equal(rows.find(row => row.side === "B").ev, -16);
  assert.equal(rows.find(row => row.side === "A").ratingAsOf, "2026-11-10");
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

test("archive applies only verified completed results and honours result revisions", () => {
  const { applyVerifiedMatchResult, archiveResultStats } = makeArchiveStore();
  const rows = [
    { matchId: 123, matchKey: "123", side: "A", probability: 61, capturedAt: 100, resultVersion: 1 },
    { matchId: 123, matchKey: "123", side: "B", probability: 39, capturedAt: 100, resultVersion: 1 },
    { matchId: 456, matchKey: "456", side: "A", probability: 70, capturedAt: 100 }
  ];
  const ignoredRevision = applyVerifiedMatchResult(rows, { id: 123, status: "completed", outcome: "completed", winner: 2, result_version: 0 }, 500);
  assert.equal(ignoredRevision.rows[0].resultWinner, undefined);
  const applied = applyVerifiedMatchResult(rows, { id: 123, status: "completed", outcome: "completed", winner: 1, result_version: 2 }, 600);
  assert.equal(applied.updated, 2);
  assert.equal(applied.rows[0].resultOutcome, "completed");
  assert.equal(applied.rows[0].resultWinner, 1);
  const stats = archiveResultStats(applied.rows);
  assert.equal(stats.settled, 1);
  assert.equal(stats.accuracy, 100);
  const withdrawn = applyVerifiedMatchResult(applied.rows, { id: 123, status: "completed", outcome: "retired", winner: 1, result_version: 3 }, 700);
  assert.equal(withdrawn.rows[0].resultOutcome, "retired");
  assert.equal(archiveResultStats(withdrawn.rows).settled, 0);
});

test("archive accuracy honours newer non-completed result versions and rejects conflicting predictions", () => {
  const { archiveResultStats } = makeArchiveStore();
  const rows = [
    { matchId: 888, matchKey: "888", side: "A", probability: 60, capturedAt: 100, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 },
    { matchId: 888, matchKey: "888", side: "A", probability: 60, capturedAt: 200, resultOutcome: "retired", resultWinner: 1, resultVersion: 2 },
    { matchId: 889, matchKey: "889", side: "A", probability: 60, capturedAt: 100, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 },
    { matchId: 889, matchKey: "889", side: "B", probability: 60, capturedAt: 100, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 },
    { matchId: 890, matchKey: "890", side: "A", probability: null, capturedAt: null, resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ];
  const stats = archiveResultStats(rows);
  assert.equal(stats.settled, 0);
  assert.equal(stats.excluded, 1);
  assert.equal(stats.ambiguous, 2);
});

test("archive prediction accuracy gives exact 50 percent Elo ties half credit", () => {
  const { archiveResultStats } = makeArchiveStore();
  const rows = [
    { matchId: 765, matchKey: "765", side: "A", probability: 50, capturedAt: 100, resultOutcome: "completed", resultWinner: 1 },
    { matchId: 765, matchKey: "765", side: "B", probability: 50, capturedAt: 100, resultOutcome: "completed", resultWinner: 1 }
  ];
  const stats = archiveResultStats(rows);
  assert.equal(stats.settled, 1);
  assert.equal(stats.accuracy, 50);
});

test("archive rejects conflicting results at the same version and unversioned regressions", () => {
  const { applyVerifiedMatchResult } = makeArchiveStore();
  const rows = [
    { matchId: 321, matchKey: "321", side: "A", resultOutcome: "completed", resultWinner: 1, resultVersion: 4 },
    { matchId: 321, matchKey: "321", side: "B", resultOutcome: "completed", resultWinner: 1, resultVersion: 4 },
    { matchId: 654, matchKey: "654", side: "A", resultOutcome: "completed", resultWinner: 2, resultVersion: 3 }
  ];
  const sameVersionConflict = applyVerifiedMatchResult(rows, {
    id: 321, status: "completed", outcome: "completed", winner: 2, result_version: 4
  }, 900);
  assert.equal(sameVersionConflict.updated, 0);
  assert.equal(sameVersionConflict.rows[0].resultWinner, 1);
  const unversionedRegression = applyVerifiedMatchResult(sameVersionConflict.rows, {
    id: 654, status: "completed", outcome: "completed", winner: 1
  }, 901);
  assert.equal(unversionedRegression.updated, 0);
  assert.equal(unversionedRegression.rows[2].resultWinner, 2);
  const newer = applyVerifiedMatchResult(unversionedRegression.rows, {
    id: 321, status: "completed", outcome: "completed", winner: 2, result_version: 5
  }, 902);
  assert.equal(newer.updated, 2);
  assert.equal(newer.rows[0].resultWinner, 2);
});

test("archive accepts the first unversioned official result for a record with no result version", () => {
  const { applyVerifiedMatchResult } = makeArchiveStore();
  const rows = [{ matchId: 987, matchKey: "987", side: "A", resultVersion: null }];
  const applied = applyVerifiedMatchResult(rows, {
    id: 987, status: "completed", outcome: "completed", winner: 1
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
  assert.match(frontendSource, /TVSBankroll\.parseBackup\(JSON\.parse\(localStorage\.getItem\(BANKROLL_KEY\)\)\)/);
  assert.match(frontendSource, /if\(restoreBankrollBackup\(restored\)\)renderBankroll\(\)/);
  assert.ok(frontendSource.includes("Текущие записи будут заменены."));
});

test("bankroll dashboard is connected to navigation and uses a separate versioned store", () => {
  assert.ok(frontendSource.includes('id="bankrollView"'));
  assert.ok(frontendSource.includes('id="navBankroll"'));
  assert.ok(frontendSource.includes("const BANKROLL_KEY='tvs-bankroll-v1'"));
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
  assert.ok(frontendSource.includes("if(typeof value==='string'&&/^\\\\s*[=+@-]/.test(cell))"));
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
  assert.match(serviceWorkerSource, /tennis-value-static-v29/);
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
