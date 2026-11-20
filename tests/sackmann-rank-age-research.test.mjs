import test from "node:test";
import assert from "node:assert/strict";
import {
  fitLogistic, predictLogistic, runRankAgeWalkForward
} from "../scripts/sackmann-rank-age-research.mjs";

function makeSeason(year, count = 400) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const p1 = String((i % 24) + 1);
    let p2Number = ((i * 7 + 5) % 24) + 1;
    if (String(p2Number) === p1) p2Number = (p2Number % 24) + 1;
    const p2 = String(p2Number);
    const winner = i % 3 === 0 ? p1 : p2;
    const loser = winner === p1 ? p2 : p1;
    const rank = id => String(1 + (Number(id) * 7) % 30);
    const age = id => String(20 + Number(id) % 12);
    const missingRank = i % 5 === 0;
    const missingAge = i % 7 === 0;
    rows.push({
      tourney_date: year + "01" + String((i % 25) + 1).padStart(2, "0"),
      tourney_id: year + "-T" + Math.floor(i / 100),
      match_num: String(i % 100),
      round: "R32",
      winner_id: winner,
      loser_id: loser,
      winner_rank: missingRank ? "" : rank(winner),
      loser_rank: missingRank ? "" : rank(loser),
      winner_age: missingAge ? "" : age(winner),
      loser_age: missingAge ? "" : age(loser),
      score: "6-4 6-3",
      surface: i % 2 ? "Hard" : "Clay"
    });
  }
  return rows;
}

test("logistic fit returns finite probabilities for a valid training sample", () => {
  const rows = Array.from({ length: 500 }, (_, i) => {
    const x = (i % 21 - 10) / 5;
    return { x, outcome: x > 0 ? 1 : 0 };
  });
  const model = fitLogistic(rows, ["x"], { minMatches: 100, maxRows: 500 });
  assert.ok(model);
  const favourite = predictLogistic(model, { x: 2 });
  const underdog = predictLogistic(model, { x: -2 });
  assert.ok(Number.isFinite(favourite) && favourite > 0.5);
  assert.ok(Number.isFinite(underdog) && underdog < 0.5);
});

test("rank, age and combined models are evaluated on their own eligible match subsets", () => {
  const rows = [
    ...makeSeason("2000"),
    ...makeSeason("2001"),
    ...makeSeason("2002"),
    ...makeSeason("2003"),
    ...makeSeason("2004")
  ];
  const report = runRankAgeWalkForward(rows, {
    tour: "atp",
    evaluationStart: "20030101",
    evaluationEnd: "20041231",
    minTrainingMatches: 100,
    maxTrainingRows: 250
  });
  assert.equal(report.tour, "atp");
  assert.equal(report.eligibleMatches, rows.length);
  assert.ok(report.summary.rank.matches > 0);
  assert.ok(report.summary.age.matches > 0);
  assert.ok(report.summary.rankAge.matches > 0);
  assert.ok(report.summary.rank.matches < report.evaluatedMatches);
  assert.ok(report.summary.age.matches < report.evaluatedMatches);
  assert.ok(report.summary.rankAge.matches <= report.summary.rank.matches);
  assert.ok(report.summary.rankAge.matches <= report.summary.age.matches);
  assert.ok(Number.isFinite(report.summary.rank.delta.brier));
  assert.ok(Number.isFinite(report.summary.age.delta.logLoss));
  assert.ok(report.byYear["2003"].rank.trainingMatches > 0);
});

test("future seasons cannot change an earlier evaluation year", () => {
  const historical = [
    ...makeSeason("2000"),
    ...makeSeason("2001"),
    ...makeSeason("2002"),
    ...makeSeason("2003")
  ];
  const future = makeSeason("2004");
  const options = {
    tour: "wta",
    evaluationStart: "20030101",
    evaluationEnd: "20031231",
    minTrainingMatches: 100,
    maxTrainingRows: 250
  };
  const baseline = runRankAgeWalkForward(historical, options);
  const extended = runRankAgeWalkForward([...historical, ...future], options);
  assert.deepEqual(extended.byYear["2003"], baseline.byYear["2003"]);
  assert.deepEqual(extended.summary, baseline.summary);
});

test("natural match identity preserves distinct matches reusing a source match number", () => {
  const rows = [
    { tourney_date: "19730101", tourney_id: "1973-W", match_num: "1", round: "F", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "19730101", tourney_id: "1973-W", match_num: "1", round: "SF", winner_id: "3", loser_id: "4", score: "6-3 6-3", surface: "Hard" }
  ];
  const report = runRankAgeWalkForward(rows, { tour: "atp" });
  assert.equal(report.eligibleMatches, 2);
  assert.equal(report.conflictingDuplicateMatches, 0);
});

test("genuinely conflicting rows for the same natural match are excluded", () => {
  const rows = [
    { tourney_date: "19730101", tourney_id: "1973-W", match_num: "1", round: "F", winner_id: "1", loser_id: "2", score: "6-4 6-4", surface: "Hard" },
    { tourney_date: "19730101", tourney_id: "1973-W", match_num: "1", round: "F", winner_id: "2", loser_id: "1", score: "6-4 6-4", surface: "Hard" }
  ];
  const report = runRankAgeWalkForward(rows, { tour: "wta" });
  assert.equal(report.eligibleMatches, 0);
  assert.equal(report.conflictingDuplicateMatches, 1);
  assert.equal(report.conflictingDuplicateRows, 2);
});

test("rejects invalid evaluation date windows", () => {
  assert.throws(() => runRankAgeWalkForward([], {
    tour: "atp", evaluationStart: "20240230"
  }), /valid ordered/);
});

test("frozen holdout keeps coefficients trained before the first evaluation year",()=>{
 const rows=[
  ...makeSeason("2000"),
  ...makeSeason("2001"),
  ...makeSeason("2002"),
  ...makeSeason("2003")
 ];
 const report=runRankAgeWalkForward(rows,{
  tour:"atp",
  evaluationStart:"20020101",
  evaluationEnd:"20031231",
  freezeModelYear:"2002",
  minTrainingMatches:100,
  maxTrainingRows:250
 });
 assert.equal(report.modelPolicy.type,"frozen-coefficients");
 assert.equal(report.modelPolicy.frozenFromYear,"2002");
 assert.equal(report.modelPolicy.fitYear,"2002");
 assert.equal(report.byYear["2002"].rankAge.trainingMatches,report.byYear["2003"].rankAge.trainingMatches);
 assert.equal(report.byYear["2002"].rankAge.trainingSample,report.byYear["2003"].rankAge.trainingSample);
 assert.equal(report.summary.rankAge.trainingMatches,report.byYear["2002"].rankAge.trainingMatches);
 assert.ok(report.summary.rankAge.matches>0);
});
test("frozen model year must match the first evaluation calendar year",()=>{
 assert.throws(()=>runRankAgeWalkForward(makeSeason("2000"),{
  tour:"atp",evaluationStart:"20000101",freezeModelYear:"2001"
 }),/same calendar year/);
});
