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
  assert.equal(report.report, null);
  assert.equal(report.reportsByTour.atp.warmupMatches, 1);
  assert.equal(report.reportsByTour.atp.evaluatedMatches, 0);
  assert.equal(report.reportsByTour.wta.warmupMatches, 0);
  assert.equal(report.reportsByTour.wta.evaluatedMatches, 1);
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
  assert.equal(report.normalizedRows, 4);
  assert.equal(report.duplicateRows, 2);
  assert.equal(report.years.from, "2025");
  assert.equal(report.years.to, "2026");
});

test("Valuebetennis importer collapses identical cross-file matches", () => {
  const one = [header, "9001,2025-03-01,700,atp,Hard,101,202,101,6-4 6-4,1.7,2.2,1.65,2.3"].join("\n");
  const report = runValuebetennisBacktest([one, one]);
  assert.equal(report.inputRows, 2);
  assert.equal(report.normalizedRows, 1);
  assert.equal(report.duplicateRows, 1);
  assert.equal(report.conflictingDuplicateMatches, 0);
  assert.equal(report.rejectedRows, 0);
});

test("Valuebetennis importer excludes every row in a conflicting duplicate match", () => {
  const first = [header, "9002,2025-03-02,701,atp,Hard,301,302,301,6-4 6-4,1.7,2.2,1.65,2.3"].join("\n");
  const conflicting = [header, "9002,2025-03-02,701,atp,Hard,301,302,302,4-6 4-6,1.7,2.2,1.65,2.3"].join("\n");
  const report = runValuebetennisBacktest([first, conflicting]);
  assert.equal(report.normalizedRows, 0);
  assert.equal(report.conflictingDuplicateMatches, 1);
  assert.equal(report.conflictingDuplicateRows, 2);
  assert.equal(report.rejectedRows, 2);
  assert.equal(report.rejectedByReason.conflicting_duplicate_match, 2);
});

test("Valuebetennis backtests ATP and WTA independently even when player IDs overlap", () => {
  const csv = [
    header,
    "9101,2025-01-01,710,atp,Hard,777,778,777,6-4 6-4,1.7,2.2,1.65,2.3",
    "9102,2025-01-02,711,wta,Hard,777,779,779,4-6 4-6,2.1,1.8,2.2,1.7"
  ].join("\n");
  const report = runValuebetennisBacktest(csv);
  assert.deepEqual(report.tours, ["atp", "wta"]);
  assert.equal(report.report, null);
  assert.equal(report.reportsByTour.atp.matches, 1);
  assert.equal(report.reportsByTour.wta.matches, 1);
});

test("Valuebetennis importer maps French surface labels", () => {
  const csv = [
    header,
    "9201,2025-04-01,720,atp,dur,1,2,1,6-4 6-4,1.7,2.2,1.65,2.3",
    "9202,2025-04-02,721,wta,terre battue,3,4,4,6-4 6-4,2.1,1.8,2.2,1.7",
    "9203,2025-04-03,722,atp,dur intérieur,5,6,5,6-4 6-4,1.7,2.2,1.65,2.3",
    "9204,2025-04-04,723,wta,gazon,7,8,8,6-4 6-4,2.1,1.8,2.2,1.7",
    "9205,2025-04-05,724,atp,moquette intérieur,9,10,9,6-4 6-4,1.7,2.2,1.65,2.3"
  ].join("\n");
  const parsed = parseValuebetennisCsv(csv);
  assert.deepEqual(parsed.rows.map(row => row.surface), ["Hard", "Clay", "Hard", "Grass", "Carpet"]);
});

test("paired Elo and Pinnacle comparison uses the same evaluated matches and orients player-one probabilities", () => {
  const csv = [
    header,
    "9301,2025-01-01,730,atp,Hard,1,2,1,6-4 6-4,1.7,2.2,1.65,2.3",
    "9302,2025-01-02,731,atp,Hard,1,3,3,4-6 4-6,2.0,1.8,2.1,1.7",
    "9303,2025-01-03,732,atp,Clay,1,4,1,6-3 6-4,1.7,2.2,,2.3"
  ].join("\n");
  const report = runValuebetennisBacktest(csv, { evaluationStart: "20250102" });
  const comparison = report.pairedMarketComparison.atp;
  assert.equal(report.reportsByTour.atp.warmupMatches, 1);
  assert.equal(report.reportsByTour.atp.evaluatedMatches, 2);
  assert.equal(comparison.opening.matches, 2);
  assert.equal(comparison.opening.matchesMissingOrInvalidOdds, 0);
  assert.equal(comparison.closing.matches, 1);
  assert.equal(comparison.closing.matchesMissingOrInvalidOdds, 1);
  assert.equal(comparison.opening.byYear["2025"].matches, 2);
  assert.equal(comparison.opening.bySurface.Hard.matches, 1);
  assert.equal(comparison.opening.byYearAndSurface["2025|Hard"].matches, 1);
  assert.ok(comparison.opening.market.brier >= 0 && comparison.opening.market.brier <= 1);
  assert.ok(comparison.opening.models.elo.brier >= 0 && comparison.opening.models.elo.brier <= 1);
  assert.equal(typeof comparison.opening.models.elo.brierDifferenceVsMarket, "number");
  assert.equal(comparison.opening.calibration.market.bins.reduce((sum, bin) => sum + bin.matches, 0), 2);
  assert.equal(comparison.opening.calibration.models.elo.bins.reduce((sum, bin) => sum + bin.matches, 0), 2);
  assert.ok(comparison.opening.calibration.market.expectedCalibrationErrorPct >= 0);
  assert.ok(comparison.opening.calibration.market.expectedCalibrationErrorPct <= 100);
  for (const bin of comparison.opening.calibration.market.bins.filter(item => item.matches > 0)) {
    assert.ok(bin.absoluteCalibrationGapPp >= 0 && bin.absoluteCalibrationGapPp <= 100);
  }
  assert.equal(comparison.closing.calibration.market.bins.reduce((sum, bin) => sum + bin.matches, 0), 1);
  assert.match(comparison.opening.note, /same evaluated matches/);
  assert.match(comparison.opening.note, /not betting ROI/);
});

test("paired comparison reorients canonical model probabilities to source player one by ID", () => {
  const csv = [
    header,
    "9401,2025-01-01,740,atp,Hard,20,10,20,6-4 6-4,1.5,2.5,1.45,2.6",
    "9402,2025-01-02,741,atp,Hard,20,10,20,6-4 6-4,1.5,2.5,1.45,2.6"
  ].join("\n");
  const report = runValuebetennisBacktest(csv, { evaluationStart: "20250102" });
  const comparison = report.pairedMarketComparison.atp.opening;
  assert.equal(comparison.matches, 1);
  assert.ok(comparison.models.elo.brier < 0.25);
  assert.ok(comparison.market.brier < 0.25);
});
