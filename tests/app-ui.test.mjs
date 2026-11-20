import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const extractMatchesStart = html.indexOf("function extractMatches(payload)");
const extractMatchesEnd = html.indexOf("function archiveMatchDate(m)", extractMatchesStart);
const extractMatchesSource = html.slice(extractMatchesStart, extractMatchesEnd);
function runExtractMatches(payload) {
  const sandbox = {};
  vm.runInNewContext(extractMatchesSource + "\nglobalThis.scheduleFns = { extractMatches, playerName, matchDate };", sandbox);
  return sandbox.scheduleFns;
}

const archiveCheckStart = html.indexOf("function selectArchiveResultCheckIds(rows,now=Date.now(),limit=10)");
const archiveCheckEnd = html.indexOf("function stampResultCheck", archiveCheckStart);
const archiveCheckSource = html.slice(archiveCheckStart, archiveCheckEnd);
function runSelectArchiveResultCheckIds(rows, now, limit=10) {
  const sandbox = {};
  vm.runInNewContext(archiveCheckSource + "\nglobalThis.selectArchiveResultCheckIds = selectArchiveResultCheckIds;", sandbox);
  return Array.from(sandbox.selectArchiveResultCheckIds(rows, now, limit));
}


const oddsMatchingStart = html.indexOf("function normalizePlayer(s)");
const oddsMatchingEnd = html.indexOf("function normalizeTour(value)", oddsMatchingStart);
const oddsMatchingSource = html.slice(oddsMatchingStart, oddsMatchingEnd);
function getOddsMatching(quotes) {
  const sandbox = {
    ODDS_FRESHNESS_MAX_AGE_MS: 6 * 60 * 60 * 1000,
    cachedOdds: quotes,
    playerName: value => String(value ?? ""),
    matchDate: match => new Date(match.startTime)
  };
  vm.runInNewContext(oddsMatchingSource + "\nglobalThis.oddsMatching = { oddsForMatch, oddsSideForPlayer };", sandbox);
  return sandbox.oddsMatching;
}
function makeWinamaxQuote(overrides = {}) {
  const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  return {
    bookmaker: "Winamax",
    bookmakerCountry: "FR",
    sport: "tennis",
    marketType: "match_winner",
    eventId: "event-1",
    eventName: "Carlos Alcaraz - Novak Djokovic",
    homeTeam: "Carlos Alcaraz",
    awayTeam: "Novak Djokovic",
    competition: "ATP Finals",
    startTime,
    scrapedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    oddsDecimal: 2.1,
    outcome: "home",
    ...overrides
  };
}

test("result checks retry pending matches every 30 minutes and settled matches daily", () => {
  const now = Date.parse("2026-11-20T12:00:00.000Z");
  const minutesAgo = minutes => now - minutes * 60 * 1000;
  const hoursAgo = hours => now - hours * 60 * 60 * 1000;
  const rows = [
    { matchId: "101", matchDate: new Date(hoursAgo(5)).toISOString(), resultCheckedAt: minutesAgo(31), resultOutcome: null },
    { matchId: "102", matchDate: new Date(hoursAgo(30)).toISOString(), resultCheckedAt: hoursAgo(23), resultOutcome: "completed" },
    { matchId: "103", matchDate: new Date(hoursAgo(30)).toISOString(), resultCheckedAt: hoursAgo(25), resultOutcome: "completed" },
    { matchId: "104", matchDate: new Date(hoursAgo(30)).toISOString(), resultCheckedAt: hoursAgo(25), resultOutcome: "cancelled" },
    { matchId: "105", matchDate: new Date(hoursAgo(30)).toISOString(), resultCheckedAt: hoursAgo(25), resultOutcome: "unresolved" }
  ];
  assert.deepEqual(runSelectArchiveResultCheckIds(rows, now), [103, 104, 105, 101]);
});

