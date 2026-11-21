#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";
import { fitLogistic, predictLogistic } from "./sackmann-rank-age-research.mjs";

const FEATURES = [
  "layoffDiffLog", "layoffMaxLog",
  "player1Over90", "player2Over90",
  "player1Over180", "player2Over180",
  "player1ReturnEpisode", "player2ReturnEpisode",
  "player1ReturnMatchesLog", "player2ReturnMatchesLog",
  "returnMatchesDiffLog", "unknownPriorCount"
];
const clamp = p => Math.min(1 - 1e-9, Math.max(1e-9, p));
const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
const validId = v => /^\d+$/.test(String(v ?? "")) && Number(v) > 0;
function validDate(value) {
  const s=String(value??"");
  if(!/^\d{8}$/.test(s)) return null;
  const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6,8);
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d ? s : null;
}
const dayNumber = date => Date.UTC(+date.slice(0,4),+date.slice(4,6)-1,+date.slice(6,8))/86400000;

export function calculateLayoffFeatures(player1LastDate, player2LastDate, matchDate, options={}) {
  const date=validDate(matchDate);
  if(!date) throw new RangeError("matchDate must be a real YYYYMMDD date");
  const current=dayNumber(date);
  const days1=validDate(player1LastDate)==null ? null : current-dayNumber(player1LastDate);
  const days2=validDate(player2LastDate)==null ? null : current-dayNumber(player2LastDate);
  if((days1!=null && days1<0)||(days2!=null && days2<0)) throw new RangeError("last match date cannot be after matchDate");
  const log1=days1==null?0:Math.log1p(days1);
  const log2=days2==null?0:Math.log1p(days2);
  const episode1=days1!=null&&days1>=90 ? true : Boolean(options.player1ReturnEpisode);
  const episode2=days2!=null&&days2>=90 ? true : Boolean(options.player2ReturnEpisode);
  const count1=days1!=null&&days1>=90 ? 0 : Math.max(0,Number(options.player1ReturnMatches)||0);
  const count2=days2!=null&&days2>=90 ? 0 : Math.max(0,Number(options.player2ReturnMatches)||0);
  const returnLog1=episode1?Math.log1p(count1):0;
  const returnLog2=episode2?Math.log1p(count2):0;
  return {
    player1LayoffDays:days1,
    player2LayoffDays:days2,
    layoffDiffLog:Number((log1-log2).toFixed(8)),
    layoffMaxLog:Number(Math.max(log1,log2).toFixed(8)),
    player1Over90:days1!=null && days1>=90?1:0,
    player2Over90:days2!=null && days2>=90?1:0,
    player1Over180:days1!=null && days1>=180?1:0,
    player2Over180:days2!=null && days2>=180?1:0,
    player1ReturnEpisode:episode1?1:0,
    player2ReturnEpisode:episode2?1:0,
    player1ReturnMatchesLog:Number(returnLog1.toFixed(8)),
    player2ReturnMatchesLog:Number(returnLog2.toFixed(8)),
    returnMatchesDiffLog:Number((returnLog1-returnLog2).toFixed(8)),
    unknownPriorCount:Number(days1==null)+Number(days2==null)
  };
}

