import test from "node:test";
import assert from "node:assert/strict";
import { runPerformanceGapWalkForward } from "../scripts/sackmann-performance-gap-research.mjs";

function season(year,count=360){
 const rows=[];
 for(let i=0;i<count;i++){
  const a=String((i%24)+1),b=String(((i*7+5)%24)+1===Number(a)?((i*7+6)%24)+1:((i*7+5)%24)+1);
  const winner=i%3===0?a:b,loser=winner===a?b:a;
  rows.push({tourney_date:year+"01"+String(i%25+1).padStart(2,"0"),tourney_id:year+"-T"+Math.floor(i/80),match_num:String(i%80),round:"R32",winner_id:winner,loser_id:loser,surface:i%2?"Hard":"Clay",score:"6-4 6-3"});
 }
 return rows;
}
test("walk-forward performance gap produces finite matched metrics",()=>{
 const rows=[...season("2000"),...season("2001"),...season("2002"),...season("2003"),...season("2004")];
 const report=runPerformanceGapWalkForward(rows,{tour:"atp",evaluationStart:"20030101",evaluationEnd:"20041231",minTrainingMatches:100,maxTrainingRows:500});
 assert.equal(report.eligibleMatches,rows.length);
 assert.ok(report.summary.baseline.matches>0);
 assert.equal(report.summary.baseline.matches,report.summary.candidate.matches);
 assert.ok(Number.isFinite(report.summary.delta.brier));
 assert.ok(report.bySurface.hard.candidate.matches>0);
});
test("same-day results do not affect another same-day match features",()=>{
 const base=[...season("2000",250),...season("2001",250),...season("2002",250)];
 const date="20030101";
 const a={tourney_date:date,tourney_id:"X",match_num:"1",round:"F",winner_id:"1",loser_id:"2",surface:"Hard"};
 const b={tourney_date:date,tourney_id:"Y",match_num:"2",round:"F",winner_id:"3",loser_id:"4",surface:"Hard"};
 const first=runPerformanceGapWalkForward([...base,a,b],{tour:"wta",evaluationStart:date,evaluationEnd:date,minTrainingMatches:100});
 const flipped=runPerformanceGapWalkForward([...base,{...a,winner_id:"2",loser_id:"1"},b],{tour:"wta",evaluationStart:date,evaluationEnd:date,minTrainingMatches:100});
 assert.equal(first.summary.baseline.matches,flipped.summary.baseline.matches);
});
test("future seasons cannot alter earlier evaluation-year results",()=>{
 const history=[...season("2000"),...season("2001"),...season("2002"),...season("2003")];
 const options={tour:"atp",evaluationStart:"20030101",evaluationEnd:"20031231",minTrainingMatches:100};
 const a=runPerformanceGapWalkForward(history,options);
 const b=runPerformanceGapWalkForward([...history,...season("2004")],options);
 assert.deepEqual(b.byYear["2003"],a.byYear["2003"]);
});
test("rejects invalid dates and tours",()=>{
 assert.throws(()=>runPerformanceGapWalkForward([],{tour:"itf"}),/tour/);
 assert.throws(()=>runPerformanceGapWalkForward([],{evaluationStart:"20240230"}),/valid ordered/);
});
