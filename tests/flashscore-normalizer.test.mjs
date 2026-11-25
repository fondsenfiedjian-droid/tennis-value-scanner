import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const instrumented = source.replace(
  "export default {",
  "globalThis.__flashscoreTest = { normalizeFlashscoreWinamaxRows, mergeWinamaxOdds };\nexport default {"
);
const sandbox = { Date, Set, Map, Number, String, Math, Object, Array, JSON, RegExp };
vm.runInNewContext(instrumented, sandbox);
const { normalizeFlashscoreWinamaxRows, mergeWinamaxOdds } = sandbox.__flashscoreTest;

const now = Date.parse("2026-11-25T12:00:00.000Z");
const row = overrides => ({
  recordType: "odds",
  sport: "tennis",
  bookmakerName: "Winamax",
  bookmakerCountry: "FR",
  market: "HOME_AWAY",
  period: "FULL_TIME",
  status: "scheduled",
  active: true,
  homeName: "Carlos Alcaraz",
  awayName: "Jannik Sinner",
  tournament: "ATP Finals",
  eventId: "event-1",
  startTime: "2026-11-26T15:00:00.000Z",
  scrapedAt: "2026-11-25T11:50:00.000Z",
  homeOdds: 2.15,
  awayOdds: 1.72,
  ...overrides
});

test("Flashscore normalizer accepts only fresh French Winamax singles match-winner pairs", () => {
  const result = normalizeFlashscoreWinamaxRows([
    row({}),
    row({ homeName: "France", awayName: "Italy", tournament: "Davis Cup Finals", eventId: "tie-1" }),
    row({ homeName: "Player A / Player B", eventId: "doubles-1" }),
    row({ bookmakerName: "Betclic", eventId: "other-bookmaker" }),
    row({ scrapedAt: "2026-11-24T00:00:00.000Z", eventId: "stale-1" }),
    row({ startTime: "2026-11-24T10:00:00.000Z", eventId: "finished-1" })
  ], now);
  assert.equal(result.items.length, 2);
  assert.equal(result.diagnostics.acceptedRows, 1);
  assert.equal(result.diagnostics.rejectedByReason.team_tie, 1);
  assert.equal(result.diagnostics.rejectedByReason.doubles, 1);
  assert.equal(result.diagnostics.rejectedByReason.bookmaker, 1);
  assert.equal(result.diagnostics.rejectedByReason.stale_quote, 1);
  assert.equal(result.diagnostics.rejectedByReason.event_not_future, 1);
  assert.deepEqual(result.items.map(item => item.outcome).sort(), ["away", "home"]);
  assert.ok(result.items.every(item => item.bookmaker === "Winamax" && item.source === "Flashscore"));
});

test("Flashscore normalizer rejects malformed datasets and incomplete prices", () => {
  assert.equal(normalizeFlashscoreWinamaxRows({ items: [] }, now).diagnostics.rejectedByReason.dataset_not_array, 1);
  const result = normalizeFlashscoreWinamaxRows([row({ awayOdds: "suspended" })], now);
  assert.equal(result.items.length, 0);
  assert.equal(result.diagnostics.rejectedByReason.invalid_odds, 1);
});

test("combined odds retain the newest quote for the same bookmaker event side", () => {
  const oldQuote = { bookmaker: "Winamax", homeTeam: "A", awayTeam: "B", startTime: "2026-11-26T10:00:00Z", outcome: "home", oddsDecimal: 2.1, scrapedAt: "2026-11-25T10:00:00Z" };
  const newQuote = { ...oldQuote, oddsDecimal: 2.25, scrapedAt: "2026-11-25T11:00:00Z", source: "Flashscore" };
  const merged = mergeWinamaxOdds([oldQuote], [newQuote]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].oddsDecimal, 2.25);
  assert.equal(merged[0].source, "Flashscore");
});
