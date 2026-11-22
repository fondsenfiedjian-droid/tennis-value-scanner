import assert from "node:assert/strict";
import { auditValuebetSackmann } from "./aggregator1-linkage-audit.mjs";

const valuebet = [
  {
    filename: "valuebetennis-matchs-2025.csv",
    content: [
      "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie",
      "v1;2025-01-12 14:00:00;Australian Open;atp;dur;Novak Djokovic;Rafael Nadal;Grand Chelem",
      "v2;2025-01-13 14:00:00;Australian Open;atp;dur;Carlos Alcaraz;Jannik Sinner;Main tour",
      "v3;2025-02-01 14:00:00;WTA 500 Abu Dhabi;wta;dur intérieur;Emma Raducanu;Ons Jabeur;Main tour",
      "v4;2025-03-10 14:00:00;Miami Open;atp;dur;Player C;Player D;Main tour",
      "v5;2025-04-10 14:00:00;;atp;dur;Player E;Player F;",
      "v6;2025-04-11 14:00:00;Unknown Event;atp;wood;Player G;Player H;ITF",
      "v7;2025-06-01 14:00:00;Australian Open;atp;dur;Novak Djokovic;Rafael Nadal;Grand Chelem"
    ].join("\n")
  }
];
const sackmann = [
  {
    filename: "atp_matches_2025.csv",
    content: [
      "tourney_date,tourney_name,surface,winner_name,loser_name",
      "20250106,Australian Open,Hard,Novak Djokovic,Rafael Nadal",
      "20250303,Miami Open,Hard,Player C,Player D",
      "20250304,Indian Wells,Hard,Player D,Player C",
      "20250403,,Hard,Player E,Player F",
      "20250404,Monte Carlo,Hard,Player F,Player E",
      "20250407,Unknown Event,Wood,Player G,Player H"
    ].join("\n")
  },
  {
    filename: "wta_matches_2025.csv",
    content: [
      "tourney_date,tourney_name,surface,winner_name,loser_name",
      "20250127,Abu Dhabi,Hard,Ons Jabeur,Emma Raducanu",
      "20250130,Doha,Hard,Ons Jabeur,Emma Raducanu"
    ].join("\n")
  }
];

const result = auditValuebetSackmann(valuebet, sackmann);
assert.equal(result.totals.valuebetRows, 7);
assert.equal(result.totals.validValuebetRows, 7);
assert.equal(result.totals.candidateRows, 4);
assert.equal(result.totals.linkedUnique, 3);
assert.equal(result.totals.linkedWithoutTournament, 1);
assert.equal(result.totals.linkedByTournament, 2);
assert.equal(result.totals.noCandidate, 3);
assert.equal(result.totals.pairAbsent, 1);
assert.equal(result.totals.dateWindowMiss, 1);
assert.equal(result.totals.surfaceAbsent, 0);
assert.equal(result.totals.surfaceAbsent, 0);
assert.equal(result.totals.unknownSurface, 1);
assert.equal(result.totals.ambiguous, 1);
assert.equal(result.totals.linkagePct, 50);
assert.equal(result.byTour.ATP.linkedUnique, 2);
assert.equal(result.byTour.WTA.linkedUnique, 1);
assert.equal(result.byTourCategory["ATP::Grand Chelem"].linkedUnique, 1);
assert.equal(result.byTourCategory["ATP::Main tour"].linkedUnique, 1);
assert.equal(result.byTourCategory["WTA::Main tour"].linkedUnique, 1);
assert.equal(result.byTourCategory["ATP::ITF"].unknownSurface, 1);
assert.equal(result.byTourCategory["ATP::Main tour"].pairAbsent, 1);
assert.equal(result.byTourCategory["ATP::Grand Chelem"].dateWindowMiss, 1);
assert.equal(result.byCategory["Main tour"].pairAbsent, 1);
assert.equal(result.byCategory["Main tour"].rows, 3);
console.log("Aggregator 1 linkage audit fixtures: PASS");
