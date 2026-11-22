import assert from "node:assert/strict";
import { auditValuebetIdBridge } from "./aggregator1-valuebet-id-bridge.mjs";

const tmlHeader="tourney_id,tourney_name,surface,tourney_date,match_num,winner_id,winner_name,winner_age,winner_ioc,loser_id,loser_name,loser_age,loser_ioc,score";
const sackHeader="tourney_id,tourney_name,surface,tourney_date,match_num,winner_id,winner_name,winner_age,winner_ioc,loser_id,loser_name,loser_age,loser_ioc,score";
const vbtHeader="date,genre,surface,tournoi,joueur1,joueur2";
const registry=[
"id,player,atpname,birthdate,ioc",
"A001,J. Smith,John Smith,19960101,USA",
"B001,Jane Player,Jane Player,19970101,GBR"
].join("\n");
const tml="2021-1,Alpha Open,Hard,20210101,1,A001,John Smith,25.0,USA,B001,Jane Player,24.0,GBR,6-3 6-4";
const sack="2021-1,Alpha Open,Hard,20210101,1,1001,John Smith,25.0,USA,1002,Jane Player,24.0,GBR,6-3 6-4";
const vbt="2021-01-01,ATP,dur,Alpha Open,J. Smith,Jane Player";
const report=auditValuebetIdBridge(
  [{filename:"valuebetennis-matchs-2021.csv",content:vbtHeader+"\n"+vbt}],
  [{filename:"2021.csv",content:tmlHeader+"\n"+tml}],
  [{filename:"atp_matches_2021.csv",content:sackHeader+"\n"+sack}],
  {filename:"ATP_Database.csv",content:registry}
);
assert.equal(report.totals.valuebetAtpRows,1);
assert.equal(report.totals.directNameResolvedRows,0);
assert.equal(report.totals.idBridgeResolvedRows,1);
assert.equal(report.totals.idBridgeNewResolvedRows,1);
console.log("Valuebetennis TennisMyLife-ID bridge synthetic fixture passed.");
