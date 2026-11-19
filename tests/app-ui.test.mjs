import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

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
