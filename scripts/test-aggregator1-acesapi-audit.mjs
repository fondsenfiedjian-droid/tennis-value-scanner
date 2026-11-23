import assert from "node:assert/strict";
import { auditAcesApi } from "./aggregator1-acesapi-audit.mjs";

const valuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie",
  "v1;2025-01-05;Event A;atp;dur;Player One;Player Two;Main tour",
  "v2;2025-01-06;Event B;atp;dur;Player Three;Player Four;Challenger",
  "v3;2025-01-07;Event C;wta;terre battue;Player Five;Player Six;ITF"
].join("\n")}];
const aces=[{filename:"acesapi-atp-2025.json",content:JSON.stringify({data:{matches:[
  {match_id:"a1",match_date:"2025-01-05",player1:"Player One",player2:"Player Two",surface:"hard",draw:"main"},
  {match_id:"a2",match_date:"2025-01-06",player1:"Player Three",player2:"Player Four",surface:"hard",draw:"qualifying"},
  {match_id:"a3",match_date:"2025-01-06",player1:"Player Four",player2:"Player Three",surface:"hard",draw:"main"}
]}})}];
const report=auditAcesApi(valuebet,aces);
assert.equal(report.valuebetRows,3);
assert.equal(report.acesApiUniqueRows,3);
assert.equal(report.acesApiRowsByTourYear["ATP::2025"],3);
assert.equal(report.acesApiRowsByTourYearDraw["ATP::2025::qualifying"],1);
assert.equal(report.byTourYear["ATP::2025"].linkedUnique,1);
assert.equal(report.byTourYear["ATP::2025"].ambiguous,1);
assert.equal(report.byTourYear["ATP::2025"].linkagePct,50);
assert.equal(report.byTourYearCategory["ATP::2025::Main tour"].linkedUnique,1);
assert.equal(report.byTourYearCategory["ATP::2025::Challenger"].ambiguous,1);
assert.equal(report.byTourYear["WTA::2025"].linkedUnique,0);
console.log("AcesAPI aggregate audit fixtures: PASS");
