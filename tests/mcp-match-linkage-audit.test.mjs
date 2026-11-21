import test from "node:test";
import assert from "node:assert/strict";
import { auditMcpMatchLinkage } from "../scripts/mcp-match-linkage-audit.mjs";

const metaHeader="match_id,Player 1,Player 2,Date,Tournament,Round";
const resultHeader="tourney_id,tourney_name,tourney_date,match_num,winner_name,loser_name,round";
const atpMeta="20240710-M-Wimbledon-QF-Novak_Djokovic-Carlos_Alcaraz,Novak Djokovic,Carlos Alcaraz,20240710,Wimbledon,QF";
const wtaMeta="20240711-W-Roland_Garros-SF-Iga_Swiatek-Coco_Gauff,Iga Swiatek,Coco Gauff,20240711,Roland Garros,SF";

test("links unique exact player pairs by tour, year, event and round",()=>{
 const report=auditMcpMatchLinkage([
  {filename:"charting-m-matches.csv",content:[metaHeader,atpMeta].join("\n")},
  {filename:"charting-w-matches.csv",content:[metaHeader,wtaMeta].join("\n")},
  {filename:"atp_matches_2024.csv",content:[resultHeader,"2024-0451,Wimbledon,20240708,120,Novak Djokovic,Carlos Alcaraz,QF"].join("\n")},
  {filename:"wta_matches_2024.csv",content:[resultHeader,"2024-9032,French Open,20240603,120,Iga Swiatek,Coco Gauff,SF"].join("\n")}
 ]);
 assert.equal(report.totals.uniqueMatchIds,2);
 assert.equal(report.totals.linkedUnique,2);
 assert.equal(report.byTour.ATP.dateOffsetDays.min,2);
 assert.equal(report.byTour.WTA.dateOffsetDays.min,38);
 assert.equal(report.byTour.ATP.dateOffsetBuckets.oneToSeven,1);
 assert.equal(report.byTour.WTA.dateOffsetBuckets.over21,1);
 assert.equal(report.byTour.WTA.dateOffsetByYear["2024"].over21,1);
 assert.equal(report.byTour.WTA.dateOffsetByYear["2024"].minOffset,38);
 assert.equal(report.byTour.WTA.dateOffsetByYear["2024"].maxOffset,38);
 assert.equal(JSON.stringify(report).includes("Novak Djokovic"),false);
});

test("does not link when round is conflicting or candidate is ambiguous",()=>{
 const report=auditMcpMatchLinkage([
  {filename:"charting-m-matches.csv",content:[metaHeader,atpMeta].join("\n")},
  {filename:"charting-w-matches.csv",content:[metaHeader,wtaMeta].join("\n")},
  {filename:"atp_matches_2024.csv",content:[resultHeader,"2024-0451,Wimbledon,20240708,120,Novak Djokovic,Carlos Alcaraz,SF"].join("\n")},
  {filename:"wta_matches_2024.csv",content:[resultHeader,"2024-9032,French Open,20240603,120,Iga Swiatek,Coco Gauff,SF","2024-9033,French Open,20240603,121,Coco Gauff,Iga Swiatek,SF"].join("\n")}
 ]);
 assert.equal(report.byTour.ATP.roundConflicts,1);
 assert.equal(report.byTour.WTA.ambiguous,1);
 assert.equal(report.totals.linkedUnique,0);
});

test("classifies event mismatches and missing metadata dates without guessing",()=>{
 const row="20240710-M-Wimbledon-QF-Novak_Djokovic-Carlos_Alcaraz,Novak Djokovic,Carlos Alcaraz,,Queens Club,QF";
 const report=auditMcpMatchLinkage([
  {filename:"charting-m-matches.csv",content:[metaHeader,row].join("\n")},
  {filename:"charting-w-matches.csv",content:[metaHeader].join("\n")},
  {filename:"atp_matches_2024.csv",content:[resultHeader,"2024-0451,Wimbledon,20240708,120,Novak Djokovic,Carlos Alcaraz,QF"].join("\n")},
  {filename:"wta_matches_2024.csv",content:resultHeader}
 ]);
 assert.equal(report.byTour.ATP.eventMismatches,1);
 assert.equal(report.byTour.ATP.missingDates,1);
});

test("requires both tour metadata files and result data",()=>{
 assert.throws(()=>auditMcpMatchLinkage([]),/No MCP/);
 assert.throws(()=>auditMcpMatchLinkage([{filename:"charting-m-matches.csv",content:metaHeader}]),/ATP\/WTA MCP metadata/);
});

test("tolerates embedded quote characters in Match Charting metadata",()=>{
 const header="match_id,Player 1,Player 2,Date,Tournament,Round,Umpire";
 const row="20240710-M-Wimbledon-QF-Novak_Djokovic-Carlos_Alcaraz,Novak Djokovic,Carlos Alcaraz,20240710,Wimbledon,QF,Chair umpire said \"wide\"";
 const report=auditMcpMatchLinkage([
  {filename:"charting-m-matches.csv",content:[header,row].join("\n")},
  {filename:"charting-w-matches.csv",content:metaHeader},
  {filename:"atp_matches_2024.csv",content:[resultHeader,"2024-0451,Wimbledon,20240708,120,Novak Djokovic,Carlos Alcaraz,QF"].join("\n")},
  {filename:"wta_matches_2024.csv",content:resultHeader}
 ]);
 assert.equal(report.byTour.ATP.linkedUnique,1);
});