test("match cards expose current bookmaker odds without opening the details", () => {
  assert.match(html, /const oddsHtml=allMatched\.length\?/);
  assert.ok(html.includes(`class="match-bottom odds-visible">'+oddsHtml`));
  assert.match(html, /displayQuoteA\?'<b>1<\/b>/);
  assert.match(html, /displayQuoteB\?'<b>2<\/b>/);
});

test("EV calculation keeps the configured odds range separate from visible quotes", () => {
  assert.match(html, /const matched=allMatched\.filter\(o=>/);
  assert.match(html, /value>=minOdds&&value<=maxOdds/);
  assert.match(html, /const displayQuoteA=bestQuoteForSide\(allMatched,'1'\),displayQuoteB=bestQuoteForSide\(allMatched,'2'\)/);
  assert.match(html, /const oddsA=displayQuoteA\?Number\(displayQuoteA\.oddsDecimal\):null,oddsB=displayQuoteB\?Number\(displayQuoteB\.oddsDecimal\):null/);
  assert.match(html, /const selectedQuotes=\[displayQuoteA,displayQuoteB\]\.filter\(Boolean\)/);
});

test("prediction pre-check uses the same versioned surface cache key as prediction loading", () => {
  assert.match(html, /const key='tvs-elo-v3-'\+\(el\.dataset\.surface\|\|'unknown'\)\+'-'\+el\.dataset\.playerA\+'-'\+el\.dataset\.playerB/);
  assert.match(html, /const cacheKey='tvs-elo-v3-'\+\(el\.dataset\.surface\|\|'unknown'\)\+'-'\+idA\+'-'\+idB/);
});

test("app header reports real API state instead of claiming the schedule is always connected", () => {
  assert.match(html, /id="connectionStatus" role="status" aria-live="polite">ПРОВЕРКА API/);
  assert.match(html, /setConnectionStatus\('API: ОНЛАЙН'\)/);
  assert.match(html, /setConnectionStatus\('API НЕДОСТУПЕН'\)/);
  assert.match(html, /setConnectionStatus\('ОФЛАЙН · СОХРАНЁННЫЕ МАТЧИ'\)/);
});

test("odds status counts quote freshness from scrapedAt, not local fetch time", () => {
  assert.match(html, /function oddsFreshnessSummary\(now=Date\.now\(\)\)/);
  assert.match(html, /Date\.parse\(item\?\.scrapedAt\)/);
  assert.match(html, /now-value<=ODDS_FRESHNESS_MAX_AGE_MS/);
  assert.match(html, /const ODDS_FRESHNESS_MAX_AGE_MS=6\*60\*60\*1000/);
  assert.match(html, /ODDS_FRESHNESS_MAX_AGE_MINUTES=6\*60/);
  assert.match(html, /котировок не старше 6 ч из/);
  assert.match(html, /Котировки получены, но свежих нет/);
});

test("odds status distinguishes quote scrape time from upstream dataset retrieval time", () => {
  assert.match(html, /let oddsRetrievedAt = null/);
  assert.match(html, /Date\.parse\(payload\.retrievedAt\|\|'\'\)/);
  assert.match(html, /retrievedAt:oddsRetrievedAt/);
  assert.match(html, /источник получен/);
  assert.match(html, /время ответа источника неизвестно/);
  assert.equal((html.match(/\+sourceSeen/g)||[]).length, 4);
  assert.match(html, /let oddsTaskRun = null/);
  assert.match(html, /taskRun:oddsTaskRun/);
  assert.match(html, /запуск Apify/);
  assert.match(html, /oddsTaskRun\?\.scheduled\?'по расписанию'/);
});

test("manual and scheduled refresh bypass the recent schedule cache", () => {
  assert.match(html, /async function loadMatches\(force=false\)/);
  assert.match(html, /if\(!force&&saved&&Array\.isArray\(saved\.matches\).*isFreshCacheTimestamp\(saved\.savedAt,15\*60\*1000\)/);
  assert.match(html, /\$\('#refreshBtn'\)\.onclick=\(\)=>loadMatches\(true\)/);
  assert.match(html, /\$\('#navMatches'\)\.onclick=\(\)=>\{showMain\(\);loadMatches\(true\);\}/);
});

test("forced schedule refresh bypasses both browser and Worker caches", () => {
  assert.match(html, /fetchWithTimeout\(API\+'\/matches\?status=upcoming&draw=singles&limit=200'\+\(force\?'&fresh=true':''\)\)/);
});

test("schedule status reports whether Worker served a cache hit or fresh upstream response", () => {
  assert.match(html, /res\.headers\.get\('X-Data-Cache'\)/);
  assert.match(html, /'источник обновлён'/);
  assert.match(html, /'кэш Worker'/);
  assert.match(html, /'режим кэша неизвестен'/);
  assert.match(html, /Live Tennis API · '\+scheduleCacheLabel/);
});

test("saved match fallback cache validates timestamp age and rejects future timestamps", () => {
  assert.equal((html.match(/isFreshCacheTimestamp\(saved\.savedAt,ODDS_CACHE_TTL\)/g)||[]).length, 2);
  assert.doesNotMatch(html, /Date\.now\(\)-saved\.savedAt<=ODDS_CACHE_TTL/);
});

test("odds matching pairs both sides of the same Winamax event and maps reversed player order", () => {
  const home = makeWinamaxQuote({ outcome: "home", oddsDecimal: 2.1 });
  const away = makeWinamaxQuote({ outcome: "away", oddsDecimal: 1.8 });
  const matching = getOddsMatching([home, away]);
  const match = {
    player1: "Novak Djokovic",
    player2: "Carlos Alcaraz",
    startTime: home.startTime,
    tournament_name: "ATP Finals"
  };
  const selected = matching.oddsForMatch(match);
  assert.equal(selected.length, 2);
  assert.equal(matching.oddsSideForPlayer(selected.find(q => q.outcome === "home"), "Novak Djokovic"), "2");
  assert.equal(matching.oddsSideForPlayer(selected.find(q => q.outcome === "away"), "Novak Djokovic"), "1");
});

test("odds matching accepts common event-name separators and absent display labels", () => {
  for (const eventName of ["Carlos Alcaraz vs Novak Djokovic", "Carlos Alcaraz – Novak Djokovic", "Carlos Alcaraz — Novak Djokovic", "Carlos Alcaraz v Novak Djokovic", ""]) {
    const home = makeWinamaxQuote({ eventName, outcome: "home" });
    const away = { ...home, outcome: "away", oddsDecimal: 1.8 };
    const match = { player1: "Carlos Alcaraz", player2: "Novak Djokovic", startTime: home.startTime, tournament_name: "ATP Finals" };
    assert.equal(getOddsMatching([home, away]).oddsForMatch(match).length, 2, eventName || "empty eventName");
  }
});

test("odds matching rejects a parseable event label that conflicts with its team fields", () => {
  const home = makeWinamaxQuote({ eventName: "Carlos Alcaraz vs Jannik Sinner", outcome: "home" });
  const away = { ...home, outcome: "away", oddsDecimal: 1.8 };
  const match = { player1: "Carlos Alcaraz", player2: "Novak Djokovic", startTime: home.startTime, tournament_name: "ATP Finals" };
  assert.equal(getOddsMatching([home, away]).oddsForMatch(match).length, 0);
});

test("odds matching accepts reversed first and last name order", () => {
  const home = makeWinamaxQuote({
    homeTeam: "Djokovic Novak",
    awayTeam: "Alcaraz Carlos",
    eventName: "Djokovic Novak - Alcaraz Carlos",
    outcome: "home"
  });
  const away = { ...home, outcome: "away", oddsDecimal: 1.8 };
  const match = {
    player1: "Novak Djokovic",
    player2: "Carlos Alcaraz",
    startTime: home.startTime,
    tournament_name: "ATP Finals"
  };
  const matching = getOddsMatching([home, away]);
  const selected = matching.oddsForMatch(match);
  assert.equal(selected.length, 2);
  assert.equal(matching.oddsSideForPlayer(selected[0], "Novak Djokovic"), "1");
});

test("odds matching accepts a first-name initial but rejects conflicting full names", () => {
  const home = makeWinamaxQuote({
    homeTeam: "Carlos Alcaraz",
    awayTeam: "Jannik Sinner",
    eventName: "Carlos Alcaraz - Jannik Sinner",
    outcome: "home"
  });
  const away = { ...home, outcome: "away", oddsDecimal: 1.8 };
  const match = {
    player1: "Sinner J.",
    player2: "Alcaraz Carlos",
    startTime: home.startTime,
    tournament_name: "ATP Finals"
  };
  const matching = getOddsMatching([home, away]);
  const selected = matching.oddsForMatch(match);
  assert.equal(selected.length, 2);
  assert.equal(matching.oddsSideForPlayer(selected[0], "Sinner J."), "2");
  const conflicting = {
    ...match,
    player1: "John Sinner"
  };
  assert.equal(matching.oddsForMatch(conflicting).length, 0);
});

test("odds matching rejects quotes from different event IDs or mismatched competitions", () => {
  const home = makeWinamaxQuote({ outcome: "home" });
  const awayDifferentEvent = makeWinamaxQuote({ outcome: "away", eventId: "event-2" });
  const matching = getOddsMatching([home, awayDifferentEvent]);
  const match = {
    player1: "Novak Djokovic",
    player2: "Carlos Alcaraz",
    startTime: home.startTime,
    tournament_name: "ATP Finals"
  };
  assert.equal(matching.oddsForMatch(match).length, 0);
  const mismatched = getOddsMatching([
    home,
    makeWinamaxQuote({ outcome: "away", competition: "WTA Finals" })
  ]);
  assert.equal(mismatched.oddsForMatch(match).length, 0);
});

test("odds matching accepts quotes up to six hours old but still rejects older quotes and pairs more than 30 minutes apart", () => {
  const freshHome = makeWinamaxQuote({ outcome: "home" });
  const staleAway = makeWinamaxQuote({
    outcome: "away",
    scrapedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()
  });
  const match = {
    player1: "Novak Djokovic",
    player2: "Carlos Alcaraz",
    startTime: freshHome.startTime,
    tournament_name: "ATP Finals"
  };
  assert.equal(getOddsMatching([freshHome, staleAway]).oddsForMatch(match).length, 0);
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const sixHourHome = makeWinamaxQuote({ outcome: "home", scrapedAt: fiveHoursAgo });
  const sixHourAway = makeWinamaxQuote({ outcome: "away", scrapedAt: fiveHoursAgo });
  assert.equal(getOddsMatching([sixHourHome, sixHourAway]).oddsForMatch(match).length, 2);
  const skewedAway = makeWinamaxQuote({
    outcome: "away",
    scrapedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString()
  });
  assert.equal(getOddsMatching([freshHome, skewedAway]).oddsForMatch(match).length, 0);
});

test("valid empty match schedules are distinct from malformed API payloads", () => {
  assert.deepEqual(Array.from(runExtractMatches([]).extractMatches([])), []);
  assert.deepEqual(Array.from(runExtractMatches({ matches: [] }).extractMatches({ matches: [] })), []);
  assert.deepEqual(Array.from(runExtractMatches({ data: { results: [] } }).extractMatches({ data: { results: [] } })), []);
  assert.equal(runExtractMatches({ error: "upstream failed" }).extractMatches({ error: "upstream failed" }), null);
  assert.equal(runExtractMatches(null).extractMatches(null), null);
  const match = { players: { p1: "Player A", p2: "Player B" } };
  assert.deepEqual(Array.from(runExtractMatches({ matches: [match] }).extractMatches({ matches: [match] })), [match]);
});

test("empty valid schedules are cached and can be reused or shown offline", () => {
  assert.match(html, /if\(!force&&saved&&Array\.isArray\(saved\.matches\)&&isFreshCacheTimestamp/);
  assert.match(html, /if\(saved&&Array\.isArray\(saved\.matches\)\)/);
  assert.match(html, /if\(matches===null\)throw new Error/);
  assert.doesNotMatch(html, /if\(!matches\.length\)throw new Error/);
});

test("official Live Tennis upcoming-match shape is parsed with UTC scheduled_time", () => {
  const api = runExtractMatches(null);
  const payload = {
    data: [{
      id: 18953,
      tournament: "ATP Wimbledon",
      tour: "atp",
      surface: "grass",
      round: "R16",
      status: "upcoming",
      scheduled_time: "2026-11-20T10:00:00Z",
      players: {
        p1: { name: "Player One" },
        p2: { name: "Player Two" }
      }
    }],
    meta: { count: 1, total: 1 }
  };
  const matches = api.extractMatches(payload);
  assert.equal(matches.length, 1);
  assert.equal(api.playerName(matches[0].players.p1), "Player One");
  assert.equal(api.playerName(matches[0].players.p2), "Player Two");
  assert.equal(api.matchDate(matches[0]).toISOString(), "2026-11-20T10:00:00.000Z");
});

test("settings apply a selected skin immediately, persist it on Save, and restore it on Cancel", () => {
  const saveStart = html.indexOf("$('#saveSettings').onclick=");
  const saveEnd = html.indexOf("const API=", saveStart);
  const settingsSource = html.slice(html.indexOf("const modal=$('#settingsModal')"), saveEnd);
  assert.match(settingsSource, /\$\('#skinSelect'\)\.addEventListener\('change',\(\)=>applySkin\(\$\('#skinSelect'\)\.value\)\)/);
  assert.match(settingsSource, /activeSkin=data\.skin;\s*applySkin\(activeSkin\);/);
  assert.match(settingsSource, /const cancelSettings=\(\)=>\{applySkin\(activeSkin\);\$\('#skinSelect'\)\.value=activeSkin;close\(\);\}/);
  assert.match(settingsSource, /localStorage\.setItem\('tvs-settings',JSON\.stringify\(data\)\)/);
  assert.ok(saveStart >= 0);
});

test("service worker cache version advances when settings behavior changes", () => {
  assert.match(serviceWorker, /CACHE_NAME = "tennis-value-static-v119"/);
});

test("settings form reloads persisted values whenever opened and verifies every saved threshold", () => {
  const openAt=html.indexOf("const open=()=>{populateSettingsForm();modal.classList.add('show');};");
  const populateAt=html.indexOf("function populateSettingsForm()");
  const saveAt=html.indexOf("const savedAgain=readSettings();");
  assert.ok(openAt>0&&populateAt>0&&saveAt>0);
  assert.match(html.slice(populateAt,openAt), /\['minEv','minOdds','maxOdds','bestBetMinOdds'\]/);
  assert.match(html.slice(saveAt,saveAt+550), /Number\(savedAgain\.minEv\)!==minEv/);
});

test("Winamax empty-state diagnostics expose upstream dataset coverage", () => {
  assert.match(html, /function oddsDiagnosticsText\(\)/);
  assert.match(html, /validDecimalOdds/);
  assert.match(html, /freshScrapedAt/);
  assert.match(html, /diagnostics:oddsDiagnostics/);
});


test("frontend API requests have a bounded timeout and clear their timer", () => {
  assert.match(html, /async function fetchWithTimeout/);
  assert.match(html, /setTimeout\(\(\)=>controller\.abort\(\),timeoutMs\)/);
  assert.match(html, /signal:controller\.signal/);
  assert.match(html, /Превышено время ожидания API/);
  assert.match(html, /finally\{clearTimeout\(timer\);?\}/);
  for (const route of ["/odds", "/matches", "/result", "/player-stats", "/predict"]) {
    assert.ok(html.includes("fetchWithTimeout(API+'"+route), "route "+route+" must use the timeout wrapper");
  }
});


test("best bet of the day prioritizes validated reliability and opens its match from the whole feature card", () => {
  assert.match(html, /id="bestBet" class="best-bet" role="button" tabindex="0"/);
  assert.match(html, /СТАВКА ДНЯ/);
  assert.match(html, /best-bet-odds/);
  assert.match(html, /best-bet-pair/);
  assert.match(html, /reliabilityEligible===true/);
  assert.match(html, /reliabilityScore>=85/);
  assert.match(html, /calibrationReady=reliability\.calibrationIncluded===true/);
  assert.match(html, /\.sort\(\(a,b\)=>b\.reliabilityScore-a\.reliabilityScore\|\|b\.probability-a\.probability\|\|b\.ev-a\.ev\)/);
  assert.match(html, /box\.onclick=openDetails/);
  assert.match(html, /box\.onkeydown=/);
  assert.match(html, /card\.scrollIntoView\(\{behavior:'smooth',block:'center'\}\)/);
  assert.match(html, /const highest=selectHighestEvBet\(evBets\)/);
  assert.match(html, /x\.reliabilityScore>=65/);
  assert.match(html, /x\.valueEligible===true/);
  assert.match(html, /Качество данных:/);
  assert.match(html, /EV — оценка модели, а не гарантия прибыли/);
  assert.match(html, /\.sort\(\(a,b\)=>b\.ev-a\.ev\|\|b\.reliabilityScore-a\.reliabilityScore\|\|b\.probability-a\.probability\)/);
  assert.match(html, /id="highestEv" class="best-bet highest-ev"/);
});

test("bankroll tab and assets are fully removed from the application shell", () => {
  for (const obsolete of ["bankrollView", "navBankroll", "bankroll.js", "winamax-import.js", "TVSBankroll", "Банкролл"]) {
    assert.ok(!html.includes(obsolete), "application must not contain "+obsolete);
    assert.ok(!serviceWorker.includes(obsolete), "service worker must not cache "+obsolete);
  }
  assert.match(html, /id="navHome"/);
  assert.match(html, /id="navStats"/);
});
