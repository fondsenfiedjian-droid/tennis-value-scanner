import test from "node:test";
import assert from "node:assert/strict";
import { auditServeReturnStats, buildPreMatchServeReturn, evaluateFixedHoldout } from "../scripts/sackmann-serve-return-research.mjs";

const row=(date,match,winner,loser,winnerStats,loserStats,surface="Hard")=>({
 tourney_date:date,tourney_id:"T",match_num:String(match),winner_id:String(winner),loser_id:String(loser),score:"6-4 6-4",surface,
 ...Object.fromEntries(["w","l"].flatMap((prefix,i)=>{
  const stats=i===0?winnerStats:loserStats;return Object.entries(stats).map(([key,value])=>[prefix+"_"+key,value]);
 }))
});
const stats=(svpt,firstIn,firstWon,secondWon)=>({svpt,"1stIn":firstIn,"1stWon":firstWon,"2ndWon":secondWon});

test("pre-match serve and return features use only earlier matches and stable player orientation",()=>{
 const rows=[
  row("20250101",1,1,2,stats(100,60,40,20),stats(100,60,30,20)),
  row("20250102",2,3,4,stats(100,60,45,25),stats(100,60,30,20)),
  row("20250103",3,3,1,stats(90,55,35,20),stats(90,55,30,15))
 ];
 const target=buildPreMatchServeReturn(rows,{minOverallMatches:1,minSurfaceMatches:1}).get("20250103:1:3:Hard");
 assert.ok(target);assert.ok(Math.abs(target.serveDiff-(-0.1))<1e-9);
 assert.ok(Math.abs(target.returnDiff)<1e-9);assert.equal(target.minOverallPriorMatches,1);
});
test("same-day matches cannot leak serve or return statistics into each other",()=>{
 const rows=[
  row("20250101",1,1,2,stats(100,60,40,20),stats(100,60,30,20)),
  row("20250101",2,3,1,stats(100,60,50,20),stats(100,60,30,20)),
  row("20250102",3,1,3,stats(100,60,40,20),stats(100,60,30,20))
 ];
 const features=buildPreMatchServeReturn(rows,{minOverallMatches:1,minSurfaceMatches:1});
 assert.equal(features.get("20250101:1:3:Hard").serveDiff,null);
 const next=features.get("20250102:1:3:Hard");assert.ok(Number.isFinite(next.serveDiff));
 assert.equal(next.minOverallPriorMatches,1);
});
test("surface rates require enough prior matches on the same surface",()=>{
 const rows=[
  row("20250101",1,1,2,stats(100,60,40,20),stats(100,60,30,20),"Clay"),
  row("20250102",2,3,4,stats(100,60,45,25),stats(100,60,30,20),"Hard"),
  row("20250103",3,1,3,stats(100,60,40,20),stats(100,60,30,20),"Clay")
 ];
 const target=buildPreMatchServeReturn(rows,{minOverallMatches:1,minSurfaceMatches:2}).get("20250103:1:3:Clay");
 assert.equal(target.surfaceServeDiff,null);assert.ok(Number.isFinite(target.serveDiff));
});
test("matches with incomplete serve statistics do not enter player histories",()=>{
 const incomplete=row("20250101",1,1,2,stats(100,60,40,20),stats(100,60,30,20));delete incomplete.l_2ndWon;
 const target=row("20250102",2,1,3,stats(100,60,40,20),stats(100,60,30,20));
 const features=buildPreMatchServeReturn([incomplete,target],{minOverallMatches:1,minSurfaceMatches:1});
 assert.equal(features.get("20250102:1:3:Hard").serveDiff,null);
});


test("rejects impossible second-serve wins beyond second-serve opportunities", () => {
 const impossible=row("20250101",1,1,2,stats(10,8,2,3),stats(10,8,2,0));
 const target=row("20250102",2,1,3,stats(10,8,2,0),stats(10,8,2,0));
 const features=buildPreMatchServeReturn([impossible,target],{minOverallMatches:1,minSurfaceMatches:1});
 assert.equal(features.get("20250102:1:3:Hard").serveDiff,null);
});

test("accepts valid zero-second-serve opportunity matches without fabricating second-serve wins", () => {
 const valid=row("20250101",1,1,2,stats(10,10,8,0),stats(10,10,7,0));
 const p5=row("20250101",2,3,5,stats(10,8,6,1),stats(10,8,5,1));
 const p6=row("20250101",3,4,6,stats(10,8,6,1),stats(10,8,5,1));
 const target=row("20250102",4,5,6,stats(10,10,8,0),stats(10,10,7,0));
 const quality=auditServeReturnStats([valid]);
 assert.deepEqual(quality.winner,{valid:1,invalid:0,reasons:{}});
 assert.deepEqual(quality.loser,{valid:1,invalid:0,reasons:{}});
 const features=buildPreMatchServeReturn([valid,p5,p6,target],{minOverallMatches:1,minSurfaceMatches:1});
 assert.ok(Number.isFinite(features.get("20250102:5:6:Hard").serveDiff));
});


