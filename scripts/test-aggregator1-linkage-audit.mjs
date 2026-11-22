import assert from "node:assert/strict";
import { auditValuebetSackmann } from "./aggregator1-linkage-audit.mjs";

const valuebet = [
  {
    filename: "valuebetennis-matchs-2025.csv",
    content: [
      "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie;joueur1_id;joueur2_id",
      "v1;2025-01-12 14:00:00;Australian Open;atp;dur;Novak Djokovic;Rafael Nadal;Grand Chelem;101;102",
      "v2;2025-01-13 14:00:00;Australian Open;atp;dur;Carlos Alcaraz;Jannik Sinner;Main tour;103;104",
      "v3;2025-02-01 14:00:00;WTA 500 Abu Dhabi;wta;dur intérieur;Emma Raducanu;Ons Jabeur;Main tour;201;202",
      "v4;2025-03-10 14:00:00;Miami Open;atp;dur;Player C;Player D;Main tour;107;108",
      "v5;2025-04-10 14:00:00;;atp;dur;Player E;Player F;;109;110",
      "v6;2025-04-11 14:00:00;Unknown Event;atp;wood;Player G;Player H;ITF;111;112",
      "v7;2025-06-01 14:00:00;Australian Open;atp;dur;Novak Djokovic;Rafael Nadal;Grand Chelem;101;102",
      "v8;2025-06-02 14:00:00;Unknown Challenger;atp;dur;;Player Z;Challenger;113;114"
    ].join("\n")
  }
];
const sackmann = [
  {
    filename: "atp_matches_2025.csv",
    content: [
      "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
      "20250106,Australian Open,Hard,Novak Djokovic,Rafael Nadal,1,2",
      "20250303,Miami Open,Hard,Player C,Player D,3,4",
      "20250304,Indian Wells,Hard,Player D,Player C,4,3",
      "20250403,,Hard,Player E,Player F,5,6",
      "20250404,Monte Carlo,Hard,Player F,Player E,6,5",
      "20250407,Unknown Event,Wood,Player G,Player H,7,8"
    ].join("\n")
  },
  {
    filename: "wta_matches_2025.csv",
    content: [
      "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
      "20250127,Abu Dhabi,Hard,Ons Jabeur,Emma Raducanu,22,21",
      "20250130,Doha,Hard,Ons Jabeur,Emma Raducanu,22,21"
    ].join("\n")
  }
];

const playerFiles = [
  { filename:"atp_players.csv", content:[
    "player_id,name_first,name_last,hand,dob,ioc,height",
    "1,Novak,Djokovic,R,19870522,SRB,188",
    "2,Rafael,Nadal,L,19860603,ESP,185",
    "3,Player,C,R,19900101,USA,180",
    "4,Player,D,R,19900101,USA,180",
    "5,Player,E,R,19900101,USA,180",
    "6,Player,F,R,19900101,USA,180",
    "7,Player,G,R,19900101,USA,180",
    "8,Player,H,R,19900101,USA,180"
  ].join("\n") },
  { filename:"wta_players.csv", content:[
    "player_id,name_first,name_last,hand,dob,ioc,height",
    "21,Emma,Raducanu,R,20021113,GBR,175",
    "22,Ons,Jabeur,R,19940828,TUN,167"
  ].join("\n") }
];
const result = auditValuebetSackmann(valuebet, sackmann, {playerFiles});
assert.equal(result.totals.valuebetRows, 8);
assert.equal(result.totals.validValuebetRows, 7);
assert.equal(result.totals.candidateRows, 4);
assert.equal(result.totals.linkedUnique, 3);
assert.equal(result.totals.linkedWithoutTournament, 1);
assert.equal(result.totals.linkedByTournament, 2);
assert.equal(result.totals.noCandidate, 4);
assert.equal(result.totals.invalidPlayerPair, 1);
assert.equal(result.totals.pairAbsent, 1);
assert.equal(result.totals.dateWindowMiss, 1);
assert.equal(result.totals.surfaceAbsent, 0);
assert.equal(result.totals.unknownSurface, 1);
assert.equal(result.totals.ambiguous, 1);
assert.equal(result.totals.linkagePct, 42.86);
assert.equal(result.byTour.ATP.linkedUnique, 2);
assert.equal(result.byTour.WTA.linkedUnique, 1);
assert.equal(result.playerIdEvidence.matchRowsWithBothPlayerIdsEvidence, 3);
assert.equal(result.playerIdEvidence.byTour.ATP.resolvedToSingleSackmannId, 4);
assert.equal(result.playerIdEvidence.byTour.WTA.resolvedToSingleSackmannId, 2);
assert.equal(result.playerIdEvidence.byTour.ATP.withAcceptedMatchEvidence, 4);
assert.equal(result.playerIdEvidence.byTour.WTA.withAcceptedMatchEvidence, 2);
assert.equal(result.playerIdComparison.ATP.bothUniqueAgreement, 4);
assert.equal(result.playerIdComparison.ATP.bothUniqueDisagreement, 0);
assert.equal(result.playerIdComparison.ATP.directOnlyUnique, 4);
assert.equal(result.playerIdComparison.WTA.bothUniqueAgreement, 2);
assert.equal(result.byTourCategory["ATP::Grand Chelem"].linkedUnique, 1);
assert.equal(result.byTourCategory["ATP::Main tour"].linkedUnique, 1);
assert.equal(result.byTourCategory["WTA::Main tour"].linkedUnique, 1);
assert.equal(result.byTourCategory["ATP::ITF"].unknownSurface, 1);
assert.equal(result.byTourCategory["ATP::Main tour"].pairAbsent, 1);
assert.equal(result.byTourCategory["ATP::Grand Chelem"].dateWindowMiss, 1);
assert.equal(result.byCategory["Main tour"].pairAbsent, 1);
assert.equal(result.byTourCategory["ATP::Challenger"].invalidPlayerPair, 1);
assert.equal(result.byCategory["Main tour"].rows, 3);
console.log("Aggregator 1 linkage audit fixtures: PASS");
