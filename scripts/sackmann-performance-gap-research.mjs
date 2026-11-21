#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseCsv } from "./backtest.mjs";
import { fitLogistic, predictLogistic } from "./sackmann-rank-age-research.mjs";

const validDate = value => {
  const s=String(value??"");
  if(!/^\d{8}$/.test(s)) return null;
  const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6,8);
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?s:null;
};
const validId = value => /^\d+$/.test(String(value??"")) && Number(value)>0;
const clamp = p => Math.min(1-1e-9,Math.max(1e-9,p));
const FEATURES = ["gapMean3Diff","gapMean5Diff","gapMean10Diff","lossRate5Diff","lossRate10Diff","lossStreakDiff","historyCountDiff"];

function metric(){return {n:0,brier:0,logLoss:0,correct:0};}
function add(bucket,p,y){p=clamp(p);bucket.n++;bucket.brier+=(p-y)**2;bucket.logLoss-=y*Math.log(p)+(1-y)*Math.log(1-p);bucket.correct+=p>.5?y:p<.5?1-y:.5;}
function finish(bucket){return bucket.n?{matches:bucket.n,brier:+(bucket.brier/bucket.n).toFixed(6),logLoss:+(bucket.logLoss/bucket.n).toFixed(6),accuracy:+(100*bucket.correct/bucket.n).toFixed(2)}:{matches:0,brier:null,logLoss:null,accuracy:null};}
function comparison(){return {baseline:metric(),candidate:metric()};}
function finishComparison(b){const baseline=finish(b.baseline),candidate=finish(b.candidate);return {baseline,candidate,delta:{brier:baseline.brier==null?null:+(candidate.brier-baseline.brier).toFixed(6),logLoss:baseline.logLoss==null?null:+(candidate.logLoss-baseline.logLoss).toFixed(6),accuracy:baseline.accuracy==null?null:+(candidate.accuracy-baseline.accuracy).toFixed(2)}};}
function pairKey(a,b){return Number(a)<Number(b)?a+":"+b:b+":"+a;}

function prepare(rows){
 const clean=[];
 for(const row of rows){
  const date=validDate(row.tourney_date),winner=String(row.winner_id??""),loser=String(row.loser_id??"");
  if(!date||!validId(winner)||!validId(loser)||winner===loser)continue;
  const p1=Number(winner)<Number(loser)?winner:loser,p2=p1===winner?loser:winner;
  clean.push({date,year:date.slice(0,4),winner,loser,p1,p2,outcome:p1===winner?1:0,
   tourneyId:String(row.tourney_id??""),matchNum:String(row.match_num??""),round:String(row.round??""),surface:String(row.surface??"").trim().toLowerCase()});
 }
 clean.sort((a,b)=>a.date.localeCompare(b.date)||a.tourneyId.localeCompare(b.tourneyId)||a.matchNum.localeCompare(b.matchNum)||a.p1.localeCompare(b.p1)||a.p2.localeCompare(b.p2));
 const groups=new Map();
 for(const row of clean){
  const key=row.tourneyId&&row.matchNum?[row.tourneyId,row.date,row.matchNum,pairKey(row.winner,row.loser),row.round].join(":"):[row.date,pairKey(row.winner,row.loser),row.surface].join(":");
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
 }
 const unique=[];let duplicateRows=0,conflictingDuplicateMatches=0,conflictingDuplicateRows=0;
 for(const group of groups.values()){
  const sig=x=>JSON.stringify([x.date,x.winner,x.loser,x.surface]);
  if(new Set(group.map(sig)).size>1){conflictingDuplicateMatches++;conflictingDuplicateRows+=group.length;continue;}
  unique.push(group[0]);duplicateRows+=group.length-1;
 }
 unique.sort((a,b)=>a.date.localeCompare(b.date)||a.tourneyId.localeCompare(b.tourneyId)||a.matchNum.localeCompare(b.matchNum)||a.p1.localeCompare(b.p1)||a.p2.localeCompare(b.p2));
 return {rows:unique,sourceRows:rows.length,excludedRows:rows.length-clean.length+conflictingDuplicateRows,duplicateRows,conflictingDuplicateMatches,conflictingDuplicateRows};
}

