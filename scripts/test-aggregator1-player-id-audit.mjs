import assert from "node:assert/strict";
import { auditPlayerIdCrosswalk } from "./aggregator1-player-id-audit.mjs";

const valuebet=[
  {filename:"valuebetennis-matchs-2025.csv",content:[
    "genre;joueur1_id;joueur1;joueur2_id;joueur2",
    "ATP;101;John Doe;102;Jane Roe",
    "ATP;103;Alex Smith;101;John Doe",
    "WTA;201;Emma Stone;202;Other Player"
  ].join("\n")}
];
const registries=[
  {filename:"atp_players.csv",content:[
    "player_id,first_name,last_name,hand,dob,ioc,height",
    "11,John,Doe,R,19900101,USA,188",
    "12,Jane,Roe,R,19920101,USA,175",
    "13,Alex,Smith,R,19930101,USA,180",
    "14,Alex,Smith,L,19940101,GBR,182"
  ].join("\n")},
  {filename:"wta_players.csv",content:[
    "player_id,first_name,last_name,hand,dob,ioc,height",
    "21,Emma,Stone,R,19950101,GBR,175"
  ].join("\n")}
];
const report=auditPlayerIdCrosswalk(valuebet,registries);
assert.equal(report.byTour.ATP.distinctSourcePlayerIds,3);
assert.equal(report.byTour.ATP.resolved,2);
assert.equal(report.byTour.ATP.ambiguous,1);
assert.equal(report.byTour.ATP.registryNameCollisions,1);
assert.equal(report.byTour.WTA.distinctSourcePlayerIds,2);
assert.equal(report.byTour.WTA.resolved,1);
assert.equal(report.byTour.WTA.unmapped,1);
assert.equal(report.totals.matchRows,3);
assert.equal(JSON.stringify(report).includes("John Doe"),false);
assert.equal(JSON.stringify(report).includes("101"),false);
console.log("Aggregator 1 player ID audit fixtures: PASS");
