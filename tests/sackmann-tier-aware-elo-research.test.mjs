import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTieredRows, runTierAwareEloResearch } from "../scripts/sackmann-tier-aware-elo-research.mjs";

const match = (overrides = {}) => ({
  tourney_date: "20250101", tourney_id: "T1", match_num: "1", round: "R32",
  winner_id: "100", loser_id: "200", score: "6-3 6-4", best_of: "3",
  surface: "Hard", ...overrides
});
const csv = rows => {
  const headers = Object.keys(rows[0]);
  const cell = value => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return [headers.join(","), ...rows.map(row => headers.map(key => cell(row[key])).join(","))].join("\n");
};

test("normalizer drops exact duplicates and counts conflicting natural matches", () => {
  const row = match();
  const exact = normalizeTieredRows([
    { filename: "atp_matches_futures_2025.csv", content: csv([row]) },
    { filename: "atp_matches_futures_2025.csv", content: csv([row]) }
  ]);
  assert.equal(exact.rows.length, 1);
  assert.equal(exact.diagnostics.exactDuplicateRows, 1);

  const conflict = normalizeTieredRows([
    { filename: "atp_matches_futures_2025.csv", content: csv([row]) },
    { filename: "atp_matches_futures_2025.csv", content: csv([match({ winner_id: "200", loser_id: "100", score: "3-6 4-6" })]) }
  ]);
  assert.equal(conflict.rows.length, 0);
  assert.equal(conflict.diagnostics.conflictingDuplicateGroups, 1);
});

test("same-day lower-tier result is not used in a same-day main-tour prediction", () => {
  const rows = [
    { date: "20250101", tour: "ATP", sourceType: "futures", winner: "100", loser: "200", player1: "100", player2: "200", surface: "Hard", tourneyId: "F1", matchNum: "1", round: "F" },
    { date: "20250101", tour: "ATP", sourceType: "main", winner: "100", loser: "300", player1: "100", player2: "300", surface: "Hard", tourneyId: "M1", matchNum: "1", round: "R32" }
  ];
  const report = runTierAwareEloResearch(rows, { from: "20250101", to: "20250101", lowerKs: [16] });
  const metric = report.results.ATP.lowerTierK["16"].overall;
  assert.equal(metric.baseline.matches, 1);
  assert.equal(metric.tierAware.matches, 1);
  assert.equal(metric.baseline.brier, 0.25);
  assert.equal(metric.tierAware.brier, 0.25);
});

test("prior lower-tier wins update the candidate rating before a later main-tour match", () => {
  const rows = [
    { date: "20250101", tour: "ATP", sourceType: "futures", winner: "100", loser: "200", player1: "100", player2: "200", surface: "Hard", tourneyId: "F1", matchNum: "1", round: "F" },
    { date: "20250102", tour: "ATP", sourceType: "main", winner: "100", loser: "300", player1: "100", player2: "300", surface: "Hard", tourneyId: "M1", matchNum: "1", round: "R32" }
  ];
  const report = runTierAwareEloResearch(rows, { from: "20250102", to: "20250102", lowerKs: [16] });
  const metric = report.results.ATP.lowerTierK["16"].overall;
  assert.equal(metric.baseline.matches, 1);
  assert.equal(metric.baseline.brier, 0.25);
  assert.ok(metric.tierAware.brier < metric.baseline.brier);
});

test("ATP and WTA player ID namespaces remain separate", () => {
  const rows = [
    { date: "20250101", tour: "ATP", sourceType: "futures", winner: "100", loser: "200", player1: "100", player2: "200", surface: "Hard", tourneyId: "F1", matchNum: "1", round: "F" },
    { date: "20250102", tour: "WTA", sourceType: "main", winner: "300", loser: "100", player1: "100", player2: "300", surface: "Hard", tourneyId: "W1", matchNum: "1", round: "R32" }
  ];
  const report = runTierAwareEloResearch(rows, { from: "20250102", to: "20250102", lowerKs: [16] });
  const metric = report.results.WTA.lowerTierK["16"].overall;
  assert.equal(metric.baseline.matches, 1);
  assert.equal(metric.baseline.brier, 0.25);
  assert.equal(metric.tierAware.brier, 0.25);
});


test("seven-day history lag withholds lower-tier results on the effective date", () => {
  const lower = { date: "20250101", tour: "ATP", sourceType: "futures", winner: "100", loser: "200", player1: "100", player2: "200", surface: "Hard", tourneyId: "F1", matchNum: "1", round: "F" };
  const sameEffectiveDay = { date: "20250108", tour: "ATP", sourceType: "main", winner: "100", loser: "300", player1: "100", player2: "300", surface: "Hard", tourneyId: "M1", matchNum: "1", round: "R32" };
  const held = runTierAwareEloResearch([lower, sameEffectiveDay], {
    from: "20250108", to: "20250108", lowerKs: [16], historyLagDays: 7
  });
  assert.equal(held.results.ATP.lowerTierK["16"].overall.tierAware.brier, 0.25);

  const nextDay = { ...sameEffectiveDay, date: "20250109", tourney_id: "M2" };
  const available = runTierAwareEloResearch([lower, nextDay], {
    from: "20250109", to: "20250109", lowerKs: [16], historyLagDays: 7
  });
  assert.ok(available.results.ATP.lowerTierK["16"].overall.tierAware.brier < 0.25);
});