function playerFeatures(history){
 const last10=history.slice(-10),last5=last10.slice(-5),last3=last10.slice(-3);
 const mean=items=>items.length?items.reduce((s,x)=>s+x.residual,0)/items.length:0;
 const losses=items=>items.reduce((s,x)=>s+(x.loss?1:0),0);
 let streak=0;for(let i=history.length-1;i>=0&&history[i].loss;i--)streak++;
 return {gapMean3:mean(last3),gapMean5:mean(last5),gapMean10:mean(last10),
  lossRate5:losses(last5)/5,lossRate10:losses(last10)/10,lossStreak:Math.min(streak,10),
  historyCount:Math.min(history.length,20)};
}
function makeObservation(match,ratings,histories){
 const r1=ratings.get(match.p1)??1500,r2=ratings.get(match.p2)??1500;
 const e1=1/(1+10**((r2-r1)/400));
 const a=playerFeatures(histories.get(match.p1)??[]),b=playerFeatures(histories.get(match.p2)??[]);
 return {...match,eloScaled:(r1-r2)/400,
  gapMean3Diff:a.gapMean3-b.gapMean3,gapMean5Diff:a.gapMean5-b.gapMean5,gapMean10Diff:a.gapMean10-b.gapMean10,
  lossRate5Diff:a.lossRate5-b.lossRate5,lossRate10Diff:a.lossRate10-b.lossRate10,
  lossStreakDiff:a.lossStreak-b.lossStreak,historyCountDiff:(a.historyCount-b.historyCount)/10,
  preMatchExpectedP1:e1,preMatchExpectedWinner:match.outcome?e1:1-e1};
}
function updateDay(day,ratings,histories,observations,k){
 const deltas=new Map(), additions=[];
 for(let i=0;i<day.length;i++){
  const m=day[i],o=observations[i],expected=o.preMatchExpectedP1;
  const residual=m.outcome-expected;
  additions.push([m.p1,{residual,loss:m.outcome===0}],[m.p2,{residual:-residual,loss:m.outcome===1}]);
  const winnerRating=ratings.get(m.winner)??1500,loserRating=ratings.get(m.loser)??1500;
  const p=1/(1+10**((loserRating-winnerRating)/400)),delta=k*(1-p);
  deltas.set(m.winner,(deltas.get(m.winner)??0)+delta);deltas.set(m.loser,(deltas.get(m.loser)??0)-delta);
 }
 for(const [id,delta] of deltas)ratings.set(id,(ratings.get(id)??1500)+delta);
 for(const [id,item] of additions){if(!histories.has(id))histories.set(id,[]);histories.get(id).push(item);}
}

