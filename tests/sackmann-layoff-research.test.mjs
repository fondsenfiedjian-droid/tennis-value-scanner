import test from "node:test";
import assert from "node:assert/strict";
import { calculateLayoffFeatures, runLayoffWalkForward } from "../scripts/sackmann-layoff-research.mjs";

function season(year,count=400) {
  const rows=[];
  for(let i=0;i<count;i++) {
    const a=String((i%24)+1);
    let b=String(((i*7+5)%24)+1);
    if(a===b)b=String((Number(b)%24)+1);
    const winner=i%3===0?a:b,loser=winner===a?b:a;
    rows.push({tourney_date:year+"01"+String((i%25)+1).padStart(2,"0"),
      tourney_id:year+"-T"+Math.floor(i/100),match_num:String(i%100),round:"R32",
      winner_id:winner,loser_id:loser,surface:i%2?"Hard":"Clay"});
  }
  return rows;
}

test("calculates relative inactivity and marks debut history as unknown",()=>{
  const f=calculateLayoffFeatures("20250101","20250301","20250401");
  assert.equal(f.player1LayoffDays,90);
  assert.equal(f.player2LayoffDays,31);
  assert.equal(f.player1Over90,1);
  assert.equal(f.player2Over90,0);
  assert.equal(f.unknownPriorCount,0);
  const debut=calculateLayoffFeatures(null,"20250301","20250401");
  assert.equal(debut.player1LayoffDays,null);
  assert.equal(debut.unknownPriorCount,1);
  assert.throws(()=>calculateLayoffFeatures("20250501",null,"20250401"),/after matchDate/);
});


test("return episode starts at zero matches and records gradual post-return progress",()=>{
  const first=calculateLayoffFeatures("20240101","20240301","20240719");
  assert.equal(first.player1LayoffDays,200);
  assert.equal(first.player1ReturnEpisode,1);
  assert.equal(first.player1ReturnMatchesLog,0);
  const afterOne=calculateLayoffFeatures("20240719","20240701","20240724",{
    player1ReturnEpisode:true,player2ReturnEpisode:false,player1ReturnMatches:1
  });
  assert.equal(afterOne.player1ReturnEpisode,1);
  assert.ok(afterOne.player1ReturnMatchesLog>0);
  assert.equal(afterOne.player2ReturnEpisode,0);
});

test("walk-forward layoff model is research-only and evaluates only with prior-year training",()=>{
  const rows=[...season("2000"),...season("2001"),...season("2002"),...season("2003"),...season("2004")];
  const report=runLayoffWalkForward(rows,{tour:"atp",evaluationStart:"20030101",evaluationEnd:"20041231",
    minTrainingMatches:100,maxTrainingRows:250});
  assert.equal(report.researchOnly,true);
  assert.ok(report.summary.baseline.matches>0);
  assert.ok(report.summary.candidate.matches>0);
  assert.ok(Number.isFinite(report.summary.delta.brier));
  assert.ok(report.byYear["2003"].trainingMatches>0);
  assert.match(report.featureDefinitions.inactivity,/not a diagnosis/);
  assert.deepEqual(Object.keys(report.cohorts.layoffDays),["30_59","60_89","90_179","180_364","365_plus"].filter(key=>key in report.cohorts.layoffDays));
  assert.deepEqual(Object.keys(report.cohorts.firstMatchesAfterReturn),["1","2","3"].filter(key=>key in report.cohorts.firstMatchesAfterReturn));
  for(const cohort of Object.values(report.cohorts.layoffDays)){
    assert.equal(cohort.baseline.matches,cohort.playerMatchObservations);
    assert.equal(cohort.candidate.matches,cohort.playerMatchObservations);
    assert.ok(Number.isFinite(cohort.delta.brier));
    for(const model of [cohort.baseline,cohort.candidate]){
      const d=model.diagnostics;
      assert.ok(d);
      assert.ok(d.extreme5.count<=model.matches);
      assert.ok(d.extreme5.wrong<=d.extreme5.count);
      assert.ok(d.extreme1.count<=d.extreme5.count);
      assert.equal(d.calibrationBins.reduce((sum,bin)=>sum+bin.count,0),model.matches);
      assert.ok(Number.isFinite(d.maxIndividualLogLoss));
    }
  }
});