function prepare(rows) {
  const clean=[];
  for(const row of rows) {
    const date=validDate(row.tourney_date);
    const winner=String(row.winner_id??"").trim(), loser=String(row.loser_id??"").trim();
    if(!date||!validId(winner)||!validId(loser)||winner===loser) continue;
    const p1=Number(winner)<Number(loser)?winner:loser;
    const p2=p1===winner?loser:winner;
    clean.push({
      date,year:date.slice(0,4),winner,loser,player1:p1,player2:p2,
      outcome:winner===p1?1:0,
      tourneyId:String(row.tourney_id??""),matchNum:String(row.match_num??""),
      round:String(row.round??""),surface:String(row.surface??"")
    });
  }
  clean.sort((a,b)=>a.date.localeCompare(b.date)||a.tourneyId.localeCompare(b.tourneyId)||
    a.matchNum.localeCompare(b.matchNum)||a.player1.localeCompare(b.player1)||a.player2.localeCompare(b.player2));
  const unique=[],seen=new Map();
  let duplicateRows=0,conflictingDuplicateRows=0,conflictingDuplicateMatches=0;
  for(const row of clean) {
    const key=row.tourneyId&&row.matchNum
      ? [row.date,row.tourneyId,row.matchNum,row.round,[row.player1,row.player2].join(":")].join("|")
      : [row.date,row.surface,[row.player1,row.player2].join(":")].join("|");
    const signature=JSON.stringify([row.winner,row.loser,row.surface]);
    if(!seen.has(key)){seen.set(key,{signature,row});unique.push(row);}
    else if(seen.get(key).signature===signature) duplicateRows++;
    else {conflictingDuplicateRows++;conflictingDuplicateMatches++;}
  }
  return {rows:unique,sourceRows:rows.length,invalidRows:rows.length-clean.length,
    duplicateRows,conflictingDuplicateRows,conflictingDuplicateMatches};
}
function metric(){return {n:0,brier:0,logLoss:0,correct:0,extreme5:0,extreme5Wrong:0,extreme1:0,extreme1Wrong:0,lossOver2:0,lossOver46:0,maxLoss:0,bins:Array.from({length:10},()=>({n:0,p:0,y:0}))};}
const LAYOFF_BANDS=[
  {key:"30_59",min:30,max:59},
  {key:"60_89",min:60,max:89},
  {key:"90_179",min:90,max:179},
  {key:"180_364",min:180,max:364},
  {key:"365_plus",min:365,max:Infinity}
];
function cohortBucket(map,key){
  if(!map.has(key))map.set(key,{baseline:metric(),candidate:metric()});
  return map.get(key);
}
function finishCohorts(map){
  return Object.fromEntries([...map.entries()].map(([key,value])=>[key,{
    playerMatchObservations:value.baseline.n,
    baseline:finish(value.baseline),
    candidate:finish(value.candidate),
    delta:{
      brier:value.baseline.n?+(finish(value.candidate).brier-finish(value.baseline).brier).toFixed(6):null,
      logLoss:value.baseline.n?+(finish(value.candidate).logLoss-finish(value.baseline).logLoss).toFixed(6):null,
      accuracy:value.baseline.n?+(finish(value.candidate).accuracy-finish(value.baseline).accuracy).toFixed(2):null
    }
  }]));
}
function add(bucket,p,y){
  p=clamp(p);bucket.n++;bucket.brier+=(p-y)**2;
  const loss=-(y*Math.log(p)+(1-y)*Math.log(1-p));
  bucket.logLoss+=loss;bucket.maxLoss=Math.max(bucket.maxLoss,loss);
  bucket.correct+=p>.5?y:p<.5?1-y:.5;
  const extreme5=p<.05||p>.95,extreme1=p<.01||p>.99;
  if(extreme5){bucket.extreme5++;if((p>.5?1:0)!==y)bucket.extreme5Wrong++;}
  if(extreme1){bucket.extreme1++;if((p>.5?1:0)!==y)bucket.extreme1Wrong++;}
  if(loss>2)bucket.lossOver2++;
  if(loss>4.605170186)bucket.lossOver46++;
  const bin=Math.min(9,Math.floor(p*10)),cell=bucket.bins[bin];
  cell.n++;cell.p+=p;cell.y+=y;
}
function finish(bucket){
  if(!bucket.n)return {matches:0,brier:null,logLoss:null,accuracy:null,diagnostics:null};
  return {matches:bucket.n,brier:+(bucket.brier/bucket.n).toFixed(6),
    logLoss:+(bucket.logLoss/bucket.n).toFixed(6),accuracy:+(100*bucket.correct/bucket.n).toFixed(2),
    diagnostics:{
      extreme5:{count:bucket.extreme5,wrong:bucket.extreme5Wrong},
      extreme1:{count:bucket.extreme1,wrong:bucket.extreme1Wrong},
      logLossOver2:bucket.lossOver2,logLossOver4_6:bucket.lossOver46,
      maxIndividualLogLoss:+bucket.maxLoss.toFixed(6),
      calibrationBins:bucket.bins.map((cell,index)=>({range:(index/10).toFixed(1)+"-"+((index+1)/10).toFixed(1),
        count:cell.n,meanPredicted:cell.n?+(cell.p/cell.n).toFixed(4):null,
        observedWinRate:cell.n?+(cell.y/cell.n).toFixed(4):null,
        calibrationGap:cell.n?+((cell.p-cell.y)/cell.n).toFixed(4):null}))
    }};
}
function compare(base,candidate,trainingMatches,trainingSample){
  const b=finish(base),c=finish(candidate);
  return {trainingMatches,trainingSample,matches:c.matches,baseline:b,candidate:c,
    delta:{brier:b.brier==null||c.brier==null?null:+(c.brier-b.brier).toFixed(6),
      logLoss:b.logLoss==null||c.logLoss==null?null:+(c.logLoss-b.logLoss).toFixed(6),
      accuracy:b.accuracy==null||c.accuracy==null?null:+(c.accuracy-b.accuracy).toFixed(2)}};
}

