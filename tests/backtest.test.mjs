import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, runBacktest } from "../scripts/backtest.mjs";

test("CSV parser handles quoted commas, escaped quotes and CRLF", () => {
  const rows = parseCsv('name,note\r\n"Smith, John","said ""hello"""\r\n');
  assert.deepEqual(rows, [{ name: "Smith, John", note: 'said "hello"' }]);
});

test("backtest excludes invalid IDs, dates and non-standard outcomes", () => {
  const report = runBacktest([
    { tourney_date: "20250101", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "20250102", winner_id: "1", loser_id: "2", score: "6-4 RET", surface: "Hard" },
    { tourney_date: "20250230", winner_id: "3", loser_id: "4", score: "6-4 6-4", surface: "Clay" },
    { tourney_date: "20250103", winner_id: "", loser_id: "5", score: "6-4 6-4", surface: "Grass" }
  ]);
  assert.equal(report.matches, 1);
  assert.equal(report.excluded, 3);
});

test("matches on the same date cannot leak results into each other's predictions", () => {
  const report = runBacktest([
    { tourney_date: "20250101", tourney_id: "2025-A", match_num: "1", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "20250101", tourney_id: "2025-A", match_num: "2", winner_id: "2", loser_id: "1", score: "6-4 6-4", surface: "Hard" }
  ]);
  assert.equal(report.metrics.elo.matches, 2);
  assert.equal(report.metrics.elo.accuracy, 50);
  assert.equal(report.metrics.elo.brier, 0.25);
});

test("later dates use only earlier results and produce valid metric ranges", () => {
  const report = runBacktest([
    { tourney_date: "20250101", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "20250102", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" }
  ]);
  assert.equal(report.metrics.elo.matches, 2);
  assert.ok(report.metrics.elo.brier >= 0 && report.metrics.elo.brier <= 1);
  assert.ok(report.metrics.elo.logLoss > 0);
  assert.equal(report.metrics.combined.matches, 2);
});

test("evaluation window uses earlier matches as warm-up without scoring them", () => {
  const report = runBacktest([
    { tourney_date: "20240101", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "20240102", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "20240103", winner_id: "2", loser_id: "1", score: "6-4 6-4", surface: "Clay" }
  ], { evaluationStart: "20240102", evaluationEnd: "20240103" });
  assert.equal(report.matches, 3);
  assert.equal(report.warmupMatches, 1);
  assert.equal(report.evaluatedMatches, 2);
  assert.equal(report.metrics.elo.matches, 2);
});

test("evaluation window rejects impossible and reversed dates", () => {
  const rows = [{ tourney_date: "20240101", winner_id: "1", loser_id: "2", score: "6-4", surface: "Hard" }];
  assert.throws(() => runBacktest(rows, { evaluationStart: "20240230" }), /Invalid evaluationStart/);
  assert.throws(() => runBacktest(rows, { evaluationStart: "20240103", evaluationEnd: "20240102" }), /must not be after/);
});

test("CSV parser strips a UTF-8 BOM from the first header", () => {
  assert.deepEqual(parseCsv('\uFEFFtourney_date,winner_id,loser_id\n20240101,1,2\n'), [
    { tourney_date: "20240101", winner_id: "1", loser_id: "2" }
  ]);
});

test("backtest reports and ignores duplicate tournament match rows", () => {
  const row = { tourney_date: "20240101", tourney_id: "2024-A", match_num: "1", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" };
  const report = runBacktest([row, { ...row }]);
  assert.equal(report.matches, 1);
  assert.equal(report.duplicateRows, 1);
  assert.equal(report.metrics.elo.matches, 1);
});


test("CSV parser rejects unterminated quoted fields and quotes inside unquoted fields", () => {
  assert.throws(() => parseCsv('name,note\nAlice,"unfinished'), /Unterminated quoted field/);
  assert.throws(() => parseCsv('name,note\nAl"ice,hello\n'), /Unexpected quote/);
});

test("CSV parser rejects duplicate or empty headers and rows wider than the header", () => {
  assert.throws(() => parseCsv('name,name\nAlice,Bob\n'), /duplicate headers/);
  assert.throws(() => parseCsv('name,,age\nAlice,,30\n'), /empty header/);
  assert.throws(() => parseCsv('name,age\nAlice,30,extra\n'), /more fields than the header/);
});


test("backtest reports separate yearly and surface metrics", () => {
  const report = runBacktest([
    { tourney_date: "20240101", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "20240102", winner_id: "2", loser_id: "1", score: "6-4 6-4", surface: "Clay" },
    { tourney_date: "20250101", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" }
  ]);
  assert.equal(report.breakdowns.byYear["2024"].elo.matches, 2);
  assert.equal(report.breakdowns.byYear["2025"].elo.matches, 1);
  assert.equal(report.breakdowns.bySurface.Hard.elo.matches, 2);
  assert.equal(report.breakdowns.bySurface.Clay.elo.matches, 1);
});


test("same-day rating updates are independent of CSV row order", () => {
  const rows = [
    { tourney_date: "20250101", tourney_id: "A", match_num: "1", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "20250101", tourney_id: "A", match_num: "2", winner_id: "1", loser_id: "3", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "20250102", tourney_id: "A", match_num: "3", winner_id: "2", loser_id: "3", score: "6-4 6-4", surface: "Hard" }
  ];
  const forward = runBacktest(rows);
  const reversed = runBacktest([...rows].reverse());
  assert.deepEqual(forward.metrics, reversed.metrics);
  assert.deepEqual(forward.breakdowns, reversed.breakdowns);
});


test("calibration groups favourite probabilities and treats exact rating ties neutrally", () => {
  const report = runBacktest([
    { tourney_date: "20250101", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" }
  ]);
  const calibration = report.calibration.elo;
  assert.equal(calibration.bins[0].range, "50-55%");
  assert.equal(calibration.bins[0].matches, 1);
  assert.equal(calibration.bins[0].predicted, 50);
  assert.equal(calibration.bins[0].actual, 50);
  assert.equal(calibration.expectedCalibrationError, 0);
  assert.equal(calibration.bins.reduce((sum, bin) => sum + bin.matches, 0), report.metrics.elo.matches);
});

test("calibration separates confident favourites from underdogs", () => {
  const rows = [];
  for (let i = 0; i < 8; i++) {
    rows.push({ tourney_date: "20250101", tourney_id: "T", match_num: String(i + 1), winner_id: "1", loser_id: String(i + 2), score: "6-4 6-4", surface: "Hard" });
  }
  const report = runBacktest(rows);
  const bins = report.calibration.elo.bins;
  assert.equal(bins.reduce((sum, bin) => sum + bin.matches, 0), 8);
  assert.ok(bins.some(bin => bin.matches > 0));
  assert.ok(report.calibration.elo.expectedCalibrationError >= 0);
  assert.ok(report.calibration.elo.expectedCalibrationError <= 100);
});


test("calibration details are separate from scalar metric summaries", () => {
  const report = runBacktest([
    { tourney_date: "20250101", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" }
  ]);
  assert.deepEqual(Object.keys(report.metrics), ["elo", "surface", "form", "h2h", "combined"]);
  assert.equal(report.metrics.elo.matches, 1);
  assert.equal(report.calibration.elo.bins.length, 10);
});
