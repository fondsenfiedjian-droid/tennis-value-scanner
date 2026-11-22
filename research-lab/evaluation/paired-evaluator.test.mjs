import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCommonSample } from "./paired-evaluator.mjs";

function rec(id, winner="A", systems={}) {
  const base={
    status:"available",probability_a:0.6,probability_b:0.4,
    prediction_created_at:"2026-06-01T10:00:00Z",
    data_cutoff_at:"2026-06-01T09:59:00Z"
  };
  return {
    match_id:id,tour:"ATP",surface:"Hard",player_a_id:"A",player_b_id:"B",
    winner_id:winner,match_start_at:"2026-06-01T12:00:00Z",
    systems:{PFE:{...base},SMA:{...base,probability_a:0.7,probability_b:0.3},...systems}
  };
}

test("compares candidate and PFE on identical eligible match IDs",()=>{
  const rows=[rec("1","A"),rec("2","B"),rec("3","A",{SMA:{status:"insufficient_data"}})];
  const out=evaluateCommonSample(rows,{candidates:["SMA"]});
  assert.equal(out.candidates.SMA.overall.matches,2);
  assert.equal(out.candidates.SMA.excluded.candidate_unavailable,1);
  assert.equal(out.unique_matches,3);
});

test("rejects predictions created at or after match start",()=>{
  const x=rec("1");
  x.systems.SMA.prediction_created_at="2026-06-01T12:00:00Z";
  assert.throws(()=>evaluateCommonSample([x]),/strictly pre-match/);
});

test("rejects data cutoff after prediction timestamp",()=>{
  const x=rec("1");
  x.systems.PFE.data_cutoff_at="2026-06-01T10:01:00Z";
  assert.throws(()=>evaluateCommonSample([x]),/data cutoff is after prediction/);
});

test("rejects probability sums that do not equal one",()=>{
  const x=rec("1");
  x.systems.SMA.probability_b=0.5;
  assert.throws(()=>evaluateCommonSample([x]),/sum to 1/);
});

test("rejects conflicting duplicate match IDs",()=>{
  assert.throws(()=>evaluateCommonSample([rec("1"),rec("1","B")]),/Conflicting duplicate/);
});

test("exact duplicate rows collapse to one match",()=>{
  const x=rec("1");
  const out=evaluateCommonSample([x,JSON.parse(JSON.stringify(x))],{candidates:["SMA"]});
  assert.equal(out.input_records,2);
  assert.equal(out.unique_matches,1);
});

test("records per-tour and per-surface strata",()=>{
  const a=rec("1");
  const b=rec("2");
  b.tour="WTA";b.surface="Clay";b.player_a_id="C";b.player_b_id="D";b.winner_id="C";
  const out=evaluateCommonSample([a,b],{candidates:["SMA"]});
  assert.equal(out.candidates.SMA.by_tour.ATP.matches,1);
  assert.equal(out.candidates.SMA.by_tour.WTA.matches,1);
  assert.equal(out.candidates.SMA.by_surface.Clay.matches,1);
});

test("lower loss is reported as a negative paired delta",()=>{
  const a=rec("1","A");
  a.systems.SMA.probability_a=0.9;a.systems.SMA.probability_b=0.1;
  const b=rec("2","B");
  b.systems.SMA.probability_a=0.1;b.systems.SMA.probability_b=0.9;
  const out=evaluateCommonSample([a,b],{candidates:["SMA"]});
  assert.ok(out.candidates.SMA.overall.paired_delta_candidate_minus_pfe.brier.mean<0);
});