export function runLayoffWalkForward(inputRows, options={}) {
  const tour=options.tour??"atp";
  if(!["atp","wta"].includes(tour)) throw new RangeError("tour must be atp or wta");
  const k=Number.isFinite(options.kFactor)?options.kFactor:32;
  if(k<=0||k>200) throw new RangeError("kFactor must be between 0 and 200");
  const start=validDate(options.evaluationStart??"20000101");
  const end=validDate(options.evaluationEnd??"20261231");
  if(!start||!end||start>end) throw new RangeError("evaluationStart/evaluationEnd must be valid ordered YYYYMMDD dates");
  const minTrainingMatches=Number.isInteger(options.minTrainingMatches)?options.minTrainingMatches:1000;
  const maxTrainingRows=Number.isInteger(options.maxTrainingRows)?options.maxTrainingRows:20000;
  const prepared=prepare(inputRows), matches=prepared.rows;
  const elo=new Map(),lastPlayed=new Map(),returnEpisode=new Map(),returnMatches=new Map(),history=[];
  const baseTotal=metric(),candidateTotal=metric(),byYear={},layoffCohorts=new Map(),returnCohorts=new Map();
  let index=0,evaluatedMatches=0,yearsWithModels=0,currentYear=null,models=null,yearBase=null,yearCandidate=null;
  while(index<matches.length) {
    const date=matches[index].date,year=date.slice(0,4);
    if(year!==currentYear) {
      currentYear=year;
      models=null;yearBase=metric();yearCandidate=metric();
      if(year>=start.slice(0,4)&&year<=end.slice(0,4)) {
        const baseline=fitLogistic(history,["eloScaled"],{minMatches:minTrainingMatches,maxRows:maxTrainingRows,seed:tour+year+"layoff-base"});
        const candidate=fitLogistic(history,["eloScaled",...FEATURES],{minMatches:minTrainingMatches,maxRows:maxTrainingRows,seed:tour+year+"layoff-candidate"});
        if(baseline&&candidate) {
          models={baseline,candidate,trainingMatches:history.length};
          yearsWithModels++;
        }
      }
      byYear[year]={trainingMatches:models?.trainingMatches??0,baseline:null,candidate:null,delta:null};
    }
    const day=[];
    while(index<matches.length&&matches[index].date===date) day.push(matches[index++]);
    const dayRows=[];
    for(const match of day) {
      const r1=elo.get(match.player1)??1500,r2=elo.get(match.player2)??1500;
      const last1=lastPlayed.get(match.player1)??null,last2=lastPlayed.get(match.player2)??null;
      const gap=calculateLayoffFeatures(last1,last2,date,{
        player1ReturnEpisode:returnEpisode.get(match.player1),
        player2ReturnEpisode:returnEpisode.get(match.player2),
        player1ReturnMatches:returnMatches.get(match.player1),
        player2ReturnMatches:returnMatches.get(match.player2)
      });
      const observation={...match,eloScaled:(r1-r2)/400,...gap};
      dayRows.push(observation);
      if(date>=start&&date<=end) {
        evaluatedMatches++;
        if(models) {
          const p0=predictLogistic(models.baseline,observation);
          const p1=predictLogistic(models.candidate,observation);
          add(yearBase,p0,match.outcome);add(yearCandidate,p1,match.outcome);
          add(baseTotal,p0,match.outcome);add(candidateTotal,p1,match.outcome);
          const playerViews=[
            {id:match.player1,gap:gap.player1LayoffDays,episode:Boolean(returnEpisode.get(match.player1)),played:returnMatches.get(match.player1)??0,pBase:p0,pCandidate:p1,outcome:match.outcome},
            {id:match.player2,gap:gap.player2LayoffDays,episode:Boolean(returnEpisode.get(match.player2)),played:returnMatches.get(match.player2)??0,pBase:1-p0,pCandidate:1-p1,outcome:1-match.outcome}
          ];
          for(const view of playerViews){
            if(view.gap!=null){
              const band=LAYOFF_BANDS.find(item=>view.gap>=item.min&&view.gap<=item.max);
              if(band){
                const bucket=cohortBucket(layoffCohorts,band.key);
                add(bucket.baseline,view.pBase,view.outcome);
                add(bucket.candidate,view.pCandidate,view.outcome);
              }
            }
            const returnIndex=view.gap!=null&&view.gap>=90?1:(view.episode?view.played+1:0);
            if(returnIndex>=1&&returnIndex<=3){
              const bucket=cohortBucket(returnCohorts,String(returnIndex));
              add(bucket.baseline,view.pBase,view.outcome);
              add(bucket.candidate,view.pCandidate,view.outcome);
            }
          }
        }
      }
    }
    // Predict every match on a date from identical pre-date Elo and inactivity state.
    const deltas=new Map();
    for(const match of dayRows) {
      const rw=elo.get(match.winner)??1500,rl=elo.get(match.loser)??1500;
      const expected=1/(1+10**((rl-rw)/400)),delta=k*(1-expected);
      deltas.set(match.winner,(deltas.get(match.winner)??0)+delta);
      deltas.set(match.loser,(deltas.get(match.loser)??0)-delta);
    }
    for(const [id,delta] of deltas) elo.set(id,(elo.get(id)??1500)+delta);
    const appearances=new Map();
    for(const match of dayRows) {
      appearances.set(match.player1,(appearances.get(match.player1)??0)+1);
      appearances.set(match.player2,(appearances.get(match.player2)??0)+1);
    }
    for(const [id,count] of appearances) {
      const previous=lastPlayed.get(id)??null;
      const gapDays=previous==null?null:dayNumber(date)-dayNumber(previous);
      let episode=Boolean(returnEpisode.get(id));
      let returnCount=returnMatches.get(id)??0;
      if(gapDays!=null&&gapDays>=90){episode=true;returnCount=0;}
      if(episode)returnMatches.set(id,returnCount+count);
      returnEpisode.set(id,episode);
      lastPlayed.set(id,date);
    }
    history.push(...dayRows);
    if(date>=start&&date<=end&&models) {
      const result=compare(yearBase,yearCandidate,models.trainingMatches,
        Math.min(models.baseline.trainingSample,models.candidate.trainingSample));
      byYear[year]={...result};
    }
  }
  const baseline=finish(baseTotal),candidate=finish(candidateTotal);
  return {
    schemaVersion:1,researchOnly:true,tour,kFactor:k,evaluationStart:start,evaluationEnd:end,
    sourceRows:prepared.sourceRows,eligibleMatches:matches.length,invalidRows:prepared.invalidRows,
    duplicateRows:prepared.duplicateRows,conflictingDuplicateMatches:prepared.conflictingDuplicateMatches,
    conflictingDuplicateRows:prepared.conflictingDuplicateRows,evaluatedMatches,yearsWithModels,
    featureDefinitions:{
      baseline:"pre-date overall Elo only",
      candidate:"pre-date overall Elo plus relative log inactivity, maximum inactivity, 90/180-day indicators and unknown-history count",
      inactivity:"calendar days since each player's previous completed match in the archive; not a diagnosis and not proof of injury",
      thresholds:"90 and 180 days are research thresholds, not medical classifications"
    },
    timingRules:[
      "Only completed matches strictly earlier than the prediction date establish prior activity.",
      "All matches on the same calendar date use identical pre-date Elo and last-played states.",
      "Elo and last-played dates are updated only after every match on that date has been evaluated.",
      "Annual models are fitted only on earlier calendar years and frozen throughout the evaluation year."
    ],
    summary:{baseline,candidate,delta:{
      brier:baseline.brier==null||candidate.brier==null?null:+(candidate.brier-baseline.brier).toFixed(6),
      logLoss:baseline.logLoss==null||candidate.logLoss==null?null:+(candidate.logLoss-baseline.logLoss).toFixed(6),
      accuracy:baseline.accuracy==null||candidate.accuracy==null?null:+(candidate.accuracy-baseline.accuracy).toFixed(2)
    }},
    cohortDefinitions:{
      layoffBands:"Player-match observations grouped by days since the player's previous archived completed match; these are not injury labels.",
      returnMatches:"Player-match observations for the first, second and third match after a gap of at least 90 calendar days.",
      unit:"Each cohort observation is one player in one match; a match can contribute two observations if both players qualify."
    },
    cohorts:{layoffDays:finishCohorts(layoffCohorts),firstMatchesAfterReturn:finishCohorts(returnCohorts)},
    byYear
  };
}

