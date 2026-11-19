import test from "node:test";
import assert from "node:assert/strict";
import { fitLogisticCalibration, parseCsv, runBacktest, scoreFavouriteCalibration } from "../scripts/backtest.mjs";

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


test("calibration bins report sample-size tiers and approximate uncertainty intervals", () => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    rows.push({
      tourney_date: "20250101",
      tourney_id: "T",
      match_num: String(i + 1),
      winner_id: String(i * 2 + 1),
      loser_id: String(i * 2 + 2),
      score: "6-4 6-4",
      surface: "Hard"
    });
  }
  const bin = runBacktest(rows).calibration.elo.bins.find(item => item.matches === 40);
  assert.ok(bin);
  assert.equal(bin.sampleQuality, "limited");
  assert.ok(Number.isFinite(bin.actualLower95));
  assert.ok(Number.isFinite(bin.actualUpper95));
  assert.ok(bin.actualLower95 <= bin.actual);
  assert.ok(bin.actualUpper95 >= bin.actual);
  assert.ok(bin.actualLower95 >= 0 && bin.actualUpper95 <= 100);
});

test("calibration details are separate from scalar metric summaries", () => {
  const report = runBacktest([
    { tourney_date: "20250101", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" }
  ]);
  assert.deepEqual(Object.keys(report.metrics), ["elo", "surface", "form", "h2h", "combined"]);
  assert.equal(report.metrics.elo.matches, 1);
  assert.equal(report.calibration.elo.bins.length, 10);
});


test("logistic favourite recalibration learns a monotonic slope and preserves the 50% anchor", () => {
  const sigmoid = value => 1 / (1 + Math.exp(-value));
  const probabilities = [0.55, 0.62, 0.7, 0.78, 0.86];
  const observations = [];
  for (const probability of probabilities) {
    const targetRate = sigmoid(1.45 * Math.log(probability / (1 - probability)));
    for (let i = 0; i < 400; i++) {
      observations.push({ probability, outcome: i < Math.round(targetRate * 400) ? 1 : 0 });
    }
  }
  const fitted = fitLogisticCalibration(observations);
  assert.ok(fitted);
  assert.equal(fitted.intercept, 0);
  assert.ok(fitted.slope > 1.2 && fitted.slope < 1.7);
  assert.equal(fitLogisticCalibration(observations.slice(0, 199)), null);
});

test("favourite recalibration validation trains on the prior year and scores the next year", () => {
  const rows = [];
  for (const year of ["2024", "2025"]) {
    for (let i = 0; i < 205; i++) {
      rows.push({
        tourney_date: year + "0101",
        tourney_id: year + "-T",
        match_num: String(i + 1),
        winner_id: String(i * 2 + 1),
        loser_id: String(i * 2 + 2),
        score: "6-4 6-4",
        surface: "Hard"
      });
    }
  }
  const report = runBacktest(rows);
  const validation = report.calibrationValidation.find(item =>
    item.trainingYear === "2024" && item.evaluationYear === "2025" &&
    item.candidate === "elo" && item.scope === "tour"
  );
  assert.ok(validation);
  assert.equal(validation.trainingMatches, 205);
  assert.equal(validation.trainingSampleQuality, "larger_sample");
  assert.equal(validation.evaluationSampleQuality, "larger_sample");
  assert.equal(validation.raw.matches, 205);
  assert.equal(validation.calibrated.matches, 205);
  assert.equal(validation.calibrator.intercept, 0);
  assert.equal(scoreFavouriteCalibration([{ probability: 0.5, outcome: 0.5 }]).brier, 0);
});


test("half-win Elo ties retain uncertainty in calibration intervals", () => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    rows.push({
      tourney_date: "20250101",
      tourney_id: "T",
      match_num: String(i + 1),
      winner_id: String(i * 2 + 1),
      loser_id: String(i * 2 + 2),
      score: "6-4 6-4",
      surface: "Hard"
    });
  }
  const bin = runBacktest(rows).calibration.elo.bins.find(item => item.matches === 40);
  assert.ok(bin);
  assert.equal(bin.actual, 50);
  assert.ok(bin.actualLower95 < 50);
  assert.ok(bin.actualUpper95 > 50);
  assert.ok(bin.actualUpper95 - bin.actualLower95 > 25);
});


test("calibration sample-quality tiers switch at documented boundaries", () => {
  const makeRows = count => Array.from({ length: count }, (_, i) => ({
    tourney_date: "20250101",
    tourney_id: "T",
    match_num: String(i + 1),
    winner_id: String(i * 2 + 1),
    loser_id: String(i * 2 + 2),
    score: "6-4 6-4",
    surface: "Hard"
  }));
  const tierFor = count => runBacktest(makeRows(count)).calibration.elo.bins.find(bin => bin.matches === count).sampleQuality;
  assert.equal(tierFor(29), "low");
  assert.equal(tierFor(30), "limited");
  assert.equal(tierFor(99), "limited");
  assert.equal(tierFor(100), "larger_sample");
});


test("held-out calibration labels small evaluation samples instead of implying stable validation", () => {
  const rows = [];
  for (const [year, count] of [["2024", 205], ["2025", 29]]) {
    for (let i = 0; i < count; i++) {
      rows.push({
        tourney_date: year + "0101",
        tourney_id: year + "-T",
        match_num: String(i + 1),
        winner_id: String(i * 2 + 1),
        loser_id: String(i * 2 + 2),
        score: "6-4 6-4",
        surface: "Hard"
      });
    }
  }
  const validation = runBacktest(rows).calibrationValidation.find(item =>
    item.trainingYear === "2024" && item.evaluationYear === "2025" &&
    item.candidate === "elo" && item.scope === "tour"
  );
  assert.ok(validation);
  assert.equal(validation.trainingSampleQuality, "larger_sample");
  assert.equal(validation.evaluationSampleQuality, "low");
  assert.equal(validation.raw.matches, 29);
});


