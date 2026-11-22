import assert from "node:assert/strict";
import { auditValuebetSackmann } from "./aggregator1-linkage-audit.mjs";

const valuebet = [
  {
    filename: "valuebetennis-matchs-2025.csv",
    content: [
      "match_id;date;tournoi;genre;surface;joueur1;joueur2",
      "v1;2025-01-12 14:00:00;Australian Open;atp;dur;Novak Djokovic;Rafael Nadal",
      "v2;2025-01-13 14:00:00;Australian Open;atp;dur;Carlos Alcaraz;Jannik Sinner"
    ].join("\n")
  }
];
const sackmann = [
  {
    filename: "atp_matches_2025.csv",
    content: [
      "tourney_date,tourney_name,surface,winner_name,loser_name",
      "20250106,Australian Open,Hard,Novak Djokovic,Rafael Nadal"
    ].join("\n")
  }
];

const result = auditValuebetSackmann(valuebet, sackmann);
assert.equal(result.totals.valuebetRows, 2);
assert.equal(result.totals.validValuebetRows, 2);
assert.equal(result.totals.linkedUnique, 1);
assert.equal(result.totals.noCandidate, 1);
assert.equal(result.totals.ambiguous, 0);
assert.equal(result.totals.linkagePct, 50);
console.log("Aggregator 1 linkage audit fixture: PASS");
