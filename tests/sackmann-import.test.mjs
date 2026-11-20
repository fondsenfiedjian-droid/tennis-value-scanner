import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSackmannRows, toCsv } from "../scripts/sackmann-import.mjs";

const row=(overrides={})=>({
  tourney_date:"20250106",tourney_id:"2025-001",tourney_name:"Example Open",tourney_level:"A",
  round:"F",match_num:"300",surface:"Hard",winner_id:"100",loser_id:"200",
  winner_name:"Player One",loser_name:"Player Two",winner_rank:"12",loser_rank:"30",
  winner_rank_points:"3200",loser_rank_points:"1400",winner_age:"24.5",loser_age:"27.1",
  score:"6-4 6-3",best_of:"3",minutes:"92",...overrides
});

test("normalizes Sackmann match rows and retains pre-match rank and age fields",()=>{
  const result=normalizeSackmannRows([row()],"atp");
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].tour,"atp");
  assert.equal(result.rows[0].surface,"Hard");
  assert.equal(result.rows[0].winner_rank,12);
  assert.equal(result.rows[0].loser_rank,30);
  assert.equal(result.rows[0].winner_age,24.5);
  assert.equal(result.rows[0].durationMinutes,92);
});

test("keeps ATP and WTA explicit and rejects unknown tour",()=>{
  assert.equal(normalizeSackmannRows([row()],"wta").rows[0].tour,"wta");
  assert.throws(()=>normalizeSackmannRows([row()],"challenger"),/tour must be atp or wta/);
});

test("excludes invalid IDs, impossible dates and retired or walkover results",()=>{
  const result=normalizeSackmannRows([
    row({winner_id:"0"}),row({tourney_date:"20250230"}),
    row({score:"6-4 2-1 RET"}),row({score:"W/O"}),
    row({score:"7-5 2-1"}),row({score:"6-4 6-3",best_of:"5"})
  ],"atp");
  assert.equal(result.rows.length,0);
  assert.deepEqual(result.excluded,{invalidDate:1,invalidPlayers:1,unfinishedOrRetired:2,unsupportedSurface:0});
});

test("rejects partial scores that do not contain enough completed sets",()=>{
  assert.equal(normalizeSackmannRows([row({score:"7-5 2-1"})],"atp").rows.length,0);
  assert.equal(normalizeSackmannRows([row({score:"6-4 6-3",best_of:"5"})],"atp").rows.length,0);
  assert.equal(normalizeSackmannRows([row({score:"6-4 6-3 6-2",best_of:"5"})],"atp").rows.length,1);
});

test("preserves unknown surface as blank and reports it",()=>{
  const result=normalizeSackmannRows([row({surface:"Unknown"})],"atp");
  assert.equal(result.rows[0].surface,"");
  assert.equal(result.excluded.unsupportedSurface,1);
});

test("CSV output safely quotes commas and quotes",()=>{
  const csv=toCsv([{tourney_name:'Open, "A"',tour:"atp"}]);
  assert.match(csv,/"Open, ""A"""/);
});
