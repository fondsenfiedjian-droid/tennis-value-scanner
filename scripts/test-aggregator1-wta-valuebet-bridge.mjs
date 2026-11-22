import assert from "node:assert/strict";
import {auditWtaValuebetBridge} from "./aggregator1-wta-valuebet-bridge.mjs";
const h="tourney_id,tourney_name,surface,tourney_date,match_num,winner_id,winner_name,winner_age,winner_ioc,loser_id,loser_name,loser_age,loser_ioc,score";
const tml=h+"\n2021-1,Alpha Open,Hard,20210101,1,T1,Alpha Player,25,USA,T2,Beta Player,24,ESP,6-3 6-4";
const sack=h+"\n2021-1,Alpha Open,Hard,20210101,1,1001,Alpha Player,25,USA,1002,Beta Player,24,ESP,6-3 6-4";
const vbt="genre;date;surface;joueur1;joueur2;tournoi\nWTA;2021-01-01;dur;Alpha Player;Beta Player;Alpha Open";
const r=auditWtaValuebetBridge(
 [{filename:"valuebetennis-matchs-2021.csv",content:vbt}],
 [{filename:"2021_wta.csv",content:tml}],
 [{filename:"wta_matches_2021.csv",content:sack}]
);
assert.equal(r.totals.vbtWtaRows,1);
assert.equal(r.totals.directResolved,1);
assert.equal(r.totals.idResolved,1);
assert.equal(r.totals.idBridgeAgreement,1);
assert.equal(r.totals.idBridgeNewResolved,0);
console.log("WTA Valuebetennis ID-bridge fixture passed.");
