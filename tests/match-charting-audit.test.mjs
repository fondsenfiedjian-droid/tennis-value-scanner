import test from "node:test";
import assert from "node:assert/strict";
import { auditMatchChartingFiles } from "../scripts/match-charting-audit.mjs";

const names = ["Overview","Rally","ServeBasics","ReturnDepth","ReturnOutcomes","ShotTypes","ShotDirection","ServeDirection","ServeInfluence","NetPoints","KeyPointsReturn","KeyPointsServe","ShotDirOutcomes","SnV","SvBreakSplit","SvBreakTotal"];
function fixture(tour) {
  const prefix = \`charting-\${tour}-\`;
  const files = {};
  files[prefix+"matches.csv"] = [
    "match_id,Player 1,Player 2,Pl 1 hand,Pl 2 hand,Date,Tournament,Round,Time,Court,Surface,Umpire,Best of,Final TB?,Charted by",
    'm1,A,B,R,L,20240101,"Australian Open, Men",R128,12:00,Centre,Hard,Umpire,5,No,Chartist',
    "m2,C,D,L,R,20240202,French Open,R128,13:00,Court 1,Clay,Umpire,5,No,Chartist",
    "m3,E,F,R,R,20240303,Wimbledon,R128,14:00,Centre,Grass,Umpire,5,No,Chartist"
  ].join("\n");
  for (const name of names) files[prefix+\`stats-\${name}.csv\`] = [
    "match_id,row,set,stat_a",
    "m1,A,1,10",
    "m2,B,1,11",
    "m1,A,2,14",
    "outside,C,2,12"
  ].join("\n");
  return files;
}

test("audits ATP and WTA metadata and stat-family match coverage", () => {
  const report = auditMatchChartingFiles({ ...fixture("m"), ...fixture("w") });
  assert.equal(report.tours.ATP.metadata.uniqueMatchIds, 3);
  assert.deepEqual(report.tours.ATP.metadata.dateRange, { from: "20240101", to: "20240303" });
  assert.equal(report.tours.ATP.metadata.surfaceCounts.Hard, 1);
  assert.equal(report.tours.ATP.metadata.headers.includes("Player 1"), true);
  assert.equal(report.tours.ATP.metadata.metadataFieldCoverage.Tournament.nonEmptyRows, 3);
  assert.equal(report.tours.ATP.metadata.metadataFieldCoverage.Round.coveragePct, 100);
  assert.equal(report.tours.ATP.metadata.tournamentCounts["Australian Open, Men"], 1);
  assert.equal(report.tours.ATP.metadata.qualityChecks.status, "clean");
  assert.equal(report.tours.ATP.metadata.qualityChecks.rowsWithUnexpectedSurface, 0);
  assert.equal(report.tours.ATP.statFiles[0].rows, 4);
  assert.equal(report.tours.ATP.statFiles[0].repeatedMatchIdRows, 1);
  assert.deepEqual(report.tours.ATP.statFiles[0].categoryCounts.row, { A: 2, B: 1, C: 1 });
  assert.deepEqual(report.tours.ATP.statFiles[0].categoryCounts.set, { "1": 2, "2": 2 });
  assert.equal(report.tours.ATP.metadata.invalidDateRows, 0);
  assert.equal(report.tours.ATP.statFiles[0].metadataMatchCoverage.matchedUniqueIds, 2);
  assert.equal(report.tours.ATP.statFiles[0].metadataMatchCoverage.unmatchedUniqueIds, 1);
  assert.equal(report.tours.WTA.metadata.uniqueMatchIds, 3);
});

test("rejects impossible calendar dates in metadata", () => {
  const files = { ...fixture("m"), ...fixture("w") };
  files["charting-m-matches.csv"] = files["charting-m-matches.csv"].replace("20240202", "20240231");
  const report = auditMatchChartingFiles(files);
  assert.equal(report.tours.ATP.metadata.invalidDateRows, 1);
  assert.equal(report.tours.ATP.metadata.qualityChecks.status, "review-required");
});

test("rejects incomplete downloads instead of silently reporting zero coverage", () => {
  assert.throws(() => auditMatchChartingFiles({}), /Missing required file/);
});
