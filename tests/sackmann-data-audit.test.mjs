import test from "node:test";
import assert from "node:assert/strict";
import { auditSackmannFiles } from "../scripts/sackmann-data-audit.mjs";

const header = "tourney_id,tourney_name,surface,tourney_level,tourney_date,match_num,winner_id,winner_age,winner_hand,loser_id,loser_age,loser_hand,score,minutes,w_ace,w_df,w_svpt,w_1stIn,w_1stWon,w_2ndWon,w_SvGms,w_bpSaved,w_bpFaced,l_ace,l_df,l_svpt,l_1stIn,l_1stWon,l_2ndWon,l_SvGms,l_bpSaved,l_bpFaced,winner_rank,loser_rank";
const full = "2024-001,Test,Hard,A,20240101,1,101,25.0,R,202,27.0,L,6-4 6-4,90,5,2,60,40,30,12,9,3,4,4,1,55,35,25,10,9,2,3,10,20";
const missing = "2024-001,Test,Clay,A,20240102,2,101,25.0,R,303,22.0,R,6-3 6-3,,,,,,,,,,,,,,,,,,,,,,";
const retirement = "2024-001,Test,Grass,A,20240103,3,101,25.0,R,404,26.0,L,6-4 RET,30,5,2,60,40,30,12,9,3,4,4,1,55,35,25,10,9,2,3,10,20";

test("Sackmann audit reports coverage without exposing match-level records",()=>{
  const report=auditSackmannFiles([
    {filename:"research-data/atp_matches_2024.csv",content:header+"\n"+full+"\n"+missing+"\n"+retirement+"\n"}
  ]);
  const year=report.byTourYear[0];
  assert.equal(report.filesProcessed,1);
  assert.equal(year.tour,"ATP");
  assert.equal(year.validMatches,2);
  assert.equal(year.excludedRows,1);
  assert.equal(year.statsCoreBothSides,1);
  assert.equal(year.statsBothSides,1);
  assert.equal(year.rankBoth,2);
  assert.equal(year.ageBoth,2);
  assert.equal(year.coveragePct.servePointsAnd1st2ndWonBothPlayers,50);
  assert.equal(year.coveragePct.rankingBothPlayers,100);
  assert.equal(report.reportLicense,"CC BY-NC-SA 4.0");
  assert.equal(JSON.stringify(report).includes("101"),false);
  assert.equal(JSON.stringify(report).includes("Test"),false);
});

test("Sackmann audit keeps ATP and WTA player ID namespaces separate",()=>{
  const report=auditSackmannFiles([
    {filename:"atp_matches_2024.csv",content:header+"\n"+full+"\n"},
    {filename:"wta_matches_2024.csv",content:header+"\n"+full+"\n"}
  ]);
  assert.deepEqual(report.tours,["ATP","WTA"]);
  assert.equal(report.totals.ATP.validMatches,1);
  assert.equal(report.totals.WTA.validMatches,1);
});

test("Sackmann audit safely excludes impossible calendar dates",()=>{
  const invalid=full.replace("20240101","20240230");
  const report=auditSackmannFiles([{filename:"atp_matches_2024.csv",content:header+"\\n"+invalid+"\\n"}]);
  assert.equal(report.byTourYear[0].validMatches,0);
  assert.equal(report.byTourYear[0].excludedRows,1);
});

test("Sackmann audit rejects unexpected input filenames",()=>{
  assert.throws(()=>auditSackmannFiles([{filename:"players.csv",content:header+"\n"}]),/Unrecognized Sackmann match filename/);
});
