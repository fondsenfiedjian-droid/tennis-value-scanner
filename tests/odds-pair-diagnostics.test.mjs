import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const worker = fs.readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const start = worker.indexOf("function diagnoseOddsPairs(");
const end = worker.indexOf("function inspectHistoricalScore(", start);
assert.ok(start >= 0 && end > start, "odds pair diagnostics helper must exist in worker.js");
const source = worker.slice(start, end);
const sandbox = { Date, Map, Number, String, Math, Object, Array,
  ODDS_FRESHNESS_MAX_AGE_MS: 6 * 60 * 60 * 1000 };
vm.runInNewContext(source + "\nglobalThis.diagnoseOddsPairs = diagnoseOddsPairs;", sandbox);
const diagnose = sandbox.diagnoseOddsPairs;

test("counts complete fresh pairs per bookmaker without combining bookmakers", () => {
  const now = Date.parse("2026-11-22T12:00:00.000Z");
  const rows = [
    { bookmaker: "Winamax", sport: "tennis", marketType: "match_winner", eventId: "w-1",
      homeTeam: "Player A", awayTeam: "Player B", outcome: "home", oddsDecimal: 1.8,
      startTime: "2026-11-22T14:00:00Z", scrapedAt: "2026-11-22T11:50:00Z" },
    { bookmaker: "Winamax", sport: "tennis", marketType: "match_winner", eventId: "w-1",
      homeTeam: "Player A", awayTeam: "Player B", outcome: "away", oddsDecimal: 2.1,
      startTime: "2026-11-22T14:00:00Z", scrapedAt: "2026-11-22T11:55:00Z" },
    { bookmaker: "Betclic", sport: "tennis", marketType: "match_winner", eventId: "b-1",
      homeTeam: "Player A", awayTeam: "Player B", outcome: "home", oddsDecimal: 1.9,
      startTime: "2026-11-22T14:00:00Z", scrapedAt: "2026-11-22T11:50:00Z" }
  ];
  const result = diagnose(rows, now);
  assert.equal(result.totalEventGroups, 2);
  assert.equal(result.byBookmaker.winamax.completePairs, 1);
  assert.equal(result.byBookmaker.winamax.freshCompletePairs, 1);
  assert.equal(result.byBookmaker.betclic.incompletePairs, 1);
  assert.equal(result.byBookmaker.betclic.freshCompletePairs, 0);
});

test("flags stale, unsynchronised and duplicate-outcome groups", () => {
  const now = Date.parse("2026-11-22T12:00:00.000Z");
  const base = { bookmaker: "Winamax", sport: "tennis", marketType: "match_winner",
    eventId: "w-2", homeTeam: "Player C", awayTeam: "Player D",
    startTime: "2026-11-22T14:00:00Z" };
  const result = diagnose([
    { ...base, outcome: "home", oddsDecimal: 1.7, scrapedAt: "2026-11-22T10:00:00Z" },
    { ...base, outcome: "home", oddsDecimal: 1.8, scrapedAt: "2026-11-22T11:55:00Z" },
    { ...base, outcome: "away", oddsDecimal: 2.2, scrapedAt: "2026-11-22T11:00:00Z" }
  ], now);
  assert.equal(result.byBookmaker.winamax.completePairs, 1);
  assert.equal(result.byBookmaker.winamax.freshCompletePairs, 0);
  assert.equal(result.byBookmaker.winamax.duplicateOutcomeGroups, 1);
  assert.equal(result.byBookmaker.winamax.staleOrUnsynchronisedPairs, 1);
});

test("uses player pair and scheduled time when a provider event ID is absent", () => {
  const now = Date.parse("2026-11-22T12:00:00.000Z");
  const common = { bookmaker: "NetBet", sport: "tennis", marketType: "match_winner",
    homeTeam: "Player E", awayTeam: "Player F", startTime: "2026-11-22T14:00:00Z",
    scrapedAt: "2026-11-22T11:55:00Z" };
  const result = diagnose([
    { ...common, outcome: "home", oddsDecimal: 1.9 },
    { ...common, homeTeam: "Player F", awayTeam: "Player E", outcome: "away", oddsDecimal: 2.0 }
  ], now);
  assert.equal(result.byBookmaker.netbet.completePairs, 1);
  assert.equal(result.byBookmaker.netbet.freshCompletePairs, 1);
});