test("reports serve-stat quality and isolates impossible second-serve opportunity rows", () => {
 const rows=[
  row("20250101",1,1,2,stats(10,8,2,3),stats(10,8,2,0)),
  row("20250102",2,3,4,stats(10,10,8,0),stats(10,10,7,0))
 ];
 const report=auditServeReturnStats(rows);
 assert.equal(report.matches,2);
 assert.deepEqual(report.winner,{valid:1,invalid:1,reasons:{second_won_exceeds_opportunities:1}});
 assert.deepEqual(report.loser,{valid:2,invalid:0,reasons:{}});
});


test("history window controls which earlier matches enter pre-match rates",()=>{
 const rows=[
  row("20240101",1,1,2,stats(100,60,40,20),stats(100,60,30,20)),
  row("20240801",2,1,2,stats(100,60,40,20),stats(100,60,30,20))
 ];
 const short=buildPreMatchServeReturn(rows,{minOverallMatches:1,minSurfaceMatches:1,windowDays:180}).get("20240801:1:2:Hard");
 const full=buildPreMatchServeReturn(rows,{minOverallMatches:1,minSurfaceMatches:1,windowDays:365}).get("20240801:1:2:Hard");
 assert.equal(short.serveDiff,null);
 assert.ok(Number.isFinite(full.serveDiff));
});

test("history window and minimum-history settings reject invalid values",()=>{
 const rows=[row("20250101",1,1,2,stats(100,60,40,20),stats(100,60,30,20))];
 assert.throws(()=>buildPreMatchServeReturn(rows,{windowDays:0}),/windowDays/);
 assert.throws(()=>buildPreMatchServeReturn(rows,{minOverallMatches:0}),/minOverallMatches/);
 assert.throws(()=>buildPreMatchServeReturn(rows,{minSurfaceMatches:0}),/minSurfaceMatches/);
});


test("fixed later-period holdout freezes coefficients before the holdout begins", () => {
 const rows=Array.from({length:500},(_,i)=>({
  year:2016+Math.floor(i/56),baseProbability:0.5,outcome:i%21>10?1:0,
  features:{serveDiff:(i%21-10)/10}
 }));
 for(let i=0;i<40;i++)rows.push({
  year:i<20?2025:2026,baseProbability:0.5,outcome:i%3===0?1:0,
  features:{serveDiff:(i%11-5)/5}
 });
 rows.push({year:2027,baseProbability:0.5,outcome:1,features:{serveDiff:1}});
 const result=evaluateFixedHoldout(rows,["serveDiff"],{
  featureStartYear:2016,holdoutStartYear:2025,lastEvaluationYear:2026
 });
 assert.equal(result.status,"ok");
 assert.equal(result.trainingStartYear,2016);
 assert.equal(result.trainingEndYear,2024);
 assert.equal(result.holdoutStartYear,2025);
 assert.equal(result.holdoutEndYear,2026);
 assert.equal(result.trainingMatches,500);
 assert.equal(result.evaluationMatches,40);
 assert.equal(result.metrics.matches,40);
 assert.ok(Number.isFinite(result.metrics.adjusted.brier));
 assert.ok(Number.isFinite(result.standardizedCoefficients.serveDiff));
 const changedHoldout=rows.map(row=>row.year>=2025?{...row,outcome:1-row.outcome}:row);
 const refit=evaluateFixedHoldout(changedHoldout,["serveDiff"],{
  featureStartYear:2016,holdoutStartYear:2025,lastEvaluationYear:2026
 });
 assert.deepEqual(refit.standardizedCoefficients,result.standardizedCoefficients);
});


test("residualized surface effects and count-based shrinkage blend surface rates toward overall rates", () => {
 const rows=[
  row("20250101",1,1,2,stats(100,60,40,20),stats(100,60,30,20),"Hard"),
  row("20250102",2,1,2,stats(100,60,50,30),stats(100,60,30,20),"Clay"),
  row("20250103",3,3,4,stats(100,60,30,20),stats(100,60,30,20),"Hard"),
  row("20250104",4,3,4,stats(100,60,30,20),stats(100,60,30,20),"Clay"),
  row("20250105",5,3,1,stats(100,60,30,20),stats(100,60,30,20),"Hard")
 ];
 const target=buildPreMatchServeReturn(rows,{minOverallMatches:1,minSurfaceMatches:1}).get("20250105:1:3:Hard");
 assert.ok(target);
 assert.ok(Math.abs(target.serveDiff-0.2)<1e-9);
 assert.ok(Math.abs(target.surfaceServeDiff-0.1)<1e-9);
 assert.ok(Math.abs(target.surfaceServeResidual-(-0.1))<1e-9);
 assert.equal(target.minSurfacePriorMatches,1);
 assert.ok(Math.abs(target.surfaceServeDiffShrink5-(0.2+(1/6)*(-0.1)))<1e-9);
 assert.ok(Math.abs(target.surfaceServeDiffShrink10-(0.2+(1/11)*(-0.1)))<1e-9);
 assert.ok(Math.abs(target.surfaceServeDiffShrink20-(0.2+(1/21)*(-0.1)))<1e-9);
});
