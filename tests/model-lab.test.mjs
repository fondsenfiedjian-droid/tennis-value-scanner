import test from "node:test";
import assert from "node:assert/strict";
import { parseMatchCsv, runWalkForward } from "../developer/model-lab-core.mjs";

const csv=[
  "match_id;date;surface;joueur1_id;joueur2_id;vainqueur_id",
  "m1;2025-01-01;dur;A;B;A",
  "m2;2025-01-01;terre battue;A;C;C",
  "m3;2025-01-02;dur;A;B;A",
  "m4;2025-01-03;gazon;B;C;B",
  "m5;2025-01-04;moquette intérieur;A;C;A",
  "bad;not-a-date;dur;A;B;A",
  "m5;2025-01-04;moquette intérieur;A;C;A"
].join("\n");

test("CSV parser normalizes surfaces, sorts chronologically and rejects invalid or duplicate rows",()=>{
  const parsed=parseMatchCsv(csv);
  assert.equal(parsed.matches.length,5);
  assert.equal(parsed.rejected,2);
  assert.equal(parsed.matches[0].surface,"Hard");
  assert.equal(parsed.matches[1].surface,"Clay");
  assert.equal(parsed.matches[3].surface,"Grass");
  assert.equal(parsed.matches[4].surface,"Carpet");
  assert.equal(parsed.firstDate,"2025-01-01");
  assert.equal(parsed.lastDate,"2025-01-04");
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
