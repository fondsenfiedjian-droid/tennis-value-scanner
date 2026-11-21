#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";
import { fitLogistic, predictLogistic } from "./sackmann-rank-age-research.mjs";

const validId=v=>/^\d+$/.test(String(v??""))&&Number(v)>0;
const validRank=v=>Number.isFinite(Number(v))&&Number(v)>0&&Number(v)<=10000;
const validDate=v=>/^\d{8}$/.test(String(v??""))?String(v):null;
const norm=s=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const clamp=p=>Math.min(1-1e-9,Math.max(1e-9,p));
const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));

function blank(){return {n:0,brier:0,logLoss:0,correct:0};}
function add(m,p,y){p=clamp(p);m.n++;m.brier+=(p-y)**2;m.logLoss-=y*Math.log(p)+(1-y)*Math.log(1-p);m.correct+=p>.5?y:p<.5?1-y:.5;}
function finish(m){return m.n?{matches:m.n,brier:+(m.brier/m.n).toFixed(6),logLoss:+(m.logLoss/m.n).toFixed(6),accuracy:+(100*m.correct/m.n).toFixed(2)}:{matches:0,brier:null,logLoss:null,accuracy:null};}
function comparison(){return {elo:blank(),ordinaryRank:blank(),protectedRank:blank(),probabilityShift:0,shiftN:0};}
function finishComparison(m){
 const elo=finish(m.elo),ordinaryRank=finish(m.ordinaryRank),protectedRank=finish(m.protectedRank);
 const delta=(a,b)=>a==null||b==null?null:+(a-b).toFixed(6);
 return {matches:elo.matches,elo,ordinaryRank,protectedRank,
   ordinaryRankDelta:{brier:delta(ordinaryRank.brier,elo.brier),logLoss:delta(ordinaryRank.logLoss,elo.logLoss),accuracy:ordinaryRank.accuracy==null||elo.accuracy==null?null:+(ordinaryRank.accuracy-elo.accuracy).toFixed(2)},
   protectedVsOrdinary:{brier:delta(protectedRank.brier,ordinaryRank.brier),logLoss:delta(protectedRank.logLoss,ordinaryRank.logLoss),accuracy:protectedRank.accuracy==null||ordinaryRank.accuracy==null?null:+(protectedRank.accuracy-ordinaryRank.accuracy).toFixed(2)},
   meanProbabilityShift: m.shiftN?+(m.probabilityShift/m.shiftN).toFixed(5):null};
}
function symmetric(rows){return rows.flatMap(r=>[r,{...r,eloScaled:-r.eloScaled,rankAdv:-r.rankAdv,outcome:1-r.outcome}]);}

export function buildProtectionIndex(observations,tour){
 const grouped=new Map(),missingIds=[];
 for(const obs of observations){
  if(String(obs.tour??"").trim().toLowerCase()!==tour)continue;
  const id=String(obs.player_id??"").trim(),year=String(obs.tournament_year??"").trim(),event=norm(obs.tournament_name);
  if(!validId(id)){missingIds.push({playerName:String(obs.source_player_name??""),tournament:String(obs.tournament_name??""),year,status:"MISSING_ARCHIVE_PLAYER_ID"});continue;}
  const rank=Number(obs.protected_rank);
  if(!validRank(rank))continue;
  const key=[year,event,id].join("|");
  if(!grouped.has(key))grouped.set(key,{playerId:id,playerName:String(obs.source_player_name??""),protectedRanks:new Set(),sources:[]});
  const item=grouped.get(key);item.protectedRanks.add(rank);
  item.sources.push({url:String(obs.source_url??""),observedDate:String(obs.observed_date??"")});
 }
 const index=new Map(),conflicts=[];
 for(const [key,item] of grouped){
  const ranks=[...item.protectedRanks].sort((a,b)=>a-b);
  if(ranks.length!==1){conflicts.push({key,playerName:item.playerName,protectedRanks:ranks});continue;}
  index.set(key,{playerId:item.playerId,playerName:item.playerName,protectedRank:ranks[0],sources:item.sources});
 }
 return {index,missingIds,conflicts,observationKeys:grouped.size};
}

