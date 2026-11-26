import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { excelDate, openCanonicalArchive } from "../developer/archive-canonical.mjs";

const player = (id, name, birth) => ({id, name, birth});
const first = player("a", "Иван Петров", "1994-06-01");
const second = player("b", "Test Player", "1999-06-01");
const match = (overrides = {}) => ({source: "atp", scope: "ATP", sides: [[first],[second]], discipline: "singles",
  tournament: {id: "event", name: "Example Open"}, season: 2025, draw: "main", round: "F",
  matchDate: "2025-02-02", winnerSide: 1, score: "7-6(4) 6-2", scoreOrientation: "side1",
  status: "completed", externalId: "m1", ...overrides});
const row = (position, record) => ({position, record, locator: {file: "fixture", row: position}});
const linked = archive => archive.confirmLink({kind:"tournament", source:"sackmann", scope:"ATP",
  externalId:"event2", targetSource:"atp", targetId:"event", evidence:"verified same city and edition in fixture"});
const crossSource = (overrides = {}) => match({source:"sackmann", externalId:"m2", tournament:{id:"event2"},
  sides:[[player("b2","Test Player",second.birth)],[player("a2","Ivan Petrov",first.birth)]],
  winnerSide:2, score:"6-7(4) 2-6", ...overrides});
const origin = (file, pos) => JSON.stringify([file, pos]);

test("cross-provider match, scoped player IDs, reversed sides, enrichment and reversible link", t => {
  const archive = openCanonicalArchive(":memory:");
  t.after(() => archive.close());
  linked(archive);
  archive.ingestBatch("one","1",[row(1,match())]);
  archive.ingestBatch("two","2",[row(1,crossSource({fields:{odds:[3,1.5]},sideFields:["odds"]}))]);
  const report = archive.report();
  assert.equal(report.canonicalMatches,1);
  assert.equal(report.players,2);
  assert.equal(report.mergedObservations,1);
  assert.equal(report.isolatedObservations,0);
  assert.equal(report.foreignKeyErrors,0);
  assert.deepEqual(report.integrity,["ok"]);
  archive.unlink(origin("two",1),"Review found false evidence");
  assert.equal(archive.report().mergedObservations,0);
  assert.equal(archive.report().isolatedObservations,1);
  archive.ingestBatch("repeat","2",[row(1,crossSource())]);
  assert.equal(archive.report().isolatedObservations,2);
});

test("same names alone never identify players; round and draw distinguish real matches", t => {
  const archive = openCanonicalArchive(":memory:");
  t.after(() => archive.close());
  linked(archive);
  archive.ingestBatch("one","1",[
    row(1,match()),row(2,match({externalId:"qual",draw:"qualifying",round:"Q3"})),
    row(3,match({externalId:"other",round:"SF"})),
    row(4,crossSource({sides:[[player("new-b","Test Player")],[player("new-a","Ivan Petrov","1995-02-02")]]}))
  ]);
  assert.equal(archive.report().players,4);
  assert.equal(archive.report().canonicalMatches,4);
});

test("conflicting results, dates and slot bridges remain isolated", t => {
  const archive = openCanonicalArchive(":memory:");
  t.after(() => archive.close());
  linked(archive);
  archive.ingestBatch("one","1",[
    row(1,match({slot:"bracket-A"})),row(2,crossSource({winnerSide:1})),
    row(3,crossSource({externalId:"m3"})),
    row(4,crossSource({externalId:"m4",slot:"bracket-B"})),
    row(5,crossSource({externalId:"m5",matchDate:"2025-02-03"}))
  ]);
  assert.equal(archive.report().canonicalMatches,1);
  assert.equal(archive.report().mergedObservations,1);
  assert.equal(archive.report().isolatedObservations,3);
});

test("SQLite resume is atomic and a repeated input leaves match count stable", t => {
  const folder = mkdtempSync(join(tmpdir(),"canonical-"));
  t.after(() => rmSync(folder,{recursive:true,force:true}));
  const file = join(folder,"archive.sqlite");
  let archive = openCanonicalArchive(file);
  archive.ingestBatch("one","1",[row(1,match())],{expectedPosition:0});
  assert.throws(() => archive.ingestBatch("one","1",[
    row(2,match({externalId:"a2",round:"SF"})),row(2,match())
  ],{expectedPosition:1}), /cursor/);
  archive.close();
  archive = openCanonicalArchive(file);
  t.after(() => archive.close());
  assert.equal(archive.checkpoint("one").position,1);
  assert.equal(archive.report().canonicalMatches,1);
  archive.ingestBatch("one","1",[row(2,match())],{complete:true,expectedPosition:1});
  assert.equal(archive.report().canonicalMatches,1);
  assert.equal(archive.checkpoint("one").complete,1);
  assert.throws(() => archive.ingestBatch("one","changed",[]), /changed/);
});

test("as-of export excludes unknown, closing, equal-time and outcome information", t => {
  const folder = mkdtempSync(join(tmpdir(),"canonical-asof-"));
  t.after(() => rmSync(folder,{recursive:true,force:true}));
  const file = join(folder,"db.sqlite");
  const archive = openCanonicalArchive(file);
  t.after(() => archive.close());
  archive.ingestBatch("one","1",[row(1,match({
    fields:{openOdds:[1.5,3],closeOdds:[1.4,3.1],rankings:[4,9],points:[1,2]},
    knownAt:{openOdds:"2025-02-01T08:00:00Z",closeOdds:"2025-02-02T12:00:00Z",
      points:"2025-01-01T00:00:00Z",winner:"2025-01-01T00:00:00Z"}
  }))]);
  const db = new DatabaseSync(file,{readOnly:true});
  const id = db.prepare("SELECT id FROM matches").get().id;
  db.close();
  assert.deepEqual(Object.keys(archive.fields(id,"2025-02-02T12:00:00Z")),["openOdds"]);
  assert.ok(archive.fields(id).winner);
  assert.throws(() => archive.fields(id,"2025-02-02"));
});

