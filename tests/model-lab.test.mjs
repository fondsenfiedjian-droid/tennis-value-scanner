import test from "node:test";
import assert from "node:assert/strict";
import { parseMatchCsv, mergeMatchDatasets, runWalkForward } from "../developer/model-lab-core.mjs";

const csv=[
  "match_id;date;surface;joueur1_id;joueur2_id;vainqueur_id",
  "m1;2025-01-01;dur;A;B;A",
  "m2;2025-01-01;terre battue;A;C;C",
  "m3;2025-01-02;dur;A;B;A",
  "m4;2025-01-03;gazon;B;C;B",
  "m5;2025-01-04;moquette intérieur;A;C;A",
  "bad;not-a-date;dur;A;B;A",
  "invalid-calendar;2025-02-31;dur;A;B;A",
  "m5;2025-01-04;moquette intérieur;A;C;A"
].join("\n");

test("CSV parser normalizes surfaces, sorts chronologically and rejects invalid or duplicate rows",()=>{
  const parsed=parseMatchCsv(csv);
  assert.equal(parsed.matches.length,5);
  assert.equal(parsed.rejected,3);
  assert.equal(parsed.matches[0].surface,"Hard");
  assert.equal(parsed.matches[1].surface,"Clay");
  assert.equal(parsed.matches[3].surface,"Grass");
  assert.equal(parsed.matches[4].surface,"Carpet");
  assert.equal(parsed.firstDate,"2025-01-01");
  assert.equal(parsed.lastDate,"2025-01-04");
  assert.equal(parsed.matches.some(match=>match.id==="invalid-calendar"),false);
});
test("walk-forward comparison evaluates every model on the same sample",async()=>{
  const parsed=parseMatchCsv(csv);
  const output=await runWalkForward(parsed.matches,[
    {id:"general-elo-v2",name:"Baseline",k:32,surfaceWeight:.3,formWeight:80,h2hWeight:60},
    {id:"candidate-k80",name:"K 80",k:80,surfaceWeight:.3,formWeight:80,h2hWeight:60}
  ]);
  assert.equal(output.totalMatches,5);
  assert.equal(output.results.length,2);
  for(const row of output.results){
    assert.equal(row.n,5);
    assert.ok(Number.isFinite(row.brier));
    assert.ok(Number.isFinite(row.logLoss));
    assert.ok(Number.isFinite(row.accuracy));
    assert.ok(Number.isFinite(row.ece));
    assert.equal("roi" in row,false);
  }
  assert.equal(output.results[0].deltaBrier,0);
});
test("same-day predictions are invariant to source row order",async()=>{
  const parsed=parseMatchCsv(csv);
  const reversed=parseMatchCsv([csv.split("\n")[0],...csv.split("\n").slice(1).reverse()].join("\n"));
  const model=[{id:"general-elo-v2",name:"Baseline",k:32,surfaceWeight:.3,formWeight:80,h2hWeight:60}];
  const a=await runWalkForward(parsed.matches,model);
  const b=await runWalkForward(reversed.matches,model);
  assert.equal(a.results[0].brier,b.results[0].brier);
  assert.equal(a.results[0].logLoss,b.results[0].logLoss);
});

test("same-day outcomes do not update Elo before that day's predictions finish",async()=>{
  const sameDay=parseMatchCsv([
    "match_id;date;surface;joueur1_id;joueur2_id;vainqueur_id",
    "m1;2025-02-01;dur;A;B;A",
    "m2;2025-02-01;dur;A;B;B"
  ].join("\n"));
  const output=await runWalkForward(sameDay.matches,[
    {id:"general-elo-v2",name:"Baseline",k:32,surfaceWeight:0,formWeight:0,h2hWeight:0}
  ]);
  assert.equal(output.results[0].n,2);
  assert.equal(output.results[0].brier,0.25);
});

test("date-only day/month/year parsing is stable and rejects impossible dates",()=>{
  const parsed=parseMatchCsv([
    "match_id;date;surface;joueur1_id;joueur2_id;vainqueur_id",
    "dmy;04/02/2025;dur;A;B;A",
    "bad-dmy;31/02/2025;dur;A;B;A"
  ].join("\n"));
  assert.equal(parsed.matches.length,1);
  assert.equal(parsed.matches[0].date,"2025-02-04");
  assert.equal(parsed.rejected,1);
});
test("CSV merge keeps identical duplicates once and excludes conflicting match IDs",()=>{
  const first=parseMatchCsv([
    "match_id;date;surface;joueur1_id;joueur2_id;vainqueur_id",
    "same;2025-03-01;dur;A;B;A",
    "conflict;2025-03-02;dur;A;C;A"
  ].join("\n"));
  const second=parseMatchCsv([
    "match_id;date;surface;joueur1_id;joueur2_id;vainqueur_id",
    "same;2025-03-01;dur;B;A;A",
    "conflict;2025-03-02;dur;A;C;C",
    "new;2025-03-03;gazon;B;C;B"
  ].join("\n"));
  const merged=mergeMatchDatasets([first,second]);
  assert.deepEqual(merged.matches.map(match=>match.id),["same","new"]);
  assert.equal(merged.conflicts,1);
  assert.equal(merged.rejected,3);
});

test("parser excludes conflicting duplicate IDs within one CSV",()=>{
  const parsed=parseMatchCsv([
    "match_id;date;surface;joueur1_id;joueur2_id;vainqueur_id",
    "collision;2025-04-01;dur;A;B;A",
    "collision;2025-04-01;dur;A;B;B",
    "valid;2025-04-02;dur;A;C;C"
  ].join("\n"));
  assert.deepEqual(parsed.matches.map(match=>match.id),["valid"]);
  assert.equal(parsed.conflicts,1);
  assert.equal(parsed.rejected,2);
});