async function main(){
  const args=process.argv.slice(2),opts={},files=[];
  for(let i=0;i<args.length;i++){
    if(["--tour","--from","--to","--k","--min-training","--max-training","--out"].includes(args[i])){
      const key=args[i].slice(2),value=args[++i];if(!value)throw new Error("Missing value for --"+key);opts[key]=value;
    } else if(args[i].startsWith("--")) throw new Error("Unknown option "+args[i]);
    else files.push(args[i]);
  }
  if(!["atp","wta"].includes(opts.tour)||!files.length)
    throw new Error("Usage: node scripts/sackmann-layoff-research.mjs --tour atp|wta [--from YYYYMMDD] [--to YYYYMMDD] [--k 32] [--min-training 1000] normalized.csv");
  const rows=[];
  for(const file of files){const parsed=parseCsv(await readFile(file,"utf8"));rows.push(...parsed);console.error("Loaded "+parsed.length+" rows from "+file);}
  const report=runLayoffWalkForward(rows,{tour:opts.tour,evaluationStart:opts.from??"20000101",
    evaluationEnd:opts.to??"20261231",kFactor:Number(opts.k??32),
    minTrainingMatches:Number(opts["min-training"]??1000),maxTrainingRows:Number(opts["max-training"]??20000)});
  const json=JSON.stringify(report,null,2)+"\n";
  if(opts.out)await writeFile(opts.out,json,"utf8");
  console.log(json);
}
if(import.meta.url==="file://"+process.argv[1])await main();