export function prepareProtectedMatches(rows,protectionIndex){
 const clean=[];
 for(const r of rows){
  const date=validDate(r.tourney_date),winner=String(r.winner_id??""),loser=String(r.loser_id??"");
  if(!date||!validId(winner)||!validId(loser)||winner===loser)continue;
  const winnerIsP1=Number(winner)<Number(loser),p1=winnerIsP1?winner:loser,p2=winnerIsP1?loser:winner;
  const rankW=Number(r.winner_rank),rankL=Number(r.loser_rank);
  const rank1=winnerIsP1?rankW:rankL,rank2=winnerIsP1?rankL:rankW;
  const ranksAvailable=validRank(rank1)&&validRank(rank2);
  const keyBase=[date.slice(0,4),norm(r.tourney_name)];
  const protection1=protectionIndex.get([...keyBase,p1].join("|"))??null;
  const protection2=protectionIndex.get([...keyBase,p2].join("|"))??null;
  const hasProtection=Boolean(protection1||protection2);
  clean.push({date,year:date.slice(0,4),winner,loser,p1,p2,
   outcome:winnerIsP1?1:0,eloScaled:0,rank1:ranksAvailable?rank1:null,rank2:ranksAvailable?rank2:null,
   rankAdv:ranksAvailable?Math.log(rank2)-Math.log(rank1):null,
   protectedRank1:protection1?.protectedRank??null,protectedRank2:protection2?.protectedRank??null,
   hasProtection,tourneyId:String(r.tourney_id??""),matchNum:String(r.match_num??""),
   tournament:String(r.tourney_name??""),round:String(r.round??""),surface:String(r.surface??""),
   protectedPlayers:Number(Boolean(protection1))+Number(Boolean(protection2))});
 }
 clean.sort((a,b)=>a.date.localeCompare(b.date)||a.tourneyId.localeCompare(b.tourneyId)||a.matchNum.localeCompare(b.matchNum)||a.p1.localeCompare(b.p1));
 const unique=[],seen=new Set();
 for(const r of clean){
  const key=[r.date,r.tourneyId,r.matchNum,r.p1,r.p2,r.round].join("|");
  if(seen.has(key))continue;seen.add(key);unique.push(r);
 }
 return unique;
}

