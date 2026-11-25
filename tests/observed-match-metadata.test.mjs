import test from "node:test";
import assert from "node:assert/strict";
import { extractObservedMatchMetadata } from "../scripts/observed-match-metadata.mjs";

test("extracts names, IDs, scheduled time and event metadata from Live Tennis history schema", () => {
  const result = extractObservedMatchMetadata({
    id: 223144,
    players: {
      p1: { id: 123, name: "Player One" },
      p2: { id: 456, name: "Player Two" }
    },
    scheduled_time: "2026-11-24T12:30:00Z",
    surface: "hard",
    tournament: "Example Open",
    tournament_id: 77,
    round: "Quarter-final",
    status: "completed",
    winner: 1
  });
  assert.deepEqual(result, {
    player1: "Player One", player2: "Player Two",
    player1_id: 123, player2_id: 456,
    date: "2026-11-24T12:30:00Z", surface: "hard",
    tournament: "Example Open", tournament_id: 77,
    round: "Quarter-final", status: "completed", winner: 1
  });
});

test("preserves legacy flat-field fallbacks when nested players are absent", () => {
  const result = extractObservedMatchMetadata({
    player1_name: "Legacy One", player2_name: "Legacy Two",
    date: "2026-01-01", court_surface: "clay"
  });
  assert.equal(result.player1, "Legacy One");
  assert.equal(result.player2, "Legacy Two");
  assert.equal(result.date, "2026-01-01");
  assert.equal(result.surface, "clay");
});