export function runPerformanceGapWalkForward(inputRows,options={}){
 const tour=options.tour??"atp";if(!["atp","wta"].includes(tour))throw new RangeError("tour must be atp or wta");
 const k=Number.isFinite(options.kFactor)?options.kFactor:32;
 const start=validDate(options.evaluationStart??"20000101"),end=validDate(options.evaluationEnd??"20261231");
 if(!start||!end||start>end)throw new RangeError("evaluationStart/evaluationEnd must be valid ordered YYYYMMDD dates");
 const minTrainingMatches=Number.isInteger(options.minTrainingMatches)?options.minTrainingMatches:1000;
 const maxTrainingRows=Number.isInteger(options.maxTrainingRows)?options.maxTrainingRows:50000;
 const excludedFeatures=new Set(options.excludedFeatures??[]);
 const candidateFeatures=FEATURES.filter(feature=>!excludedFeatures.has(feature));
 const prepared=prepare(inputRows),matches=prepared.rows,ratings=new Map(),histories=new Map(),trainingHistory=[];
 const overall=comparison(),byYear={},bySurface={};let i=0,evaluatedMatches=0,yearsWithModels=0,currentYear=null,models=null,yearBucket=null;
 while(i<matches.length){
  const date=matches[i].date,year=date.slice(0,4);
  if(year!==currentYear){
   currentYear=year;
   models=year>=start.slice(0,4)&&year<=end.slice(0,4)?(()=>{
    const baseline=fitLogistic(trainingHistory,["eloScaled"],{minMatches:minTrainingMatches,maxRows:maxTrainingRows,seed:tour+year+"gap-base"});
    const candidate=fitLogistic(trainingHistory,["eloScaled",...candidateFeatures],{minMatches:minTrainingMatches,maxRows:maxTrainingRows,seed:tour+year+"gap-candidate"});
    return baseline&&candidate?{baseline,candidate}:null;
   })():null;
   yearBucket=models?comparison():null;byYear[year]=yearBucket?null:{matches:0,reason:"insufficient prior training history"};
   if(models)yearsWithModels++;
  }
  const day=[];while(i<matches.length&&matches[i].date===date)day.push(matches[i++]);
  const observations=day.map(m=>makeObservation(m,ratings,histories));
  if(date>=start&&date<=end){
   evaluatedMatches+=day.length;
   if(models)for(let j=0;j<day.length;j++){
    const o=observations[j],p0=predictLogistic(models.baseline,o),p1=predictLogistic(models.candidate,o);
    add(yearBucket.baseline,p0,o.outcome);add(yearBucket.candidate,p1,o.outcome);
    add(overall.baseline,p0,o.outcome);add(overall.candidate,p1,o.outcome);
    const surface=o.surface||"unknown";if(!bySurface[surface])bySurface[surface]=comparison();
    add(bySurface[surface].baseline,p0,o.outcome);add(bySurface[surface].candidate,p1,o.outcome);
   }
  }
  trainingHistory.push(...observations);
  updateDay(day,ratings,histories,observations,k);
  if(yearBucket)byYear[year]=finishComparison(yearBucket);
 }
 return {schemaVersion:1,researchOnly:true,tour,kFactor:k,evaluationStart:start,evaluationEnd:end,
  sourceRows:prepared.sourceRows,eligibleMatches:matches.length,excludedRows:prepared.excludedRows,
  duplicateRows:prepared.duplicateRows,conflictingDuplicateMatches:prepared.conflictingDuplicateMatches,
  conflictingDuplicateRows:prepared.conflictingDuplicateRows,evaluatedMatches,yearsWithModels,excludedFeatures:[...excludedFeatures],candidateFeatures:["eloScaled",...candidateFeatures],
  featureDefinitions:{
   eloScaled:"pre-date overall Elo difference (player 1 minus player 2), divided by 400",
   gapMean3Diff:"difference between players' mean performance residual over their last 3 matches",
   gapMean5Diff:"difference between players' mean performance residual over their last 5 matches",
   gapMean10Diff:"difference between players' mean performance residual over their last 10 matches",
   lossRate5Diff:"difference in losses over each player's last 5 matches, divided by 5",
   lossRate10Diff:"difference in losses over each player's last 10 matches, divided by 10",
   lossStreakDiff:"difference in current consecutive-loss streaks, capped at 10",
   historyCountDiff:"difference in prior archive-match counts, capped at 20 and scaled by 10",
   residual:"actual player outcome (1 win, 0 loss) minus that player's pre-match Elo win probability"
  },
  summary:finishComparison(overall),byYear,bySurface:Object.fromEntries(Object.entries(bySurface).map(([s,b])=>[s,finishComparison(b)])),
  limitations:[
   "Each evaluation year uses coefficients fitted only on earlier calendar years; the model is frozen during that evaluation year.",
   "All matches on the same calendar date use identical pre-date Elo and player-history states; same-day outcomes update state only after the full date.",
   "Candidate and Elo-only baseline are evaluated on the same matches.",
   "Residuals are based on the archive Elo model, not market odds; they are not direct measures of motivation.",
   "Sackmann archive coverage omits many lower-tier matches, so observed form, workload and inactivity histories are incomplete.",
   "This is research-only and does not establish betting profitability or justify production changes."
  ]};
}

async function main(){
 const args=process.argv.slice(2),opts={},files=[];
 for(let i=0;i<args.length;i++){
  if(["--tour","--from","--to","--k","--min-training","--max-training","--exclude-features","--out"].includes(args[i])){
   if(!args[i+1])throw new Error("Missing value after "+args[i]);opts[args[i].slice(2)]=args[++i];
  }else if(args[i].startsWith("--"))throw new Error("Unknown option "+args[i]);else files.push(args[i]);
 }
 if(!opts.tour||!files.length)throw new Error("Usage: node scripts/sackmann-performance-gap-research.mjs --tour atp|wta [--from YYYYMMDD] [--to YYYYMMDD] [--k 32] [--min-training 1000] [--max-training 50000] [--exclude-features feature1,feature2] [--out report.json] normalized.csv");
 const all=[];for(const file of files){const rows=parseCsv(await readFile(file,"utf8"));all.push(...rows);console.error("Loaded "+rows.length+" normalized rows from "+basename(file));}
 const report=runPerformanceGapWalkForward(all,{tour:opts.tour,evaluationStart:opts.from??"20000101",evaluationEnd:opts.to??"20261231",kFactor:Number(opts.k??32),minTrainingMatches:Number(opts["min-training"]??1000),maxTrainingRows:Number(opts["max-training"]??50000),excludedFeatures:opts["exclude-features"]?opts["exclude-features"].split(",").filter(Boolean):[]});
 const json=JSON.stringify(report,null,2)+"\n";if(opts.out)await writeFile(opts.out,json,"utf8");console.log(json);
 console.error("Research only. Negative Brier/LogLoss delta means improvement; no production model changed.");
}
if(import.meta.url==="file://"+process.argv[1])await main();
