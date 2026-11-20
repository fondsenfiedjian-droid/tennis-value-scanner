import test from "node:test";
import assert from "node:assert/strict";
import { auditMatchChartingFiles } from "../scripts/match-charting-audit.mjs";

const names = ["Overview","Rally","ServeBasics","ReturnDepth","ReturnOutcomes","ShotTypes","ShotDirection","ServeDirection","ServeInfluence","NetPoints","KeyPointsReturn","KeyPointsServe","ShotDirOutcomes","SnV","SvBreakSplit","SvBreakTotal"];
function fixture(tour) {
  const prefix = `charting-${tour}-`;
  const files = {};
  files[prefix+"matches.csv"] = [
    "match_id,Player 1,Player 2,Pl 1 hand,Pl 2 hand,Date,Surface,Notes",
    "m1,A,B,R,L,20240101,Hard,Player said \"wide\"",
    "m2,C,D,L,R,20240202,Clay",
    "m3,E,F,R,R,20240303,Grass"
  ].join("\n");
  for (const name of names) files[prefix+`stats-${name}.csv`] = [
    "match_id,stat_a,stat_b",
    "m1,10,20",
    "m2,11,",
    "outside,12,13"
  ].join("\n");
  return files;
}

test("audits ATP and WTA metadata and stat-family match coverage", () => {
  const report = auditMatchChartingFiles({ ...fixture("m"), ...fixture("w") });
  assert.equal(report.tours.ATP.metadata.uniqueMatchIds, 3);
  assert.deepEqual(report.tours.ATP.metadata.dateRange, { from: "20240101", to: "20240303" });
  assert.equal(report.tours.ATP.metadata.surfaceCounts.Hard, 1);
  assert.equal(report.tours.ATP.metadata.headers.includes("Player 1"), true);
  assert.equal(report.tours.ATP.metadata.qualityChecks.status, "clean");
  assert.equal(report.tours.ATP.metadata.qualityChecks.rowsWithUnexpectedSurface, 0);
  assert.equal(report.tours.ATP.statFiles[0].rows, 3);
  assert.equal(report.tours.ATP.statFiles[0].metadataMatchCoverage.matchedUniqueIds, 2);
  assert.equal(report.tours.ATP.statFiles[0].metadataMatchCoverage.unmatchedUniqueIds, 1);
  assert.equal(report.tours.WTA.metadata.uniqueMatchIds, 3);
});

test("rejects incomplete downloads instead of silently reporting zero coverage", () => {
  assert.throws(() => auditMatchChartingFiles({}), /Missing required file/);
});
