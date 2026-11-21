import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlayerName, auditAgeLinks } from "../scripts/sackmann-age-link-audit.mjs";

test("player names normalize accents and punctuation without guessing aliases",()=>{
  assert.equal(normalizePlayerName("João Sousa"),"joao sousa");
  assert.equal(normalizePlayerName("  O'Connell-Smith  "),"o connell smith");
});

test("age linking accepts unique exact names, rejects ambiguous names and excludes same-day/future ages",()=>{
  const valuebetennisRows=[
    {tour:"atp",tourney_date:"20240101",player1Id:"100",player2Id:"200",player1Name:"Novak Djokovic",player2Name:"Carlos Alcaraz"},
    {tour:"atp",tourney_date:"20240110",player1Id:"100",player2Id:"200",player1Name:"Novak Djokovic",player2Name:"Carlos Alcaraz"},
    {tour:"atp",tourney_date:"20240111",player1Id:"300",player2Id:"400",player1Name:"Alex Smith",player2Name:"Unknown Player"}
  ];
  const sackmannRows=[
    {tourney_date:"20240101",winner_id:"10",winner_name:"Novak Djokovic",winner_age:"36.5",loser_id:"20",loser_name:"Carlos Alcaraz",loser_age:"20.5"},
    {tourney_date:"20240110",winner_id:"10",winner_name:"Novak Djokovic",winner_age:"36.6",loser_id:"20",loser_name:"Carlos Alcaraz",loser_age:"20.6"},
    {tourney_date:"20240101",winner_id:"30",winner_name:"Alex Smith",winner_age:"24.0",loser_id:"40",loser_name:"Other Player",loser_age:"25.0"},
    {tourney_date:"20240102",winner_id:"31",winner_name:"Alex Smith",winner_age:"28.0",loser_id:"41",loser_name:"Another Player",loser_age:"26.0"}
  ];
  const report=auditAgeLinks(valuebetennisRows,{atp:sackmannRows,wta:[]});
  assert.equal(report.totals.valuebetennisMatches,3);
  assert.equal(report.totals.uniqueValuebetennisPlayers,4);
  assert.equal(report.totals.uniquelyMappedPlayers,2);
  assert.equal(report.totals.ambiguousPlayers,1);
  assert.equal(report.totals.unmatchedPlayers,1);
  assert.equal(report.totals.matchesBothAgesAvailable,1);
  assert.equal(report.totals.matchesNoAgeAvailable,2);
  assert.equal(report.totals.bothAgeCoveragePct,33.33);
  assert.match(report.method,/strictly before/);
});