test("optional worst-error audit records player context and candidate feature contributions",()=>{
  const rows=[...season("2000"),...season("2001"),...season("2002"),...season("2003")];
  const report=runLayoffWalkForward(rows,{tour:"wta",evaluationStart:"20030101",evaluationEnd:"20031231",
    minTrainingMatches:100,maxTrainingRows:250,captureWorstErrors:true});
  assert.equal(report.worstErrorsIncluded,true);
  const cohort=report.cohorts.firstMatchesAfterReturn["1"];
  assert.ok(cohort);
  const errors=cohort.candidate.diagnostics.worstErrors;
  assert.ok(errors.length>0);
  assert.ok(errors.length<=20);
  const worst=errors[0];
  assert.match(worst.date,/^2003/);
  assert.ok(worst.playerId);
  assert.ok(worst.opponentId);
  assert.ok(Number.isFinite(worst.baselineProbability));
  assert.ok(Number.isFinite(worst.candidateProbability));
  assert.equal(worst.candidateFeatureContributions.features.length,13);
  assert.ok(worst.candidateFeatureContributions.features.every(item=>Number.isFinite(item.logitContribution)));
});

test("feature ablation excludes only the requested candidate features",()=>{
  const rows=[...season("2000"),...season("2001"),...season("2002"),...season("2003")];
  const report=runLayoffWalkForward(rows,{tour:"atp",evaluationStart:"20030101",evaluationEnd:"20031231",
    minTrainingMatches:100,maxTrainingRows:250,symmetricTraining:true,
    excludedFeatures:["unknownPriorCount","layoffMaxLog"]});
  assert.equal(report.symmetricTraining,true);
  assert.deepEqual(report.excludedFeatures,["unknownPriorCount","layoffMaxLog"]);
  assert.ok(!report.candidateFeatures.includes("unknownPriorCount"));
  assert.ok(!report.candidateFeatures.includes("layoffMaxLog"));
  assert.ok(report.candidateFeatures.includes("layoffDiffLog"));
  assert.ok(Number.isFinite(report.summary.candidate.brier));
});

test("future seasons cannot change an earlier evaluation year",()=>{
  const past=[...season("2000"),...season("2001"),...season("2002"),...season("2003")];
  const options={tour:"wta",evaluationStart:"20030101",evaluationEnd:"20031231",
    minTrainingMatches:100,maxTrainingRows:250};
  const a=runLayoffWalkForward(past,options);
  const b=runLayoffWalkForward([...past,...season("2004")],options);
  assert.deepEqual(b.byYear["2003"],a.byYear["2003"]);
  assert.deepEqual(b.summary,a.summary);
});

test("same-date matches are order-independent because state updates happen after the date",()=>{
  const rows=[...season("2000"),...season("2001"),...season("2002"),...season("2003")];
  const reversed=[...rows].reverse();
  const options={tour:"atp",evaluationStart:"20030101",evaluationEnd:"20031231",
    minTrainingMatches:100,maxTrainingRows:250};
  assert.deepEqual(runLayoffWalkForward(rows,options).summary,runLayoffWalkForward(reversed,options).summary);
});

test("rejects invalid tour, date window and Elo K factor",()=>{
  assert.throws(()=>runLayoffWalkForward([],{tour:"challenger"}),/tour must be atp or wta/);
  assert.throws(()=>runLayoffWalkForward([],{tour:"atp",evaluationStart:"20240230"}),/valid ordered/);
  assert.throws(()=>runLayoffWalkForward([],{tour:"atp",kFactor:0}),/kFactor/);
});


test("symmetric training mirrors player orientation for layoff features",()=>{
  const rows=[...season("2000"),...season("2001"),...season("2002"),...season("2003")];
  const report=runLayoffWalkForward(rows,{tour:"wta",evaluationStart:"20030101",evaluationEnd:"20031231",
    minTrainingMatches:100,maxTrainingRows:250,symmetricTraining:true});
  assert.equal(report.symmetricTraining,true);
  assert.ok(report.summary.candidate.matches>0);
  assert.ok(Number.isFinite(report.summary.candidate.brier));
});
