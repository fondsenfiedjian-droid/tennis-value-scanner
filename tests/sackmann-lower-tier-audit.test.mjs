import test from "node:test";
import assert from "node:assert/strict";
import { auditLowerTierFiles } from "../scripts/sackmann-lower-tier-audit.mjs";

const header="tourney_date,tourney_id,tourney_name,surface,draw_size,tourney_level,tourney_round,match_num,winner_id,winner_seed,winner_entry,winner_name,winner_hand,winner_ht,winner_ioc,winner_age,loser_id,loser_seed,loser_entry,loser_name,loser_hand,loser_ht,loser_ioc,loser_age,score,best_of,winner_rank,loser_rank,w_1stIn,w_1stWon,w_2ndWon,l_1stIn,l_1stWon,l_2ndWon";
const row1="20240101,100,Challenger,Hard,32,C,SF,1,101,,Q,A Player,R,185,USA,24,102,,Q,B Player,L,180,FRA,26,6-4 6-3,3,90,120,40,30,10,38,24,8";
const row2="20240102,100,Challenger,Clay,32,C,F,2,101,,Q,A Player,R,185,USA,24,103,,Q,C Player,R,188,ESP,22,6-3 6-4,3,,,,,,,";
test("audits lower-tier files by tour and event family without retaining rows",()=>{
 const report=auditLowerTierFiles([{filename:"atp_matches_qual_chall_2024.csv",content:[header,row1,row2].join("\n")}]);
 assert.equal(report.sourceCommit,"83733587353df8a41f2fd4f516147d5aa83f5a8d");
 assert.equal(report.groups.length,1);
 const g=report.groups[0];
 assert.equal(g.tour,"ATP");
 assert.equal(g.sourceType,"qual_chall");
 assert.equal(g.rows,2);
 assert.equal(g.completedMatches,2);
 assert.equal(g.uniquePlayers,3);
 assert.equal(g.rankBothPct,50);
 assert.equal(g.ageBothPct,100);
 assert.equal(g.knownSurfacePct,100);
 assert.equal(g.coreServeStatsBothPct,50);
 assert.equal(g.columns.includes("winner_name"),true);
 assert.equal("matches" in g,false);
});
test("rejects unexpected filenames rather than guessing source type",()=>{
 assert.throws(()=>auditLowerTierFiles([{filename:"atp_matches_doubles_2024.csv",content:header+"\n"+row1}]),/Unexpected lower-tier filename/);
});
test("rejects empty lower-tier input",()=>{
 assert.throws(()=>auditLowerTierFiles([]),/groups|No lower-tier/);
});

test("separates exact duplicate and conflicting natural match identities",()=>{
 const conflict=row1.replace("6-4 6-3","6-3 6-4");
 const report=auditLowerTierFiles([{filename:"atp_matches_futures_2024.csv",content:[header,row1,row1,conflict].join("\n")}]);
 const g=report.groups[0];
 assert.equal(g.completedMatches,3);
 assert.equal(g.uniqueCompletedMatchGroups,1);
 assert.equal(g.duplicateNaturalMatchGroups,1);
 assert.equal(g.duplicateExcessRows,2);
 assert.equal(g.exactDuplicateGroups,0);
 assert.equal(g.conflictingDuplicateGroups,1);
});
