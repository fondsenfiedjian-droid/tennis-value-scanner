import test from "node:test";
import assert from "node:assert/strict";
import { calculateAceFeatures } from "./features.mjs";

const target = { match_id: "T", date: "2026-06-20", player_a_id: "A", player_b_id: "B" };
const row = (id, date, p1 = "A", p2 = "X", duration = "100", status = "") => ({
  match_id: id, date, joueur1_id: p1, joueur2_id: p2,
  duree_min: duration, match_status: status
});

test("strictly excludes same-day rows", () => {
  const out = calculateAceFeatures(target, [row("1", "2026-06-20"), row("2", "2026-06-19")]);
  assert.equal(out.players.A.matches_3d, 1);
  assert.equal(out.same_day_rows_excluded, 1);
});

test("3/7/14-day windows include lower boundary and exclude preceding day", () => {
  const out = calculateAceFeatures(target, [
    row("d3", "2026-06-17"), row("d4", "2026-06-16"),
    row("d7", "2026-06-13"), row("d8", "2026-06-12"),
    row("d14", "2026-06-06"), row("d15", "2026-06-05")
  ]);
  assert.equal(out.players.A.matches_3d, 1);
  assert.equal(out.players.A.matches_7d, 3);
  assert.equal(out.players.A.matches_14d, 5);
});

test("two matches on one date count as two matches and one playing day", () => {
  const out = calculateAceFeatures(target, [
    row("1", "2026-06-19"), row("2", "2026-06-19", "A", "Y")
  ]);
  assert.equal(out.players.A.matches_3d, 2);
  assert.equal(out.players.A.playing_days_3d, 1);
});

test("missing and invalid durations remain missing and reduce coverage", () => {
  const out = calculateAceFeatures(target, [
    row("1", "2026-06-19", "A", "X", "90"),
    row("2", "2026-06-18", "A", "Y", ""),
    row("3", "2026-06-17", "A", "Z", "0")
  ]);
  assert.equal(out.players.A.known_duration_sum_7d_min, 90);
  assert.equal(out.players.A.duration_coverage_7d, 1 / 3);
});

test("administrative outcomes are excluded from activity counts", () => {
  const out = calculateAceFeatures(target, [
    row("1", "2026-06-19", "A", "X", "0", "W/O"),
    row("2", "2026-06-18", "A", "Y", "80", "")
  ]);
  assert.equal(out.players.A.matches_7d, 1);
});

test("exact duplicate is ignored; conflicting duplicate causes abstention", () => {
  const original = row("same", "2026-06-19");
  const playerBHistory = row("b-history", "2026-06-19", "B", "Y");
  const exact = calculateAceFeatures(target, [original, { ...original }, playerBHistory]);
  assert.equal(exact.status, "available");
  assert.equal(exact.exact_duplicates_ignored, 1);
  const conflict = calculateAceFeatures(target, [original, row("same", "2026-06-18"), playerBHistory]);
  assert.equal(conflict.status, "abstain");
});

test("retirement may count as an appearance but duration is withheld", () => {
  const out = calculateAceFeatures(target, [row("ret", "2026-06-19", "A", "X", "130", "RET"), row("b", "2026-06-19", "B", "Y", "90", "")]);
  assert.equal(out.players.A.matches_7d, 1);
  assert.equal(out.players.A.known_duration_sum_7d_min, 0);
  assert.equal(out.players.A.duration_coverage_7d, 0);
});

test("no prior history returns insufficient_data, not a zero-load claim", () => {
  const out = calculateAceFeatures(target, [row("same-day", "2026-06-20")]);
  assert.equal(out.status, "insufficient_data");
  assert.equal(out.players.A.matches_14d, 0);
});

test("invalid target and identical player ids are rejected", () => {
  assert.equal(calculateAceFeatures({ ...target, date: "2026-02-30" }, []).status, "insufficient_data");
  assert.equal(calculateAceFeatures({ ...target, player_b_id: "A" }, []).status, "insufficient_data");
});
