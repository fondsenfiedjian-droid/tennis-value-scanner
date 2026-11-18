import test from "node:test";
import { TextEncoder } from "node:util";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const workerSource = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const frontendSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const archiveStart = frontendSource.indexOf("const ARCHIVE_KEY=");
const archiveEnd = frontendSource.indexOf("function renderArchive()", archiveStart);
const archiveSource = frontendSource.slice(archiveStart, archiveEnd);
const ratingDateStart = frontendSource.indexOf("function validRatingDate(");
const ratingDateEnd = frontendSource.indexOf("function isValidPredictionResult(", ratingDateStart);
const ratingDateSource = frontendSource.slice(ratingDateStart, ratingDateEnd);
function makeArchiveStore() {
  const data = {};
  const localStorage = {
    getItem: key => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; }
  };
  const sandbox = { localStorage, Date, Math, Number, String, JSON,
    matchDate: () => new Date("2026-11-20T12:00:00Z") };
  vm.runInNewContext(
    ratingDateSource + archiveSource + String.fromCharCode(10) + "globalThis.archiveFns = { readPredictionArchive, savePredictionSnapshot, mergePredictionArchive, applyVerifiedMatchResult, archiveResultStats, archiveOddsMovement, stampResultCheck };",
    sandbox
  );
  return sandbox.archiveFns;
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
    { player: "A", odds: 2.4, ev: 2.9 },
    { player: "B", odds: 1.8, ev: 20 },
    { player: "C", odds: 2.1, ev: 6 },
    { player: "D", odds: 2.2, ev: 4 }
  ];
  assert.equal(sandbox.select(bets, 3).player, "C");
  assert.equal(sandbox.select(bets, 7), null);
  assert.equal(sandbox.select(bets, 0).player, "C");
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
  assert.ok(frontendSource.includes("'ratingAsOf'"));
});

test("archive stores both priced player outcomes with calculated EV", () => {
  const { readPredictionArchive, savePredictionSnapshot } = makeArchiveStore();
  const match = { id: 123, tournament_name: "ATP Finals" };
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

test("archive import validates records, merges duplicates, and retains up to 3000 entries", () => {
  const { mergePredictionArchive } = makeArchiveStore();
  const row = { matchKey: "m1", side: "A", player: "Player A", opponent: "Player B",
    odds: 1.8, probability: 60, ev: 8, capturedAt: 1000, rating: 1800, ratingAsOf: "not-a-date" };
  const result = mergePredictionArchive([row], [row,
    { ...row, matchKey: "m2", capturedAt: 2000, ev: 999 },
    { ...row, odds: 1, matchKey: "bad" }]);
  assert.equal(result.added, 1);
  assert.equal(result.ignored, 1);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.find(item => item.matchKey === "m2").ev, 8);
  assert.equal(result.rows.find(item => item.matchKey === "m2").ratingAsOf, null);
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
    { matchId: 3, side: "A", odds: 1.50, capturedAt: 100 }
  ];
  const movement = archiveOddsMovement(rows);
  assert.equal(movement.shortened, 1);
  assert.equal(movement.drifted, 1);
  assert.equal(movement.comparable, 2);
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
