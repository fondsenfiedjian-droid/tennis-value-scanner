import test from "node:test";
import assert from "node:assert/strict";
import { parseValuebetennisCsv, runValuebetennisBacktest } from "../scripts/valuebetennis-backtest.mjs";

const header = "match_id,date,tournoi_id,genre,surface,joueur1_id,joueur2_id,vainqueur_id,score,cote1_ouverture,cote2_ouverture,cote1_cloture,cote2_cloture";
const sample = [
  header,
  "1001,2025-01-02T14:30:00Z,500,atp,Hard,11,22,11,6-4 6-3,1.80,2.10,1.75,2.20",
  '1002,2025-01-03T12:00:00Z,500,wta,Clay,33,44,44,"6-7 6-4 6-2",2.05,1.75,2.15,1.70',
  "1003,2025-02-30,501,atp,Grass,55,66,55,6-2 6-2,1.5,2.4,1.4,2.6",
  "1004,2025-01-04T12:00:00Z,502,atp,Hard,77,88,99,6-3 6-4,1.5,2.4,1.4,2.6",
  "1005,2025-01-05T12:00:00Z,503,atp,Carpet,99,111,111,6-4 RET,2.0,1.8,2.1,1.7"
].join("\n");

test("Valuebetennis CSV maps source columns into chronological Elo rows", () => {
  const parsed = parseValuebetennisCsv(sample);
  assert.equal(parsed.inputRows, 5);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rejectedRows, 2);
  assert.equal(parsed.rejectedByReason.invalid_date, 1);
  assert.equal(parsed.rejectedByReason.winner_not_in_match, 1);
  assert.deepEqual(parsed.rows[0], {
    tourney_date: "20250102", tourney_id: "500", match_num: "1001",
    winner_id: "11", loser_id: "22", score: "6-4 6-3", surface: "Hard", tour: "atp", sourceOdds: { opening1: "1.80", opening2: "2.10", closing1: "1.75", closing2: "2.20", player1Id: "11", winnerId: "11" }
  });
  assert.equal(parsed.rows[1].surface, "Clay");
  assert.equal(parsed.rows[1].tour, "wta");
});

test("Valuebetennis importer detects semicolon delimiter and UTF-8 BOM", () => {
  const csv = "\uFEFF" + header.replaceAll(",", ";") + "\n" +
    "2001;2025-02-01;600;atp;Grass;12;13;13;6-4 6-4;2;1.8;2.1;1.7";
  const parsed = parseValuebetennisCsv(csv);
  assert.equal(parsed.delimiter, ";");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].winner_id, "13");
  assert.equal(parsed.rows[0].loser_id, "12");
});

test("Valuebetennis importer rejects an unexpected schema instead of guessing", () => {
  assert.throws(() => parseValuebetennisCsv("match_id,date,winner\n1,2025-01-01,2"), /missing required columns/);
});

test("Valuebetennis backtest labels prediction evaluation as non-ROI", () => {
  const report = runValuebetennisBacktest(sample, { evaluationStart: "20250103" });
  assert.equal(report.source, "Valuebetennis open data (CC BY 4.0)");
  assert.equal(report.tours.join(","), "atp,wta");
  assert.equal(report.report.warmupMatches, 1);
  assert.equal(report.report.evaluatedMatches, 1);
  assert.match(report.importantLimit, /does not establish betting ROI/);
  assert.equal(report.marketBenchmarks.opening.matchesWithTwoValidOdds, 2);
  assert.equal(report.marketBenchmarks.opening.matchesExcludedNonstandardOutcome, 1);
  assert.equal(report.marketBenchmarks.closing.matchesWithTwoValidOdds, 2);
  assert.ok(report.marketBenchmarks.closing.noVigPlayer1ProbabilityBrier >= 0);
  assert.match(report.marketBenchmarks.closing.note, /no simulated betting ROI/);
});

test("Valuebetennis backtest combines seasonal files without losing rows", () => {
  const second = sample.replace("1001,2025-01-02T14:30:00Z", "2001,2026-01-02T14:30:00Z");
  const report = runValuebetennisBacktest([sample, second]);
  assert.equal(report.inputRows, 10);
  assert.equal(report.normalizedRows, 6);
  assert.equal(report.years.from, "2025");
  assert.equal(report.years.to, "2026");
});