export function runProtectedRankingResearch(matchRows,observations,options={}){
 const tour=options.tour??"atp";
 if(!["atp","wta"].includes(tour))throw new RangeError("tour must be atp or wta");
 const start=validDate(options.evaluationStart??"20000101"),end=validDate(options.evaluationEnd??"20261231");
 if(!start||!end||start>end)throw new RangeError("Invalid evaluation date range");
 const k=Number(options.kFactor??32),minTraining=Number(options.minTrainingMatches??1000),maxRows=Number(options.maxTrainingRows??20000);
 const built=buildProtectionIndex(observations,tour);
 const matches=prepareProtectedMatches(matchRows,built.index);
 const elo=new Map(),history=[],overall=comparison(),byYear={};
 let currentYear=null,models=null,index=0,yearsWithModels=0,evaluatedProtectedMatches=0;
 const yearSummaries={};
 while(index<matches.length){
  const date=matches[index].date,year=date.slice(0,4);
  if(year!==currentYear){
   currentYear=year;models=null;
   if(year>=start.slice(0,4)&&year<=end.slice(0,4)){
    const baseTraining=symmetric(history);
    const rankTraining=symmetric(history.filter(r=>r.rankAdv!=null));
    const base=fitLogistic(baseTraining,["eloScaled"],{minMatches:minTraining,maxRows,seed:tour+year+"protected-base"});
    const rank=fitLogistic(rankTraining,["eloScaled","rankAdv"],{minMatches:minTraining,maxRows,seed:tour+year+"protected-rank"});
    if(base&&rank){models={base,rank,trainingMatches:history.length,rankTrainingMatches:rankTraining.length};yearsWithModels++;}
   }
   yearSummaries[year]=comparison();
  }
  const day=[];
  while(index<matches.length&&matches[index].date===date){
   const m=matches[index++],r1=elo.get(m.p1)??1500,r2=elo.get(m.p2)??1500;
   day.push({...m,eloScaled:(r1-r2)/400});
  }
  const deltas=new Map();
  for(const m of day){
   if(date>=start&&date<=end&&models&&m.hasProtection&&m.rankAdv!=null){
    const pElo=predictLogistic(models.base,m);
    const pOrd=predictLogistic(models.rank,m);
    const adjustedRank1=m.protectedRank1??m.rank1,adjustedRank2=m.protectedRank2??m.rank2;
    if(validRank(adjustedRank1)&&validRank(adjustedRank2)){
     const pProtected=predictLogistic(models.rank,{...m,rankAdv:Math.log(adjustedRank2)-Math.log(adjustedRank1)});
     for(const bucket of [overall,yearSummaries[year]]){
      add(bucket.elo,pElo,m.outcome);add(bucket.ordinaryRank,pOrd,m.outcome);add(bucket.protectedRank,pProtected,m.outcome);
      bucket.probabilityShift+=pProtected-pOrd;bucket.shiftN++;
     }
     evaluatedProtectedMatches++;
    }
   }
   const rw=elo.get(m.winner)??1500,rl=elo.get(m.loser)??1500;
   const expected=1/(1+10**((rl-rw)/400)),delta=k*(1-expected);
   deltas.set(m.winner,(deltas.get(m.winner)??0)+delta);
   deltas.set(m.loser,(deltas.get(m.loser)??0)-delta);
  }
  for(const [id,delta] of deltas)elo.set(id,(elo.get(id)??1500)+delta);
  history.push(...day);
 }
 for(const [year,bucket] of Object.entries(yearSummaries))byYear[year]=finishComparison(bucket);
 const matchedObservationKeys=new Set(matches.filter(m=>m.hasProtection).map(m=>[m.year,norm(m.tournament)].join("|")));
 return {
  schemaVersion:1,researchOnly:true,tour,kFactor:k,evaluationStart:start,evaluationEnd:end,
  method:"Yearly walk-forward. Elo-only and Elo+ordinary-rank models are trained on earlier archive matches only. For documented protected-entry matches, the protected rank replaces that player's tournament ordinary rank; no protection window is inferred.",
  sourceMatchRows:matchRows.length,eligibleMatches:matches.length,observationKeys:built.observationKeys,
  matchedEventKeys:matchedObservationKeys.size,missingPlayerIds:built.missingIds.length,conflictingProtectedRankRecords:built.conflicts,
  yearsWithModels,evaluatedProtectedMatches,
  summary:finishComparison(overall),byYear,
  missingPlayerIds:built.missingIds,
  limitations:[
   "This evaluates only documented event-specific protected-ranking uses, not all players who may have received protection.",
   "The protected rank is substituted for ordinary rank only at the explicitly documented event; no active period is backfilled.",
   "The model is trained on ordinary ranking history, so this tests whether the protected rank is a better ranking input for those event matches, not whether protection independently improves the full population model.",
   "Sackmann tournament dates are week-level dates, not exact match start times. Same-date matches share the same pre-date Elo.",
   "The hand-collected protected-entry sample is small and selected; subgroup metrics are exploratory and cannot establish production value."
  ]
 };
}
async function main(){
 const args=process.argv.slice(2),opts={},files=[];
 for(let i=0;i<args.length;i++){
  if(["--tour","--from","--to","--k","--min-training","--max-training","--observations","--out"].includes(args[i])){
   const key=args[i].slice(2),value=args[++i];if(!value)throw new Error("Missing value after "+args[i-1]);opts[key]=value;
  }else if(args[i].startsWith("--"))throw new Error("Unknown option "+args[i]);else files.push(args[i]);
 }
 if(!["atp","wta"].includes(opts.tour)||!opts.observations||!files.length)
  throw new Error("Usage: node scripts/protected-ranking-research.mjs --tour atp|wta --observations protected-ranking-observations.csv [--from YYYYMMDD] [--to YYYYMMDD] normalized.csv");
 const rows=[];for(const file of files){const parsed=parseCsv(await readFile(file,"utf8"));rows.push(...parsed);console.error("Loaded "+parsed.length+" matches from "+file);}
 const observations=parseCsv(await readFile(opts.observations,"utf8"));
 const report=runProtectedRankingResearch(rows,observations,{tour:opts.tour,evaluationStart:opts.from??"20000101",evaluationEnd:opts.to??"20261231",kFactor:Number(opts.k??32),minTrainingMatches:Number(opts["min-training"]??1000),maxTrainingRows:Number(opts["max-training"]??20000)});
 const json=JSON.stringify(report,null,2)+"\n";if(opts.out)await writeFile(opts.out,json,"utf8");console.log(json);
}
if(import.meta.url==="file://"+process.argv[1])await main();
