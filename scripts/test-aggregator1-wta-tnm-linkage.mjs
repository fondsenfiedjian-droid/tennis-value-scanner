import assert from "node:assert/strict";
import { auditWtaTmlSackmann } from "./aggregator1-wta-tnm-linkage.mjs";
const h="tourney_id,tourney_name,surface,tourney_date,match_num,winner_id,winner_name,winner_age,winner_ioc,loser_id,loser_name,loser_age,loser_ioc,score";
const tml=[
"2021-1,Alpha Open,Hard,20210101,1,A001,Alpha Player,25.0,USA,B001,Beta Player,24.0,ESP,6-3 6-4",
"2021-2,Gamma Open,Clay,20210110,1,C001,Gamma Player,23.0,FRA,D001,Delta Player,22.0,ITA,6-4 6-4",
"2021-3,Unknown Event,Grass,20210120,1,E001,Epsilon Player,21.0,GER,Z001,Zeta Player,20.0,SUI,6-2 6-2"
].join("\n");
const sack=[
"2021-1,Alpha Open,Hard,20210101,1,1001,Alpha Player,25.0,USA,1002,Beta Player,24.0,ESP,6-3 6-4",
"2021-2,Gamma Open,Clay,20210110,1,1003,Gamma Player,23.0,FRA,1004,Delta Player,22.0,ITA,6-4 6-4",
"2021-4,Gamma Other,Clay,20210115,1,1003,Gamma Player,23.0,FRA,1004,Delta Player,22.0,ITA,7-5 6-4",
"2021-3,Other Event,Grass,20210120,1,1005,Epsilon Player,21.0,GER,1006,Zeta Player,20.0,SUI,6-3 6-3",
"2021-5,Another Event,Grass,20210125,1,1005,Epsilon Player,21.0,GER,1006,Zeta Player,20.0,SUI,7-6 7-6"
].join("\n");
const r=auditWtaTmlSackmann(
 [{filename:"2021_wta.csv",content:h+"\n"+tml}],
 [{filename:"wta_matches_2021.csv",content:h+"\n"+sack}]
);
assert.equal(r.totals.tmlRows,3);
assert.equal(r.totals.candidateRows,3);
assert.equal(r.totals.uniqueCandidateRows,1);
assert.equal(r.totals.scoreResolvedRows,1);
assert.equal(r.totals.ambiguousRows,1);
assert.equal(r.totals.playerIdsMapped,6);
assert.equal(r.totals.resolvedRows,2);
console.log("WTA TML/Sackmann synthetic linkage fixture passed.");
