import test from "node:test";
import assert from "node:assert/strict";
import { auditMcpStyleFeatureCoverage } from "../scripts/mcp-style-feature-coverage.mjs";

const link = (matchId, date, sourceTier = "main") => ({
  matchId, tour: "ATP", date, surface: "Hard", dateOffsetDays: 0,
  player1Name: "Player One", player2Name: "Player Three",
  player1Id: "100", player2Id: "300", sourceTier
});

test("builds rolling charted style histories and excludes same-day matches", () => {
  const linked = [
    link("m0", "20191230"),
    link("m1", "20200102"),
    link("m2", "20200102"),
    link("m3", "20200103")
  ];
  const stats = [{
    filename: "charting-m-stats-Overview.csv",
    content: [
      "match_id,player,set,serve_pts,return_pts,winners,winners_fh,winners_bh,unforced,aces,dfs",
      "m0,Player One,Total,50,50,20,12,8,10,5,1",
      "m0,Player Three,Total,50,50,15,8,7,12,3,2",
      "m1,Player One,Total,50,50,25,15,10,8,7,0",
      "m1,Player Three,Total,50,50,20,12,8,9,4,1"
    ].join("\n")
  }];
  const report = auditMcpStyleFeatureCoverage(linked, stats, {
    windowDays: 730,
    minPriorMatches: [1, 2]
  });
  const atp = report.byTour.ATP;
  assert.equal(atp.mainTourTargets, 4);
  assert.equal(atp.featureMatchCoverage.fhWinnerShare, 2);
  assert.equal(atp.priorHistoryCoverage.fhWinnerShare.overall["1"], 3);
  assert.equal(atp.priorHistoryCoverage.fhWinnerShare.overall["2"], 1);
  assert.equal(atp.priorHistoryCoverage.fhWinnerShare.sameSurface["1"], 3);
  assert.equal(atp.priorHistoryCoverage.fhWinnerShare.sameSurface["2"], 1);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("Player One"), false);
  assert.equal(serialized.includes("100"), false);
});

test("excludes implausible event-date links and malformed surfaces from same-surface history", () => {
  const linked = [
    link("old", "20190101"),
    { ...link("bad-offset", "20190102"), dateOffsetDays: 40 },
    { ...link("bad-surface", "20190103"), surface: "Eva Asderaki-Moore" },
    link("target", "20190104")
  ];
  const stats = [{
    filename: "charting-m-stats-Overview.csv",
    content: [
      "match_id,player,set,serve_pts,return_pts,winners,winners_fh,winners_bh,unforced,aces,dfs",
      "old,Player One,Total,50,50,20,12,8,10,5,1",
      "old,Player Three,Total,50,50,15,8,7,12,3,2",
      "bad-offset,Player One,Total,50,50,20,12,8,10,5,1",
      "bad-offset,Player Three,Total,50,50,15,8,7,12,3,2",
      "bad-surface,Player One,Total,50,50,20,12,8,10,5,1",
      "bad-surface,Player Three,Total,50,50,15,8,7,12,3,2"
    ].join("\n")
  }];
  const report = auditMcpStyleFeatureCoverage(linked, stats, {
    windowDays: 730,
    minPriorMatches: [1]
  });
  assert.equal(report.byTour.ATP.linkedMatches, 3);
  assert.equal(report.byTour.ATP.mainTourTargets, 3);
  assert.equal(report.byTour.ATP.targetSurfaceCounts.unknown, 1);
  assert.equal(report.byTour.ATP.priorHistoryCoverage.fhWinnerShare.overall["1"], 2);
  assert.equal(report.byTour.ATP.priorHistoryCoverage.fhWinnerShare.sameSurface["1"], 1);
});
