import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOddsApiPayload,
  normalizeFlatBookmakerRows,
  oddsEventsMatch,
  calculateBookmakerEv
} from "../odds-provider-normalizer.mjs";

const retrievedAt = "2026-11-21T15:00:00.000Z";

test("normalizes Betclic and NetBet French tennis match-winner prices", () => {
  const rows = normalizeOddsApiPayload([{
    id: "provider-event-1",
    home_team: "Arthur Fils",
    away_team: "Ugo Humbert",
    commence_time: "2026-11-22T10:00:00Z",
    bookmakers: [
      { key: "betclic_fr", markets: [{ key: "h2h", last_update: retrievedAt, outcomes: [
        { name: "Arthur Fils", price: 1.8 }, { name: "Ugo Humbert", price: 2.05 }
      ] }] },
      { key: "netbet_fr", markets: [{ key: "h2h", outcomes: [
        { name: "Arthur Fils", price: 1.85 }, { name: "Ugo Humbert", price: 2.0 }
      ] }] },
      { key: "unrelated_book", markets: [{ key: "h2h", outcomes: [] }] }
    ]
  }], { retrievedAt });

  assert.equal(rows.length, 4);
  assert.deepEqual([...new Set(rows.map(row => row.bookmaker))].sort(), ["betclic", "netbet"]);
  assert.ok(rows.every(row => row.bookmakerCountry === "FR" && row.marketType === "match_winner"));
  assert.ok(rows.every(row => row.marketComplete === true));
  assert.equal(rows.find(row => row.bookmaker === "betclic" && row.outcome === "home").oddsDecimal, 1.8);
});

test("rejects invalid odds, unknown outcomes, unsupported markets and non-French bookmakers", () => {
  const rows = normalizeOddsApiPayload([{
    id: "event",
    home_team: "Player A",
    away_team: "Player B",
    commence_time: "2026-11-22T10:00:00Z",
    bookmakers: [
      { key: "betclic_fr", markets: [
        { key: "totals", outcomes: [{ name: "Over", price: 1.9 }] },
        { key: "h2h", outcomes: [
          { name: "Player A", price: 1 },
          { name: "Player B", price: 2 },
          { name: "Unknown", price: 4 }
        ] }
      ] },
      { key: "betclic", markets: [{ key: "h2h", outcomes: [{ name: "Player A", price: 2 }] }] }
    ]
  }], { retrievedAt });
  assert.equal(rows.length, 0);
});

test("keeps a one-sided market visible but marks it incomplete", () => {
  const rows = normalizeOddsApiPayload([{
    id: "event",
    home_team: "Player A",
    away_team: "Player B",
    commence_time: "2026-11-22T10:00:00Z",
    bookmakers: [{ key: "netbet_fr", markets: [{ key: "h2h", outcomes: [
      { name: "Player A", price: 1.9 }
    ] }] }]
  }], { retrievedAt });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].marketComplete, false);
});

test("normalizes NetBet-style flat rows and rejects malformed records", () => {
  const rows = normalizeFlatBookmakerRows([
    { homeTeam: "Player A", awayTeam: "Player B", outcomeName: "Player A", oddsDecimal: 2.2,
      startTime: "2026-11-22T10:00:00Z", eventId: "nb-1", scrapedAt: retrievedAt },
    { homeTeam: "Player A", awayTeam: "Player B", outcomeName: "Player B", oddsDecimal: 1,
      startTime: "2026-11-22T10:00:00Z" },
    { homeTeam: "Player A", awayTeam: "Player B", outcomeName: "Player A", oddsDecimal: 2.1,
      startTime: "not-a-date" }
  ], "netbet", { retrievedAt });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bookmaker, "netbet");
  assert.equal(rows[0].outcome, "home");
  assert.equal(rows[0].marketComplete, false);
});

test("matches events by unordered player pair and bounded start-time difference, not source IDs", () => {
  const a = { homeTeam: "J. Sinner", awayTeam: "Carlos Alcaraz", startTime: "2026-11-22T10:00:00Z", eventId: "one" };
  const b = { homeTeam: "Carlos Alcaraz", awayTeam: "J. Sinner", startTime: "2026-11-22T11:30:00Z", eventId: "other" };
  const c = { ...b, startTime: "2026-11-22T14:00:00Z" };
  assert.equal(oddsEventsMatch(a, b), true);
  assert.equal(oddsEventsMatch(a, c), false);
  assert.equal(oddsEventsMatch(a, { ...b, homeTeam: "Different Player" }), false);
});

test("calculates bookmaker-specific EV from the same model probability", () => {
  assert.equal(calculateBookmakerEv(0.55, 2), 10.000000000000009);
  assert.equal(calculateBookmakerEv(0.55, 1.8), -0.9999999999999898);
  assert.equal(calculateBookmakerEv(0.55, 1), null);
  assert.equal(calculateBookmakerEv(1, 2), null);
});