test("backtest reports year-by-surface counts, metrics and sample quality", () => {
  const rows = [
    { tourney_date: "20240101", tourney_id: "A", match_num: "1", winner_id: "1", loser_id: "2", score: "6-4", surface: "Hard" },
    { tourney_date: "20240102", tourney_id: "A", match_num: "2", winner_id: "2", loser_id: "1", score: "6-4", surface: "Clay" },
    { tourney_date: "20250101", tourney_id: "B", match_num: "1", winner_id: "3", loser_id: "4", score: "6-4", surface: "Hard" },
    { tourney_date: "20250102", tourney_id: "B", match_num: "2", winner_id: "4", loser_id: "3", score: "6-4", surface: "Unknown court" }
  ];
  const report = runBacktest(rows);
  assert.equal(report.breakdowns.byYearAndSurface["2024"].Hard.matches, 1);
  assert.equal(report.breakdowns.byYearAndSurface["2024"].Clay.matches, 1);
  assert.equal(report.breakdowns.byYearAndSurface["2025"].Hard.matches, 1);
  assert.equal(report.breakdowns.byYearAndSurface["2025"].Unknown.matches, 1);
  assert.equal(report.breakdowns.byYearAndSurface["2025"].Unknown.sampleQuality, "low");
  assert.equal(report.breakdowns.byYearAndSurface["2024"].Hard.metrics.elo.matches, 1);
  assert.equal(report.breakdowns.byYearAndSurface["2024"].Hard.calibration.elo.bins.reduce((sum, bin) => sum + bin.matches, 0), 1);
  assert.equal(report.breakdowns.byYearAndSurface["2024"].Hard.calibration.elo.expectedCalibrationError, 0);
});


test("surface walk-forward calibration reports insufficient prior samples instead of silently omitting the segment", () => {
  const rows = [];
  for (let i = 0; i < 199; i++) {
    rows.push({
      tourney_date: "20240101", tourney_id: "2024-T", match_num: String(i + 1),
      winner_id: String(i * 2 + 1), loser_id: String(i * 2 + 2),
      score: "6-4 6-4", surface: "Clay"
    });
  }
  rows.push({
    tourney_date: "20250101", tourney_id: "2025-T", match_num: "1",
    winner_id: "1001", loser_id: "1002", score: "6-4 6-4", surface: "Clay"
  });
  const report = runBacktest(rows, { evaluationStart: "20250101" });
  const validation = report.calibrationValidation.find(item =>
    item.evaluationYear === "2025" && item.candidate === "elo" &&
    item.scope === "surface" && item.surface === "Clay"
  );
  assert.ok(validation);
  assert.equal(validation.status, "insufficient_surface_training_data");
  assert.equal(validation.trainingMatches, 199);
  assert.equal(validation.raw.matches, 1);
  assert.equal(validation.calibrated, undefined);
});

test("walk-forward calibration accumulates all prior years and uses pre-window warm-up matches", () => {
  const rows = [];
  for (const [year, count] of [["2022", 205], ["2024", 205], ["2025", 29]]) {
    for (let i = 0; i < count; i++) {
      rows.push({
        tourney_date: year + "0101",
        tourney_id: year + "-T",
        match_num: String(i + 1),
        winner_id: String(i * 2 + 1),
        loser_id: String(i * 2 + 2),
        score: "6-4 6-4",
        surface: "Hard"
      });
    }
  }
  const report = runBacktest(rows, { evaluationStart: "20250101" });
  assert.equal(report.warmupMatches, 410);
  assert.equal(report.evaluatedMatches, 29);
  const validation = report.calibrationValidation.find(item =>
    item.evaluationYear === "2025" && item.candidate === "elo" && item.scope === "tour"
  );
  assert.ok(validation);
  assert.deepEqual(validation.trainingYears, ["2022", "2024"]);
  assert.equal(validation.trainingYear, "2024");
  assert.equal(validation.trainingMatches, 410);
  assert.equal(validation.evaluationSampleQuality, "low");
  assert.equal(validation.raw.matches, 29);
});

test("backtest keeps player orientation independent of the match outcome", () => {
  const rows = [
    { tourney_date: "20250101", tourney_id: "A", match_num: "1", winner_id: "1", loser_id: "2", score: "6-4", surface: "Hard" },
    { tourney_date: "20250102", tourney_id: "A", match_num: "2", winner_id: "1", loser_id: "2", score: "6-4", surface: "Hard" },
    { tourney_date: "20250103", tourney_id: "A", match_num: "3", winner_id: "2", loser_id: "1", score: "4-6", surface: "Hard" }
  ];
  const report = runBacktest(rows, { evaluationStart: "20250103", includePredictions: true });
  const prediction = report.predictions[0];
  assert.equal(prediction.player1Id, "1");
  assert.equal(prediction.player2Id, "2");
  assert.equal(prediction.winnerId, "2");
  assert.ok(prediction.probabilities.elo > 0.5);
  assert.equal(report.metrics.elo.accuracy, 0);
  assert.equal(report.metrics.elo.brier, Number((prediction.probabilities.elo ** 2).toFixed(5)));
});
