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

const recommendationStart = html.indexOf("function selectBestBets(");
const recommendationEnd = html.indexOf("function renderBestBet(", recommendationStart);
const recommendationSource = html.slice(recommendationStart, recommendationEnd);
function runSelectBestBet(bets, minEv=3, minOdds=1.9) {
  const sandbox = {};
  vm.runInNewContext(recommendationSource + "\nglobalThis.selectBestBet = selectBestBet; globalThis.selectBestBets = selectBestBets;", sandbox);
  return sandbox.selectBestBet(bets, minEv, minOdds);
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


test("daily plan financial summary never invents stake size, bankroll or exposure", () => {
  assert.match(html, /class="plan-summary"/);
  assert.match(html, /id="planMandatoryCount"/);
  assert.match(html, /id="planStakeTotal">—/);
  assert.match(html, /не рассчитана/);
  assert.match(html, /id="planExposure">—/);
  assert.match(html, /банк не задан/);
  assert.match(html, /mandatoryCount\.textContent=String\(bestBets\.length\)/);
  assert.match(html, /id="planUpdated"/);
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
  assert.match(html, /id="connectionStatus" role="status" aria-live="polite">API: ПРОВЕРКА/);
  assert.match(html, /setConnectionStatus\(scheduleResult\.hasMore/);
  assert.match(html, /РАСПИСАНИЕ ЧАСТИЧНО/);
  assert.match(html, /Live Tennis API · '\+scheduleCacheLabel\+' · '\+matches\.length\+' матчей/);
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
  assert.equal((html.match(/\+sourceSeen/g)||[]).length, 2);
  assert.match(html, /let oddsTaskRun = null/);
  assert.match(html, /taskRun:oddsTaskRun/);
  assert.match(html, /запуск Apify/);
  assert.match(html, /oddsTaskRun\?\.scheduled\?'по расписанию'/);
});

test("manual and scheduled refresh bypass the recent schedule cache", () => {
  assert.match(html, /async function loadMatches\(force=false\)/);
  assert.match(html, /if\(!force&&saved&&Array\.isArray\(saved\.matches\).*isFreshCacheTimestamp\(saved\.savedAt,15\*60\*1000\)/);
  assert.match(html, /\$\('#refreshBtn'\)\.onclick=\(\)=>loadMatches\(true\)/);
  assert.match(html, /\$\('#topUpcoming'\)\.onclick=showUpcoming;/);
  assert.match(html, /\$\('#topTomorrow'\)\.onclick=showTomorrow;/);
});

test("schedule request includes a rolling seven-day date window and bypasses legacy unscoped cache", () => {
  const start = html.indexOf("function buildScheduleDateParams(");
  const end = html.indexOf("async function fetchUpcomingSchedule(force=false)", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(html.slice(start, end) + "\nglobalThis.buildScheduleDateParams = buildScheduleDateParams;", sandbox);
  const now = new Date("2026-11-22T12:34:56.000Z");
  const params = new URLSearchParams(sandbox.buildScheduleDateParams(now));
  const expectedFrom = new Date(now); expectedFrom.setHours(0,0,0,0);
  const expectedTo = new Date(expectedFrom); expectedTo.setDate(expectedTo.getDate()+7); expectedTo.setMilliseconds(-1);
  assert.equal(params.get("from"), expectedFrom.toISOString());
  assert.equal(params.get("to"), expectedTo.toISOString());
  assert.match(html, /new URLSearchParams\('status=upcoming&draw=singles&limit=200&'\+buildScheduleDateParams\(\)\)/);
  assert.match(html, /params\.set\('offset',String\(offset\)\)/);
  assert.match(html, /if\(force\)baseParams\.set\('fresh','true'\)/);
  assert.match(html, /localStorage\.getItem\('tvs-match-cache-v3'\)/);
  assert.match(html, /localStorage\.setItem\('tvs-match-cache-v3'/);
});

test("schedule status reports whether Worker served a cache hit or fresh upstream response", () => {
  assert.match(html, /response\.headers\.get\('X-Data-Cache'\)/);
  assert.match(html, /cacheMiss\?'MISS':'HIT'/);
  assert.match(html, /'источник обновлён'/);
  assert.match(html, /'кэш Worker'/);
  assert.match(html, /Live Tennis API · '\+scheduleCacheLabel\+' · '\+matches\.length\+' матчей/);
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

test("end-to-end schedule pipeline keeps official upcoming singles and diagnoses missing start times", () => {
  const api = runExtractMatches(null);
  const payload = {
    data: [
      {
        id: 223582,
        draw: "singles",
        gender: "women",
        status: "upcoming",
        scheduled_time: "2026-11-22T14:00:00Z",
        created_at: "2026-11-21T16:01:55.828190Z",
        players: { p1: { id: 1, name: "Player One" }, p2: { id: 2, name: "Player Two" } }
      },
      {
        id: 223583,
        draw: "singles",
        gender: "men",
        status: "upcoming",
        scheduled_time: null,
        created_at: "2026-11-21T16:02:00.000Z",
        players: { p1: { id: 3, name: "Player Three" }, p2: { id: 4, name: "Player Four" } }
      }
    ],
    meta: { count: 2, total: 2 }
  };
  const matches = api.extractMatches(payload);
  assert.equal(matches.length, 2);
  assert.equal(api.matchDate(matches[0]).toISOString(), "2026-11-22T14:00:00.000Z");
  assert.equal(api.matchDate(matches[1]), null);

  const filterStart = html.indexOf("function normalizeTour(value)");
  const filterEnd = html.indexOf("let predictionRenderId=0;", filterStart);
  const sandbox = { matchDate: api.matchDate };
  vm.runInNewContext(
    html.slice(filterStart, filterEnd) +
      "\nglobalThis.schedulePipeline = { matchTour, filterScheduleMatches };",
    sandbox
  );
  const pipeline = sandbox.schedulePipeline;
  assert.equal(pipeline.matchTour(matches[0]), "wta");
  assert.equal(pipeline.matchTour(matches[1]), "atp");
  const today = pipeline.filterScheduleMatches(
    matches, "today", ["atp", "wta", "challenger", "itf"], new Date("2026-11-22T12:00:00")
  );
  assert.equal(today.total, 2);
  assert.equal(today.afterTour, 2);
  assert.equal(today.withDate, 1);
  assert.equal(today.withoutDate, 1);
  assert.equal(today.matches.length, 1);
  const all = pipeline.filterScheduleMatches(
    matches, "all", ["atp", "wta", "challenger", "itf"], new Date("2026-11-22T12:00:00")
  );
  assert.equal(all.matches.length, 2);
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
  assert.match(html, /if\(pageRows===null\)throw new Error/);
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

test("settings preview changes are committed only by Save and Cancel restores saved values", () => {
  const saveStart = html.indexOf("$('#saveSettings').onclick=");
  const saveEnd = html.indexOf("const API=", saveStart);
  const settingsSource = html.slice(html.indexOf("const modal=$('#settingsModal')"), saveEnd);
  const skinChangeStart=settingsSource.indexOf("$('#skinSelect').addEventListener('change'");
  const skinChangeEnd=settingsSource.indexOf("['minEv','minOdds','maxOdds','bestBetMinOdds']",skinChangeStart);
  const skinChange=settingsSource.slice(skinChangeStart,skinChangeEnd);
  assert.match(skinChange, /applySkin\(selected\)/);
  assert.doesNotMatch(skinChange, /localStorage\.setItem|activeSkin=selected/);
  assert.match(settingsSource, /const cancelSettings=\(\)=>\{populateSettingsForm\(\);applySkin\(activeSkin\)/);
  assert.match(settingsSource, /data\.skin=\['black','steel','neon','terracotta'\]\.includes\(\$\('#skinSelect'\)\.value\)\?\$\('#skinSelect'\)\.value:'terracotta'/);
  assert.match(settingsSource, /const tours=selectedTours\(\)/);
  assert.match(settingsSource, /if\(!tours\.length\)/);
  assert.match(settingsSource, /Выбери хотя бы один турнир/);
  assert.match(settingsSource, /data\.tours=tours/);
  assert.match(settingsSource, /localStorage\.setItem\('tvs-settings',JSON\.stringify\(data\)\)/);
  assert.match(settingsSource, /Tournament filters are previewed while the modal is open and committed only by Save/);
  assert.match(settingsSource, /tourChecks\.forEach\(input=>input\.addEventListener\('change',\(\)=>\{if\(window\.cachedMatches\)renderMatches\(window\.cachedMatches\);\}\)\)/);
  assert.ok(saveStart >= 0);
});

test("service worker cache version advances when settings behavior changes", () => {
  assert.match(serviceWorker, /CACHE_NAME = "tennis-value-static-v135"/);
});

test("settings form reloads persisted values whenever opened and verifies every saved threshold", () => {
  const openAt=html.indexOf("const open=()=>{populateSettingsForm();modal.classList.add('show');};");
  const populateAt=html.indexOf("function populateSettingsForm()");
  const saveAt=html.indexOf("const savedAgain=readSettings();");
  assert.ok(openAt>0&&populateAt>0&&saveAt>0);
  assert.match(html.slice(populateAt,openAt), /const defaults=\{minEv:3,minOdds:1\.9,maxOdds:5,bestBetMinOdds:1\.5\}/);
  assert.match(html.slice(populateAt,openAt), /Object\.entries\(defaults\)/);
  assert.match(html.slice(saveAt,saveAt+550), /Number\(savedAgain\.minEv\)!==minEv/);
  assert.match(html, /JSON\.stringify\(savedTourValues\)!==JSON\.stringify\(expectedTourValues\)/);
  assert.match(html, /кэф «Ставки дня» — 1\.50–15/);
});

test("Winamax empty-state diagnostics expose upstream dataset coverage", () => {
  assert.match(html, /function oddsDiagnosticsText\(\)/);
  assert.match(html, /validDecimalOdds/);
  assert.match(html, /freshScrapedAt/);
  assert.match(html, /diagnostics:oddsDiagnostics/);
});


test("frontend API requests have a bounded timeout and clear their timer", () => {
  assert.match(html, /async function fetchWithTimeout/);
  assert.match(html, /timer=setTimeout\(\(\)=>\{/);
  assert.match(html, /controller\.abort\(\)/);
  assert.match(html, /signal:controller\.signal/);
  assert.match(html, /Превышено время ожидания API/);
  assert.match(html, /Promise\.race\(\[response\.text\(\),timeout\]\)/);
  assert.match(html, /finally\{\s*clearTimeout\(timer\);?\s*\}/);
  for (const route of ["/odds", "/matches", "/result", "/player-stats", "/predict"]) {
    assert.ok(html.includes("fetchWithTimeout(API+'"+route), "route "+route+" must use the timeout wrapper");
  }
});


test("Bet of the Day enforces the full odds range and valid model probability", () => {
  const valid = {
    ev: 8, odds: 2.2, probability: 72, reliabilityEligible: true,
    reliabilityScore: 91, freshnessLevel: "good", valueEligible: true
  };
  assert.equal(runSelectBestBet([valid], 3, 1.5)?.odds, 2.2);
  assert.equal(runSelectBestBet([{ ...valid, odds: 15 }], 3, 1.5)?.odds, 15);
  assert.equal(runSelectBestBet([{ ...valid, odds: 15.01 }], 3, 1.5), null);
  assert.equal(runSelectBestBet([{ ...valid, odds: 1.49 }], 3, 1.5), null);
  assert.equal(runSelectBestBet([{ ...valid, probability: 0 }], 3, 1.5), null);
  assert.equal(runSelectBestBet([{ ...valid, probability: 100.01 }], 3, 1.5), null);
  assert.equal(runSelectBestBet([{ ...valid, probability: Number.NaN }], 3, 1.5), null);
});

test("strict recommendations return the full reliability-ranked list for manual carousel navigation",()=>{
  const base={ev:6,odds:2.4,probability:71,reliabilityEligible:true,reliabilityScore:91,freshnessLevel:"good",valueEligible:true};
  const lower={...base,ev:12,probability:66,reliabilityScore:88,player:"Player B"};
  const higher={...base,ev:4,probability:74,reliabilityScore:95,player:"Player A"};
  const blocked={...base,reliabilityScore:84,player:"Blocked"};
  const sandbox={};
  vm.runInNewContext(recommendationSource+"\nglobalThis.selectBestBets=selectBestBets;",sandbox);
  const selected=sandbox.selectBestBets([lower,blocked,higher],3,1.9);
  assert.deepEqual(Array.from(selected).map(x=>x.player),["Player A","Player B"]);
  assert.equal(selected.length,2);
});

test("daily-pick carousel rotates only qualifying bets and never substitutes ordinary matches",()=>{
  assert.match(html,/id="bestBetPrev"/);
  assert.match(html,/id="bestBetNext"/);
  assert.match(html,/bestBetCarouselKey/);
  assert.match(html,/bestBetCarouselTimer=setInterval/);
  assert.match(html,/},9000\)/);
  assert.match(html,/Сегодня нет ставок, прошедших строгий отбор\. Матчи без рекомендации здесь не показываются/);
  assert.doesNotMatch(html,/const shownFeatured=startFeaturedMatchCarousel\(\)/);
  assert.match(html,/[Рр]азмер ставки не рассчитан/);
  assert.match(html,/aria-label="Ставка дня"/);
});

test("mandatory recommendations and additional opportunities are separate plan tiers", () => {
  assert.match(html, /id="bestBet" class="best-bet daily-pick" role="region" aria-label="Ставка дня"/);
  assert.match(html, /function selectBestBets\(/);
  assert.match(html, /reliabilityEligible===true/);
  assert.match(html, /reliabilityScore>=85/);
  assert.match(html, /freshnessLevel==='good'/);
  assert.match(html, /valueEligible===true/);
  assert.match(html, /id="additionalOpportunities"/);
  assert.match(html, /Дополнительные возможности/);
  assert.match(html, /Почему пока не в основном плане/);
  assert.match(html, /EV ниже установленного порога/);
  assert.match(html, /котировка недостаточно свежая/);
  assert.match(html, /не пройдена проверка качества value-сигнала/);
  assert.match(html, /не завершена строгая калибровка и независимое подтверждение/);
  assert.match(html, /[Мм]одель ещё не вернула проверенную вероятность/);
  assert.match(html, /id="additionalCount"/);
  assert.doesNotMatch(html, /EV ДНЯ · РИСКОВЫЙ ШАНС/);
  assert.doesNotMatch(html, /id="highestEv"/);
});


test("approved bottom navigation contains Balance, History, Statistics and Settings",()=>{
  for(const id of ["navBalance","navHistory","navStats","navSettings"])assert.match(html,new RegExp('id="'+id+'"'));
  for(const id of ["balanceView","historyView","statsView","settingsView"])assert.match(html,new RegExp(id));
  assert.match(html,/function showBalance\(\)/);
  assert.match(html,/function showHistory\(\)/);
  assert.match(html,/function showStats\(\)/);
  assert.match(html,/function showSettingsScreen\(\)/);
  assert.match(html,/id="moreArchiveMount"/);
  assert.match(html,/id="mandatoryBetsContent"/);
  assert.doesNotMatch(html,/id="navMore"/);
});


test("home screen follows the approved daily-pick reference order",()=>{
  const home=html.slice(html.indexOf('<div class="app">'),html.indexOf('<div class="compare-view"'));
  assert.ok(home.indexOf('id="bestBet"')<home.indexOf('class="plan-summary"'));
  assert.ok(home.indexOf('class="plan-summary"')<home.indexOf('id="mandatoryBets"'));
  assert.ok(home.indexOf('id="mandatoryBets"')<home.indexOf('id="additionalOpportunities"'));
  assert.ok(home.indexOf('id="additionalOpportunities"')<home.indexOf('class="quick-links"'));
  assert.match(home,/data-day="today"/);
  assert.match(home,/data-day="tomorrow"/);
  assert.match(home,/data-day="all"/);
  assert.match(home,/СТАВКА ДНЯ/);
  assert.match(html,/selected\?\.photo_url\|\|selected\?\.image_url/);
});


test("player comparison does not expose a match simulator",()=>{
  assert.doesNotMatch(html,/Сценарная симуляция BO|Симуляция не запускалась|simulationLabel|pfeScoreSimulation/);
});

test("independent player comparison calls the current Elo API and displays both players",()=>{
  assert.match(html,/id="compareNameA"/);
  assert.match(html,/id="compareNameB"/);
  assert.match(html,/id="compareIdA"/);
  assert.match(html,/id="compareIdB"/);
  assert.equal((html.match(/class="compare-manual-id"/g)||[]).length,2);
  assert.match(html,/Ручной ввод ID \(если поиск не сработал\)/);
  assert.match(html,/compare-manual-id summary/);
  assert.match(html,/function findScheduledPlayerId\(name\)/);
  assert.match(html,/API\+'\/predict'/);
  assert.match(html,/playerIdA:idA,playerIdB:idB,playerA:nameA,playerB:nameB,surface/);
  assert.match(html,/function renderCompareResult\(result,nameA,nameB,surface\)/);
  assert.match(html,/вероятность победы/);
  assert.match(html,/Справедливый кэф/);
  assert.match(html,/Травмы, форма, H2H и статистика подачи пока не входят/);
});
test("virtual balance and history are local simulation screens, not real-money tools", () => {
  assert.match(html, /balance\.id='balanceView'/);
  assert.match(html, /history\.id='historyView'/);
  assert.match(html, /tvs-virtual-bank-v1/);
  assert.match(html, /Стартовый капитал: 1 000 €/);
  assert.match(html, /Реальные деньги не используются/);
  assert.doesNotMatch(html, /банкролл|Банкролл/);
  assert.match(html, /id="navBalance"/);
  assert.match(html, /id="navHistory"/);
});


test("archive result checker reports status counts without removed bankroll references", () => {
  const start = html.indexOf("$('#archiveCheckResults').onclick=async()=>{");
  const end = html.indexOf("$('#archiveExport').onclick", start);
  assert.ok(start >= 0 && end > start);
  const handler = html.slice(start, end);
  assert.match(handler, /let checked=0,errors=0,statusesUpdated=0/);
  assert.match(handler, /statusesUpdated\+\+/);
  assert.match(handler, /Получены статусы:/);
  assert.doesNotMatch(handler, /\bsettled\+\+/);
  assert.doesNotMatch(handler, /bankrollUpdates/);
});


test("calibration for the active model excludes snapshots from other model versions", () => {
  const start = html.indexOf("const CURRENT_CALIBRATION_MODEL_VERSION='2';");
  const end = html.indexOf("function archiveSegmentCalibration", start);
  assert.ok(start >= 0 && end > start);
  const source = html.slice(start, end);
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.calibration = archiveProbabilityCalibration;", sandbox);
  const matchDate = Date.parse("2026-11-25T12:00:00.000Z");
  const rows = [
    { matchId: 501, side: "A", probability: 90, capturedAt: Date.parse("2026-11-20T10:00:00.000Z"), matchDate: new Date(matchDate).toISOString(), captureStatus: "upcoming", resultOutcome: "completed", resultWinner: 1, resultVersion: 1, modelVersion: "2" },
    { matchId: 502, side: "A", probability: 10, capturedAt: Date.parse("2026-11-20T10:00:00.000Z"), matchDate: new Date(matchDate).toISOString(), captureStatus: "upcoming", resultOutcome: "completed", resultWinner: 1, resultVersion: 1, modelVersion: "1" },
    { matchId: 503, side: "A", probability: 95, capturedAt: Date.parse("2026-11-20T10:00:00.000Z"), matchDate: new Date(matchDate).toISOString(), captureStatus: "upcoming", resultOutcome: "completed", resultWinner: 1, resultVersion: 1 }
  ];
  const current = sandbox.calibration(rows, 30, "2");
  assert.equal(current.sampleSize, 1);
  assert.equal(current.modelVersion, "2");
  assert.equal(current.excludedOtherVersions, 2);
  assert.ok(Math.abs(current.brierScore - 0.01) < 1e-12);
  const historical = sandbox.calibration(rows);
  assert.equal(historical.sampleSize, 3);
  assert.equal(historical.modelVersion, null);
});

test("reliability calibration and segment diagnostics use only the active model version", () => {
  assert.match(html, /const CURRENT_CALIBRATION_MODEL_VERSION='2'/);
  assert.match(html, /calibration:archiveProbabilityCalibration\(readPredictionArchive\(\),30,CURRENT_CALIBRATION_MODEL_VERSION\)/);
  assert.match(html, /const calibration=archiveProbabilityCalibration\(rows,30,CURRENT_CALIBRATION_MODEL_VERSION\)/);
  assert.match(html, /archiveSegmentCalibration\(rows,group=>archiveProbabilityCalibration\(group,30,CURRENT_CALIBRATION_MODEL_VERSION\)\)/);
  assert.match(html, /снимки других версий модели исключены/);
});


test("calibration rejects a snapshot captured after an earlier scheduled start despite a later reschedule", () => {
  const start = html.indexOf("const CURRENT_CALIBRATION_MODEL_VERSION='2';");
  const end = html.indexOf("function archiveSegmentCalibration", start);
  assert.ok(start >= 0 && end > start);
  const source = html.slice(start, end);
  const sandbox = {};
  vm.runInNewContext(source + "\nglobalThis.calibration = archiveProbabilityCalibration;", sandbox);
  const rows = [
    { matchId: 801, side: "A", probability: 70, capturedAt: Date.parse("2026-11-20T11:00:00.000Z"), matchDate: "2026-11-20T10:00:00.000Z", captureStatus: "live", resultOutcome: "completed", resultWinner: 1, resultVersion: 1, modelVersion: "2" },
    { matchId: 801, side: "A", probability: 80, capturedAt: Date.parse("2026-11-20T11:30:00.000Z"), matchDate: "2026-11-20T13:00:00.000Z", captureStatus: "upcoming", resultOutcome: "completed", resultWinner: 1, resultVersion: 1, modelVersion: "2" }
  ];
  const calibration = sandbox.calibration(rows, 1, "2");
  assert.equal(calibration.sampleSize, 0);
  assert.equal(calibration.postStart, 1);
});

test("match list keeps all scheduled matches visible and labels fresh quote-pair status", () => {
  assert.match(html, /function filterScheduleMatches\(all,day='today'/);
  assert.match(html, /const winnerButton=\$\('\[data-market="winner"\]'\);[\s\S]*const winnerEnabled=!winnerButton\|\|winnerButton\.classList\.contains\('on'\)/);
  assert.match(html, /const schedule=filterScheduleMatches\(all,selectedDay,selectedTours\(\),new Date\(\)\)/);
  assert.match(html, /const filtered=schedule\.matches/);
  assert.match(html, /const completePairCount=filtered\.filter\(m=>winnerEnabled&&oddsForMatch\(m\)\.length>=2\)\.length/);
  assert.match(html, /const allMatched=winnerEnabled\?oddsForMatch\(m\):\[\]/);
  assert.match(html, /Полная свежая пара/);
  assert.match(html, /Неполная пара · найден 1 исход/);
  assert.match(html, /Нет свежей полной пары/);
  assert.match(html, /class="match-quote-status /);
  assert.match(html, /Получено от API:/);
  assert.match(html, /Без даты начала:/);
});

test("optional player statistics are not fetched during automatic prediction scans", () => {
  assert.equal(html.split("loadPfePlayerStats(").length - 1, 1,
    "the player-statistics loader must remain defined but must not be called automatically");
  assert.ok(html.includes("const deferredPlayerStats={accessStatus:'not_requested',recent:null,serve:null}"));
  assert.ok(html.includes("not_requested:'не запрашивалась автоматически (экономия квоты)'"));
});


test("additional opportunities preserve bookmaker pair when prediction calculation fails", () => {
  assert.match(html, /const oddsFallback=matches\.map\(\(m,i\)=>/);
  assert.match(html, /Коэффициенты Winamax:/);
  assert.match(html, /[Мм]одель ещё не вернула проверенную вероятность/);
  assert.match(html, /additionalFallbackOpen/);
  assert.match(html, /quote\.matchIndex/);
  assert.match(html, /renderBestBet\(dayBets,checked,totalCandidates,failed,evDayBets,oddsFallback\)/);
});

test("minimum EV setting gates mandatory recommendations while lower positive EV remains watchlist eligible",()=>{
  assert.match(html,/Минимальный EV для «Ставки дня», %/);
  assert.match(html,/selectBestBets\(bets,filters\.minEv,/);
  assert.match(html,/if\(oddsInRange&&Number\.isFinite\(bet\.ev\)&&bet\.ev>0\)evDayBets\.push\(bet\)/);
  assert.match(html,/if\(oddsInRange&&bet\.odds>=1\.9&&Number\.isFinite\(bet\.ev\)&&bet\.ev>0\)dayBets\.push\(bet\)/);
  assert.match(html,/if\(bet\.ev<filters\.minEv\)reasons\.push\('EV ниже установленного порога/);
});




test("minimum EV setting is exclusive to Bet of the Day",()=>{
  assert.match(html,/Минимальный EV для «Ставки дня», %/);
  assert.match(html,/selectBestBet\(bets,filters\.minEv,/);
  assert.match(html,/selectHighestEvBet\(evBets,filters\.minOdds,filters\.maxOdds\)/);
  assert.match(html,/if\(oddsInRange&&Number\.isFinite\(bet\.ev\)&&bet\.ev>0\)evDayBets\.push\(bet\)/);
  assert.match(html,/if\(oddsInRange&&bet\.odds>=1\.9&&Number\.isFinite\(bet\.ev\)&&bet\.ev>0\)dayBets\.push\(bet\)/);
  assert.match(html,/result\.evA!==null&&result\.evA>0&&valueGateA\.eligible\?'model-positive'/);
  assert.match(html,/if\(valueGateA\.eligible&&result\.evA!==null&&result\.evA>0\)positive\+\+/);
});

test("skin selection previews immediately but persists only after Save",()=>{
  assert.match(html,/document\.body\.dataset\.skin=selected/);
  assert.match(html,/document\.documentElement\.dataset\.skin=selected/);
  assert.match(html,/Стальной синий · холодные акценты/);
  assert.match(html,/Music Play Bar Control · графит, зелёный, терракота/);
  assert.match(html,/let activeSkin=\['black','steel','neon','terracotta'\]\.includes\(saved\.skin\)\?saved\.skin:'terracotta'/);
  assert.match(html,/if\(saved\.skin==='black'&&saved\.musicPaletteDefaultApplied!==true\)/);
  assert.match(html,/data\.musicPaletteDefaultApplied=true/);
  assert.doesNotMatch(html,/Steel Emerald|сталь и изумруд/);
  const start=html.indexOf("$('#skinSelect').addEventListener('change'");
  const end=html.indexOf("['minEv','minOdds','maxOdds','bestBetMinOdds']",start);
  const preview=html.slice(start,end);
  assert.match(preview,/applySkin\(selected\)/);
  assert.doesNotMatch(preview,/localStorage\.setItem|activeSkin=selected/);
  assert.match(html,/data\.skin=\['black','steel','neon','terracotta'\]\.includes\(\$\('#skinSelect'\)\.value\)\?\$\('#skinSelect'\)\.value:'terracotta'/);
  assert.match(html,/localStorage\.setItem\('tvs-settings',JSON\.stringify\(data\)\)/);
});

test("BASIC comparison history derives last-five, recent form and surface splits by participant ID",()=>{
  const start=html.indexOf("function deriveCompareHistory(");
  const end=html.indexOf("function renderCompareHistory(",start);
  assert.ok(start>=0&&end>start);
  const sandbox={};
  vm.runInNewContext(html.slice(start,end)+"\nglobalThis.derive=deriveCompareHistory;",sandbox);
  const payload={source:"Live Tennis API /history/matches",period:"2023-present",data:[
    {id:1,scheduled_time:"2026-05-03T12:00:00Z",players:{p1:{id:10,name:"A"},p2:{id:20,name:"B"}},winner:1,surface:"hard",score:{sets:[2,0],games:[[6,6],[3,4]]}},
    {id:2,scheduled_time:"2026-05-02T12:00:00Z",players:{p1:{id:20,name:"B"},p2:{id:10,name:"A"}},winner:1,surface:"clay",score:"6-4 6-2"},
    {id:3,scheduled_time:"2026-05-01T12:00:00Z",players:{p1:{id:10,name:"A"},p2:{id:20,name:"B"}},winner:null,surface:null}
  ]};
  const result=sandbox.derive(payload,10);
  assert.equal(result.sample,3);
  assert.deepEqual(Array.from(result.last5,x=>x.winner),["?","L","W"]);
  assert.equal(result.form10.wins,1);
  assert.equal(result.form10.losses,1);
  assert.equal(result.undecided,1);
  assert.equal(result.bySurface.hard.wins,1);
  assert.equal(result.bySurface.clay.losses,1);
  assert.equal(result.bySurface.grass.decided,0);
  assert.equal(result.last5[2].score,"6-3 6-4");
  const opponentView=sandbox.derive(payload,20);
  assert.deepEqual(Array.from(opponentView.last5,x=>x.winner),["?","W","L"]);
  assert.equal(opponentView.last5[2].score,"3-6 4-6");
  assert.equal(Object.hasOwn(result.bySurface,"carpet"),false);
  assert.doesNotMatch(html,/\[\x27carpet\x27,\x27Ковёр\x27\]/);
});
test("H2H meeting rows display the published final score",()=>{
  const start=html.indexOf("function renderCompareH2H(");
  const end=html.indexOf("function renderCompareResult(",start);
  assert.ok(start>=0&&end>start);
  const sandbox={escapeHtml:value=>String(value)};
  vm.runInNewContext(html.slice(start,end)+"\nglobalThis.render=renderCompareH2H;",sandbox);
  const payload={players:{p1:{name:"Novak Djokovic"},p2:{name:"Carlos Alcaraz"}},totals:{p1_wins:2,p2_wins:1,meetings:3},meetings:[{date:"2026-01-01",winner:1,score:"6-4 7-6(3)",outcome:"completed"}]};
  const rendered=sandbox.render(payload,"Novak Djokovic","Carlos Alcaraz");
  assert.match(rendered,/6-4 7-6\(3\)/);
});
test("Compare loads both histories and H2H independently after Elo, and rejects mismatched H2H identities",()=>{
  assert.match(html,/Promise\.allSettled\(\[/);
  assert.match(html,/API\+'\/player-history\?id='/);
  assert.match(html,/API\+'\/player-h2h\?p1='/);
  assert.match(html,/norm\(p1\)!==norm\(nameA\)/);
  assert.match(html,/Идентичность игроков не подтверждена точным совпадением имён/);
  assert.match(html,/История недоступна\. Основное сравнение Elo сохранено/);
  assert.match(html,/История 2023–н\.в\.; H2H 1968–н\.в\./);
  assert.match(html,/проверка имён показана в блоке H2H/);
});


test("TVS 2.0 four-section bottom navigation opens the approved destinations",()=>{
  assert.match(html,/function mountIndependentScreens\(\)/);
  assert.match(html,/matches\.id='matchesView'/);
  assert.match(html,/more\.id='moreView'/);
  assert.match(html,/balance\.id='balanceView'/);
  assert.match(html,/history\.id='historyView'/);
  assert.match(html,/settings\.id='settingsView'/);
  assert.match(html,/function hideAllScreens\(\)/);
  assert.match(html,/\$\('#navBalance'\)\.onclick=showBalance;/);
  assert.match(html,/\$\('#navHistory'\)\.onclick=showHistory;/);
  assert.match(html,/\$\('#navStats'\)\.onclick=showStats;/);
  assert.match(html,/\$\('#navSettings'\)\.onclick=showSettingsScreen;/);
  assert.match(html,/\$\('#quickLab'\)\.onclick=/);
  assert.match(html,/\$\('#quickArchive'\)\.onclick=/);
  assert.match(html,/\$\('#matchesRefreshBtn'\)\.addEventListener\('click',\(\)=>loadMatches\(true\)\)/);
  assert.match(html,/\$\('#settingsScreenOpen'\)\.addEventListener\('click'/);
  assert.match(html,/id=\"moreArchiveMount\"/);
});

test("mobile player suggestion taps prevent blur from closing the result list before selection",()=>{
  const start=html.indexOf("function bindComparePlayerSearch(side)");
  const end=html.indexOf("bindComparePlayerSearch('A')",start);
  const search=html.slice(start,end);
  assert.match(search,/list\.addEventListener\('pointerdown'/);
  assert.match(search,/if\(button\)event\.preventDefault\(\)/);
  assert.match(search,/nameInput\.addEventListener\('blur'/);
  assert.match(search,/list\.onclick=event=>/);
});

test("player comparison search maps common Russian player names to canonical Live Tennis API names",()=>{
  assert.match(html,/'алькарас':'Carlos Alcaraz'/);
  assert.match(html,/'новак джокович':'Novak Djokovic'/);
  assert.match(html,/const apiQuery=compareSearchAliases\[query\.toLocaleLowerCase\('ru-RU'\)\]\|\|query/);
  assert.match(html,/encodeURIComponent\(apiQuery\)/);
});

test("singles player search excludes doubles teams returned by Live Tennis API",()=>{
  assert.match(html,/const players=\(Array\.isArray\(payload\.players\)\?payload\.players:\[\]\)\.filter\(player=>player\?\.is_doubles_team!==true\)/);
  assert.match(html,/Одиночные игроки не найдены/);
});

test("upcoming schedule follows API pagination and warns when the page cap is reached", () => {
  assert.match(html, /async function fetchUpcomingSchedule\(force=false\)/);
  assert.match(html, /for\(let page=0;page<4;page\+\+\)/);
  assert.match(html, /meta\.has_more===true/);
  assert.match(html, /offset=currentOffset\+count/);
  assert.match(html, /const rawId=match\?\.id\?\?match\?\.matchId\?\?match\?\.match_id/);
  assert.match(html, /window\.scheduleCoverage=\{loaded:matches\.length,total:scheduleResult\.total,pages:scheduleResult\.pagesLoaded,truncated:scheduleResult\.hasMore\}/);
  assert.match(html, /Расписание загружено не полностью/);
  assert.match(html, /localStorage\.getItem\('tvs-match-cache-v3'\)/);
  assert.match(html, /localStorage\.setItem\('tvs-match-cache-v3'/);
});


const liveScoreStart = html.indexOf("function liveScoreView(match)");
const liveScoreEnd = html.indexOf("function liveSurfaceLabel(surface)", liveScoreStart);
const liveScoreSource = html.slice(liveScoreStart, liveScoreEnd);
function runLiveScoreView(match) {
  const sandbox = {};
  vm.runInNewContext(liveScoreSource + "\nglobalThis.liveScoreView = liveScoreView;", sandbox);
  return sandbox.liveScoreView(match);
}

test("home screen places a live scoreboard above the pre-match Bet of the Day", () => {
  const liveAt = html.indexOf('id="liveBoard"');
  const betAt = html.indexOf('id="bestBet"');
  assert.ok(liveAt >= 0 && betAt > liveAt);
  assert.match(html, /id="liveMatchList"/);
  assert.match(html, /id="liveRefreshPageBtn"/);
  assert.match(html, /LIVE · МАТЧИ СЕЙЧАС/);
});

test("live score adapter reads player-major sets, games, points and server without inventing values", () => {
  const result = runLiveScoreView({
    score: {
      sets: [2, 1],
      games: [[6, 3, 2], [4, 6, 1]],
      points: ["30", "15"],
      server: 2,
      is_tiebreak: false
    }
  });
  assert.equal(result.hasScore, true);
  assert.equal(result.sets, "2–1");
  assert.equal(result.games, "6–4 · 3–6 · 2–1");
  assert.equal(result.points, "30–15");
  assert.equal(result.server, 2);
  assert.equal(result.tiebreak, false);
  assert.equal(runLiveScoreView({ score: null }).hasScore, false);
  assert.equal(runLiveScoreView({ score: { sets: null, games: null, points: null, server: null } }).sets, "—");
});

test("live feed uses one slate request, local cache and quota-conscious configured refresh", () => {
  assert.match(html, /new URLSearchParams\(\{status:'live',draw:'singles',limit:'200'\}\)/);
  assert.match(html, /API\+'\/matches\?'\+params\.toString\(\)/);
  assert.match(html, /tvs-live-cache-v1/);
  assert.match(html, /isFreshCacheTimestamp\(saved\.savedAt,60\*1000\)/);
  assert.match(html, /loadLiveMatches\(true\)/);
  assert.match(html, /loadLiveMatches\(\);/);
  assert.match(html, /match\.status==='live'/);
  assert.doesNotMatch(html, /\/matches\/\$\{[^}]+\}\/statistics/);
});

test("live scoreboard shows data access errors instead of fabricated scores or probabilities", () => {
  assert.match(html, /Лимит API/);
  assert.match(html, /Счёт пока не опубликован/);
  assert.match(html, /Не удалось загрузить Live-матчи/);
  assert.doesNotMatch(html, /win_probability_p1/);
});

test("expired live cache remains available as a labelled fallback when the API is unavailable", () => {
  const assignAt = html.indexOf("liveMatchesCache=saved.matches");
  const freshnessAt = html.indexOf("if(!force&&saved&&Array.isArray(saved.matches)&&isFreshCacheTimestamp(saved.savedAt,60*1000))");
  const errorFallbackAt = html.indexOf("последние сохранённые данные");
  assert.ok(assignAt >= 0 && freshnessAt > assignAt);
  assert.ok(errorFallbackAt > freshnessAt);
});