test("Excel 1900 and 1904 serials stay on the source calendar day", () => {
  assert.equal(excelDate(59.9,"1900"),"1900-02-28");
  assert.equal(excelDate(60,"1900"),null);
  assert.equal(excelDate(61,"1900"),"1900-03-01");
  assert.equal(excelDate(0,"1904"),"1904-01-01");
  assert.equal(excelDate(45000),null);
});

test("Termux command imports SQLite read-only, checkpoints reruns and hashes original files", t => {
  const dir = mkdtempSync(join(tmpdir(),"canonical-cli-"));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const input = join(dir,"matches.sqlite"), destination = join(dir,"tennis-canonical.sqlite");
  const db = new DatabaseSync(input);
  db.exec("CREATE TABLE rows(raw_json TEXT,provider TEXT)");
  db.prepare("INSERT INTO rows VALUES(?,?)").run(JSON.stringify(match()),"atp");
  db.close();
  const digest = () => createHash("sha256").update(readFileSync(input)).digest("hex");
  const before = digest();
  const invoke = (...args) => spawnSync(process.execPath,["developer/archive-termux.mjs",...args],{encoding:"utf8"});
  const scan = invoke("inspect",dir);
  assert.equal(scan.status,0,scan.stderr);
  assert.equal(JSON.parse(scan.stdout).entries.length,1);
  for (let i=0;i<2;i++){
    const run = invoke("run",dir,destination);
    assert.equal(run.status,0,run.stderr);
    assert.equal(JSON.parse(run.stdout).canonicalMatches,1);
  }
  assert.equal(digest(),before);
  writeFileSync(join(dir,"manifest.json"),JSON.stringify({inputs:[{file:"matches.sqlite",table:"rows"}]}));
  assert.equal(invoke("run",dir,input,join(dir,"manifest.json")).status,1);
  assert.equal(digest(),before);
});

test("a tournament start cannot substitute for a match date, and mixed disciplines stay separate", t => {
  const archive = openCanonicalArchive(":memory:");
  t.after(() => archive.close());
  const third = player("c", "Third Player");
  const fourth = player("d", "Fourth Player");
  archive.ingestBatch("one","1",[
    row(1,match({tournamentDate:"2025-01-28",matchDate:null})),
    row(2,match({externalId:"m2",tournamentDate:"2025-01-28"})),
    row(3,match({externalId:"m3",discipline:"doubles",sides:[[first,third],[second,fourth]]})),
    row(4,match({externalId:"m4",scope:"junior-men"})),
    row(5,match({externalId:"m5",round:"SF",tournamentDate:"2025-02-03"}))
  ]);
  assert.equal(archive.report().canonicalMatches,3);
  assert.equal(archive.report().missingMatchDate,1);
  assert.equal(archive.report().isolatedObservations,2);
});

test("profile entries and scoped point supplements contribute without inventing matches", t => {
  const archive = openCanonicalArchive(":memory:");
  t.after(() => archive.close());
  archive.ingestBatch("one","1",[
    row(1,{source:"atp",scope:"ATP",kind:"player_profile",profile:first}),
    row(2,match()),
    row(3,{source:"atp",scope:"ATP",kind:"supplement",externalId:"m1",fields:{"point:1":{winnerSide:2}}}),
    row(4,{source:"atp",scope:"WTA",kind:"supplement",externalId:"m1",fields:{"point:1":{winnerSide:1}}})
  ]);
  const report = archive.report();
  assert.equal(report.canonicalMatches,1);
  assert.equal(report.indexedProfiles,1);
  assert.equal(report.isolatedObservations,1);
  assert.ok(report.fieldCoverage.some(field=>field.field==="point:1"));
});

test("tournament edition identity needs city, category, surface, season and name", t => {
  const archive = openCanonicalArchive(":memory:");
  t.after(() => archive.close());
  const event = (id, city) => ({id,name:"Example Open",metadata:{city,category:"250",surface:"hard"}});
  archive.ingestBatch("one","1",[
    row(1,match({tournament:event("event","Paris")})),
    row(2,crossSource({tournament:event("e2","Paris")})),
    row(3,crossSource({tournament:event("e3","Lyon"),externalId:"m3"}))
  ]);
  assert.equal(archive.report().canonicalMatches,2);
  assert.equal(archive.report().tournaments,2);
});

test("contradictory provider birth dates block subsequent unattended match links", t => {
  const archive = openCanonicalArchive(":memory:");
  t.after(() => archive.close());
  const profile = value => ({source:"atp",scope:"ATP",kind:"player_profile",profile:value});
  archive.ingestBatch("one","1",[
    row(1,profile(first)),row(2,profile({...first,birth:"1995-06-01"})),row(3,match())
  ]);
  assert.equal(archive.report().blockedProviderIds,1);
  assert.equal(archive.report().canonicalMatches,0);
  assert.equal(archive.report().isolatedObservations,2);
});
