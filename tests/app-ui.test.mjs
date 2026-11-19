import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const oddsMatchingStart = html.indexOf("function normalizePlayer(s)");
const oddsMatchingEnd = html.indexOf("function normalizeTour(value)", oddsMatchingStart);
const oddsMatchingSource = html.slice(oddsMatchingStart, oddsMatchingEnd);
function getOddsMatching(quotes) {
  const sandbox = {
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

test("match cards expose current bookmaker odds without opening the details", () => {
  assert.match(html, /const oddsHtml=allMatched\.length\?/);
  assert.ok(html.includes(`class="match-bottom odds-visible">'+oddsHtml`));
  assert.match(html, /displayQuoteA\?'<b>1<\/b>/);
  assert.match(html, /displayQuoteB\?'<b>2<\/b>/);
});

test("EV calculation keeps the configured odds range separate from visible quotes", () => {
  assert.match(html, /const matched=allMatched\.filter\(o=>/);
  assert.match(html, /value>=minOdds&&value<=maxOdds/);
  assert.match(html, /const quoteA=bestQuoteForSide\(matched,'1'\),quoteB=bestQuoteForSide\(matched,'2'\)/);
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
  assert.match(html, /now-value<=90\*60\*1000/);
  assert.match(html, /актуальных котировок из/);
  assert.match(html, /Котировки получены, но свежих нет/);
});

test("manual and scheduled refresh bypass the recent schedule cache", () => {
  assert.match(html, /async function loadMatches\(force=false\)/);
  assert.match(html, /if\(!force&&saved&&Array\.isArray\(saved\.matches\).*isFreshCacheTimestamp\(saved\.savedAt,15\*60\*1000\)/);
  assert.match(html, /\$\('#refreshBtn'\)\.onclick=\(\)=>loadMatches\(true\)/);
  assert.match(html, /\$\('#navMatches'\)\.onclick=\(\)=>\{showMain\(\);loadMatches\(true\);\}/);
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

test("odds matching rejects stale quotes and quote pairs more than 30 minutes apart", () => {
  const freshHome = makeWinamaxQuote({ outcome: "home" });
  const staleAway = makeWinamaxQuote({
    outcome: "away",
    scrapedAt: new Date(Date.now() - 95 * 60 * 1000).toISOString()
  });
  const match = {
    player1: "Novak Djokovic",
    player2: "Carlos Alcaraz",
    startTime: freshHome.startTime,
    tournament_name: "ATP Finals"
  };
  assert.equal(getOddsMatching([freshHome, staleAway]).oddsForMatch(match).length, 0);
  const skewedAway = makeWinamaxQuote({
    outcome: "away",
    scrapedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString()
  });
  assert.equal(getOddsMatching([freshHome, skewedAway]).oddsForMatch(match).length, 0);
});
