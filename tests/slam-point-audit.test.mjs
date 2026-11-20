import test from "node:test";
import assert from "node:assert/strict";
import { auditSlamPointFiles } from "../scripts/slam-point-audit.mjs";

const matches="match_id,year,slam,player1,player2,winner,round,court_name,player1id,player2id\n2024-wimbledon-1,2024,wimbledon,A Player,B Player,1,R16,Centre,101,102";
const points="match_id,Point,server,serve_speed,rally_length,return_depth\n2024-wimbledon-1,1,1,180,3,D\n2024-wimbledon-1,2,2,,0,ND\nunknown-match,3,1,190,8,D";
test("audits point coverage, orphan IDs and candidate field availability",()=>{
 const report=auditSlamPointFiles([
  {filename:"2024-wimbledon-matches.csv",content:matches},
  {filename:"2024-wimbledon-points.csv",content:points}
 ]);
 assert.equal(report.totals.events,1);
 assert.equal(report.totals.matchRows,1);
 assert.equal(report.totals.pointRows,3);
 assert.equal(report.totals.pointMatchIdsLinkedToMetadata,1);
 assert.equal(report.totals.orphanPointMatchIds,1);
 assert.equal(report.events[0].metadataMatchIdsWithoutPoints,0);
 assert.equal(report.events[0].candidateFields.serve_speed.nonEmptyPct,66.67);
 assert.equal(report.events[0].candidateFields.rally_length.zeroPctOfNumeric,33.33);
 assert.equal(report.fieldAvailability.serve_speed.eventsWithData,1);
 assert.deepEqual(report.events[0].candidateFields.return_depth.categoryCounts,{D:2,ND:1});
});
test("requires both match and point files for each Slam event",()=>{
 assert.throws(()=>auditSlamPointFiles([{filename:"2024-wimbledon-matches.csv",content:matches}]),/Missing match or point file/);
});
test("rejects non-singles or unexpected filenames",()=>{
 assert.throws(()=>auditSlamPointFiles([{filename:"2024-wimbledon-points-doubles.csv",content:points}]),/Unexpected Slam/);
});
test("rejects empty input",()=>{
 assert.throws(()=>auditSlamPointFiles([]),/No Slam/);
});
