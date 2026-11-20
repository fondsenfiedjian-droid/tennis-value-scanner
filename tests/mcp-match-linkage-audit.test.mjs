import test from "node:test";
import assert from "node:assert/strict";
import { auditMcpMatchLinkage } from "../scripts/mcp-match-linkage-audit.mjs";

const meta = overrides => ({
  match_id: "m1", Date: "20250302", Tournament: "Indian Wells Masters",
  Round: "R32", "Player 1": "Novak Djokovic", "Player 2": "Carlos Alcaraz",
  ...overrides
});
const result = overrides => ({
  tourney_id: "2025-404", tourney_name: "Indian Wells", tourney_date: "20250301",
  match_num: "1", winner_name: "Novak Djokovic", loser_name: "Carlos Alcaraz",
  round: "R32", ...overrides
});
const audit = (metadata, results, options) => auditMcpMatchLinkage({
  metadata: { ATP: metadata, WTA: [] },
  results: { ATP: results, WTA: [] }
}, options).tours.ATP;

test("links full player names using event alias, round and event-date window", () => {
  const report = audit([meta()], [result()]);
  assert.equal(report.linked, 1);
  assert.equal(report.linkedByFullName, 1);
  assert.equal(report.linkagePct, 100);
  assert.equal(report.dateConflicts, 0);
});

test("links unique initial-surname player aliases only when event roster identities are unique", () => {
  const report = audit([meta({ "Player 1": "N. Djokovic", "Player 2": "C. Alcaraz" })], [result()]);
  assert.equal(report.linked, 1);
  assert.equal(report.linkedByInitialSurname, 1);
});

test("rejects an initial-surname alias shared by two different players", () => {
  const rows = [
    result({ winner_name: "John Smith", loser_name: "Carlos Alcaraz", round: "R32" }),
    result({ winner_name: "James Smith", loser_name: "Rafael Nadal", round: "R16", match_num: "2" })
  ];
  const report = audit([meta({ "Player 1": "J. Smith", "Player 2": "C. Alcaraz" })], rows);
  assert.equal(report.linked, 0);
  assert.equal(report.ambiguousAliasIdentities, 1);
});

test("rejects candidate matches outside the 21-day event-date window", () => {
  const report = audit([meta({ Date: "20250430" })], [result()]);
  assert.equal(report.linked, 0);
  assert.equal(report.dateConflicts, 1);
});

test("reports round conflict instead of linking a different round", () => {
  const report = audit([meta({ Round: "R16" })], [result({ round: "R32" })]);
  assert.equal(report.linked, 0);
  assert.equal(report.roundConflicts, 1);
});

test("allows a unique full-name link when the metadata round field is unusable", () => {
  const report = audit([meta({ Round: "Centre Court" })], [result()]);
  assert.equal(report.linked, 1);
  assert.equal(report.linkedWithoutUsableRound, 1);
});

test("links cross-year events when the archived tournament start date is in December", () => {
  const report = audit(
    [meta({ Date: "20250101", Tournament: "United Cup", Round: "RR" })],
    [result({ tourney_date: "20241227", tourney_name: "United Cup", round: "RR" }), result({ tourney_date: "20250115", tourney_name: "Auckland", match_num: "2", winner_name: "Other Player", loser_name: "Another Player" })]
  );
  assert.equal(report.linked, 1);
  assert.equal(report.linkedFromAdjacentYear, 1);
});

test("separates metadata dates outside the pinned results snapshot", () => {
  const report = audit([meta({ Date: "20260909" })], [result()]);
  assert.equal(report.linked, 0);
  assert.equal(report.outsideResultDateCoverage, 1);
});

test("excludes duplicated metadata IDs rather than double-linking them", () => {
  const report = audit([meta(), meta({ Tournament: "Miami Masters" })], [result()]);
  assert.equal(report.duplicateMetadataIds, 1);
  assert.equal(report.duplicateMetadataRowsExcluded, 2);
  assert.equal(report.linked, 0);
});

test("keeps invalid dates and unknown events unmatched without retaining player names or match IDs", () => {
  const report = audit([
    meta({ Date: "20250231" }),
    meta({ match_id: "m2", Tournament: "Unknown Exhibition" })
  ], [result()]);
  assert.equal(report.invalidMetadataDateRows, 1);
  assert.equal(report.eventNotFound, 1);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("Novak Djokovic"), false);
  assert.equal(serialized.includes("Carlos Alcaraz"), false);
  assert.equal(serialized.includes("m1"), false);
});
