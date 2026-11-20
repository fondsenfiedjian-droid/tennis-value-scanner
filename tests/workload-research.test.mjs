import test from "node:test";
import assert from "node:assert/strict";
import { buildPreMatchWorkload } from "../scripts/workload-research.mjs";

const row=(date,match,winner,loser,durationMinutes)=>({
  tourney_date:date,tourney_id:"1",match_num:String(match),
  winner_id:String(winner),loser_id:String(loser),score:"6-4 6-4",
  durationMinutes
});

test("workload features use only earlier UTC calendar days and exclude same-day matches",()=>{
  const rows=[
    row("20250101",1,1,2,120),
    row("20250101",2,1,3,90),
    row("20250103",3,1,4,60),
    row("20250105",4,1,5,80),
    row("20250105",5,1,6,70)
  ];
  const features=buildPreMatchWorkload(rows);
  const target=features.get("20250105:1:5");
  assert.deepEqual(target,{
    matches3:1,matches7:3,playingDays7:2,restDays:2,minutes7:270,durationCoverage7:1
  });
  assert.deepEqual(features.get("20250105:1:6"),target);
});

test("unknown prior durations remain unknown in coverage rather than being fabricated",()=>{
  const rows=[
    row("20250101",1,1,2,null),
    row("20250103",2,1,3,60),
    row("20250105",3,1,4,75)
  ];
  const features=buildPreMatchWorkload(rows);
  const target=features.get("20250105:1:4");
  assert.equal(target.matches7,2);
  assert.equal(target.minutes7,60);
  assert.equal(target.durationCoverage7,0.5);
});

test("workload windows count calendar dates inclusively and cap long rest intervals",()=>{
  const rows=[
    row("20250101",1,1,2,100),
    row("20250108",2,1,3,100),
    row("20250220",3,1,4,100)
  ];
  const features=buildPreMatchWorkload(rows);
  assert.deepEqual(features.get("20250108:1:3"),{
    matches3:0,matches7:1,playingDays7:1,restDays:7,minutes7:100,durationCoverage7:1
  });
  assert.equal(features.get("20250220:1:4").restDays,30);
  assert.equal(features.get("20250220:1:4").matches7,0);
});