test("classifies Challenger links and treats a small negative event-week offset as plausible",()=>{
 const row="20240710-M-Nottingham-QF-Novak_Djokovic-Carlos_Alcaraz,Novak Djokovic,Carlos Alcaraz,20240710,Nottingham,QF";
 const report=auditMcpMatchLinkage([
  {filename:"charting-m-matches.csv",content:[metaHeader,row].join("\n")},
  {filename:"charting-w-matches.csv",content:metaHeader},
  {filename:"atp_matches_qual_chall_2024.csv",content:[resultHeader,"2024-0451,Nottingham,20240712,120,Novak Djokovic,Carlos Alcaraz,QF"].join("\n")},
  {filename:"wta_matches_2024.csv",content:resultHeader}
 ]);
 assert.equal(report.byTour.ATP.linkedChallengerQualifying,1);
 assert.equal(report.byTour.ATP.linkedMainTour,0);
 assert.equal(report.byTour.ATP.negativeDateOffsets,1);
 assert.equal(report.byTour.ATP.dateOffsetAnomalyLinks,0);
 assert.equal(report.byTour.ATP.dateOffsetPlausibleLinks,1);
 assert.equal(report.byTour.ATP.dateOffsetBuckets.negativeUpTo7,1);
 assert.equal(report.byTour.ATP.dateOffsetByYear["2024"].negativeUpTo7,1);
 assert.equal(report.byTour.ATP.dateOffsetByYear["2024"].minOffset,-2);
 assert.equal(report.byTour.ATP.dateOffsetByYear["2024"].maxOffset,-2);
});

test("prefers a plausible adjacent-year result for a December match",()=>{
 const row="20231229-M-United_Cup-RR-Player_A-Player_B,Player A,Player B,20231229,United Cup,RR";
 const report=auditMcpMatchLinkage([
  {filename:"charting-m-matches.csv",content:[metaHeader,row].join("\n")},
  {filename:"charting-w-matches.csv",content:metaHeader},
  {filename:"atp_matches_2023.csv",content:[resultHeader,"2023-9900,United Cup,20230102,100,Player A,Player B,RR"].join("\n")},
  {filename:"atp_matches_2024.csv",content:[resultHeader,"2024-9900,United Cup,20240101,100,Player A,Player B,RR"].join("\n")},
  {filename:"wta_matches_2023.csv",content:resultHeader},
  {filename:"wta_matches_2024.csv",content:resultHeader}
 ]);
 assert.equal(report.byTour.ATP.linkedUnique,1);
 assert.equal(report.byTour.ATP.linkedCrossYear,1);
 assert.equal(report.byTour.ATP.dateOffsetDays.min,-3);
 assert.equal(report.byTour.ATP.dateOffsetBuckets.negativeUpTo7,1);
 assert.equal(report.byTour.ATP.dateOffsetAnomalyLinks,0);
});

test("keeps a large negative date offset flagged as an anomaly",()=>{
 const row="20240710-M-Wimbledon-QF-Novak_Djokovic-Carlos_Alcaraz,Novak Djokovic,Carlos Alcaraz,20240710,Wimbledon,QF";
 const report=auditMcpMatchLinkage([
  {filename:"charting-m-matches.csv",content:[metaHeader,row].join("\n")},
  {filename:"charting-w-matches.csv",content:metaHeader},
  {filename:"atp_matches_2024.csv",content:[resultHeader,"2024-0451,Wimbledon,20240810,120,Novak Djokovic,Carlos Alcaraz,QF"].join("\n")},
  {filename:"wta_matches_2024.csv",content:resultHeader}
 ]);
 assert.equal(report.byTour.ATP.linkedUnique,1);
 assert.equal(report.byTour.ATP.negativeOver7Days,1);
 assert.equal(report.byTour.ATP.dateOffsetAnomalyLinks,1);
 assert.equal(report.byTour.ATP.dateOffsetPlausibleLinks,0);
});


test("provides linked player IDs only in memory and omits them from serialized audit output",()=>{
 const header="match_id,Player 1,Player 2,Date,Tournament,Round,Surface,Best of";
 const meta="20240710-M-Wimbledon-QF-Novak_Djokovic-Carlos_Alcaraz,Novak Djokovic,Carlos Alcaraz,20240710,Wimbledon,QF,Grass,BO5";
 const results="tourney_id,tourney_name,tourney_date,match_num,winner_name,loser_name,winner_id,loser_id,score,round,surface,best_of";
 const row="2024-0451,Wimbledon,20240708,120,Novak Djokovic,Carlos Alcaraz,104925,207989,6-7 7-6 7-6 6-3,QF,Grass,5";
 const report=auditMcpMatchLinkage([
  {filename:"charting-m-matches.csv",content:[header,meta].join("\n")},
  {filename:"charting-w-matches.csv",content:"match_id,Player 1,Player 2,Date,Tournament,Round"},
  {filename:"atp_matches_2024.csv",content:[results,row].join("\n")}
 ]);
 assert.equal(report.linkedRows.length,1);
 assert.equal(report.linkedRows[0].player1Id,"104925");
 assert.equal(report.linkedRows[0].player2Id,"207989");
 assert.equal(report.linkedRows[0].winnerIsPlayer1,true);
 const serialized=JSON.stringify(report);
 assert.equal(serialized.includes("Novak Djokovic"),false);
 assert.equal(serialized.includes("104925"),false);
});
