import test from "node:test";
import assert from "node:assert/strict";
import { auditSlamMatchLinkage } from "../scripts/slam-match-linkage-audit.mjs";

const metaHeader="match_id,year,slam,match_num,player1,player2,winner,round";
const resultHeader="tourney_id,tourney_name,tourney_date,winner_name,loser_name,round";
const metadata="2024-wimbledon-1101,2024,wimbledon,1101,Novak Djokovic,Carlos Alcaraz,1,F";
const results="1,Wimbledon,20240701,Novak Djokovic,Carlos Alcaraz,F";
test("links exact normalized player pairs to the correct tour and event date",()=>{
 const report=auditSlamMatchLinkage([
  {filename:"2024-wimbledon-matches.csv",content:[metaHeader,metadata].join("\n")},
  {filename:"atp_matches_2024.csv",content:[resultHeader,results].join("\n")}
 ]);
 assert.equal(report.totals.events,1);
 assert.equal(report.totals.metadataRows,1);
 assert.equal(report.totals.linkedUniqueMatches,1);
 assert.equal(report.totals.linkedATP,1);
 assert.equal(report.totals.linkedWTA,0);
 assert.equal(report.events[0].linkedResultDateRange.from,"20240701");
 assert.equal(report.totals.winnerCrossChecks,1);
 assert.equal(report.totals.winnerMismatches,0);
});
test("does not guess when a player pair maps to multiple results",()=>{
 const duplicate="2,Wimbledon,20240702,Novak Djokovic,Carlos Alcaraz,R16";
 const report=auditSlamMatchLinkage([
  {filename:"2024-wimbledon-matches.csv",content:[metaHeader,"2024-wimbledon-1101,2024,wimbledon,1101,Novak Djokovic,Carlos Alcaraz,,"].join("\n")},
  {filename:"atp_matches_2024.csv",content:[resultHeader,results,duplicate].join("\n")}
 ]);
 assert.equal(report.totals.ambiguous,1);
 assert.equal(report.totals.linkedUniqueMatches,0);
});
test("rejects empty or incomplete linkage input",()=>{
 assert.throws(()=>auditSlamMatchLinkage([]),/No Slam/);
 assert.throws(()=>auditSlamMatchLinkage([{filename:"2024-wimbledon-matches.csv",content:[metaHeader,metadata].join("\n")}]),/Both Slam metadata/);
});

test("links unique initial-surname aliases and normalizes historical round labels",()=>{
 const abbreviated="2024-wimbledon-1102,2024,wimbledon,1102,N. Djokovic,C. Alcaraz,1,Round 1";
 const result="2,Wimbledon,20240701,Novak Djokovic,Carlos Alcaraz,R128";
 const report=auditSlamMatchLinkage([
  {filename:"2024-wimbledon-matches.csv",content:[metaHeader,abbreviated].join("\n")},
  {filename:"atp_matches_2024.csv",content:[resultHeader,result].join("\n")}
 ]);
 assert.equal(report.totals.linkedUniqueMatches,1);
 assert.equal(report.totals.linkedByInitialSurname,1);
 assert.equal(report.totals.roundConflicts,0);
 assert.equal(report.totals.winnerCrossChecks,1);
 assert.equal(report.totals.winnerMismatches,0);
});
