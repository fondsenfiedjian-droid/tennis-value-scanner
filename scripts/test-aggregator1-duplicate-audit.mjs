import assert from "node:assert/strict";
import { auditValuebetDuplicates } from "./aggregator1-duplicate-audit.mjs";

const files=[
 {filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;genre;surface;joueur1;joueur2;tournoi;tournoi_id;score;joueur1_id;joueur2_id;vainqueur_id",
  "m1;2025-01-10;ATP;dur;Player One;Player Two;Open A;10;6-4 6-4;101;102;101",
  "m1;2025-01-10;ATP;dur;Player One;Player Two;Open A;10;6-4 6-4;101;102;101",
  "m2;2025-01-10;ATP;dur;Player Two;Player One;Open A;10;7-5 6-4;102;101;102",
  "m3;2025-01-11;WTA;terre battue;Player Three;Player Four;Open B;20;6-2 6-2;103;104;103",
  "m3;2025-01-12;WTA;terre battue;Player Three;Player Five;Open B;20;6-2 6-2;103;105;105"
 ].join("\n")},
 {filename:"valuebetennis-matchs-2026.csv",content:[
  "match_id;date;genre;surface;joueur1;joueur2;tournoi;tournoi_id;score;joueur1_id;joueur2_id;vainqueur_id",
  "m1;2025-01-10;ATP;dur;Player One;Player Two;Open A;10"
 ].join("\n")}
];
const r=auditValuebetDuplicates(files);
assert.equal(r.totals.rows,6);
assert.equal(r.totals.duplicateMatchIdGroups,2);
assert.equal(r.totals.duplicateMatchIdRows,3);
assert.equal(r.totals.conflictingMatchIdGroups,1);
assert.equal(r.totals.duplicateFingerprintGroups,1);
assert.equal(r.totals.duplicateFingerprintRows,3);
assert.equal(r.totals.duplicateFingerprintScoreConflictGroups,1);
assert.equal(r.totals.duplicateFingerprintWinnerConflictGroups,1);
assert.equal(r.totals.duplicateFingerprintWinnerDifferentPlayerGroups,1);
assert.equal(r.totals.duplicateFingerprintWinnerUnresolvedGroups,0);
assert.equal(r.byTour.ATP.rows,4);
assert.equal(JSON.stringify(r).includes("Player One"),false);
assert.equal(JSON.stringify(r).includes("m1"),false);
console.log("Aggregator 1 duplicate audit fixtures: PASS");
