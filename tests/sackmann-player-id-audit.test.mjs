import test from "node:test";
import assert from "node:assert/strict";
import { auditSackmannPlayerIds } from "../scripts/sackmann-player-id-audit.mjs";

const players = [
  { player_id:"203530", name_first:"Viktorija", name_last:"Golubic", ioc:"SUI", dob:"19921016" },
  { player_id:"216566", name_first:"Mananchaya", name_last:"Sawangkaew", ioc:"THA", dob:"20020710" }
];

test("verifies exact Live Tennis archive IDs against Sackmann player IDs and identity fields", () => {
  const report = auditSackmannPlayerIds([
    { archivePlayerId:203530, name:"Viktorija Golubic", tour:"wta", country:"SUI", birthday:"1992-10-16" },
    { archive_player_id:216566, name:"Mananchaya Sawangkaew", tour:"wta", country:"THA", birthday:"2002-07-10" }
  ], players, "wta");
  assert.equal(report.counts.verified, 2);
  assert.equal(report.results[0].status, "verified");
  assert.equal(report.results[1].birthdayMatch, true);
});

test("does not silently accept a conflicting country or birthday", () => {
  const report = auditSackmannPlayerIds([
    { archivePlayerId:203530, name:"Viktorija Golubic", tour:"wta", country:"FRA", birthday:"1992-10-16" }
  ], players, "wta");
  assert.equal(report.counts.review, 1);
  assert.equal(report.results[0].status, "review");
});

test("keeps profiles without an archive ID unmatched", () => {
  const report = auditSackmannPlayerIds([{ name:"L. Tararudee", tour:"wta" }], players, "wta");
  assert.equal(report.counts.missing_archive_id, 1);
});

test("rejects wrong-tour profiles and unknown archive IDs", () => {
  const report = auditSackmannPlayerIds([
    { archivePlayerId:203530, name:"Viktorija Golubic", tour:"atp" },
    { archivePlayerId:999999, name:"Unknown Player", tour:"wta" }
  ], players, "wta");
  assert.equal(report.counts.wrong_tour, 1);
  assert.equal(report.counts.not_found, 1);
});
