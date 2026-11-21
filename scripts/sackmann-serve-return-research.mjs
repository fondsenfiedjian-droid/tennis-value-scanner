#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv, runBacktest } from "./backtest.mjs";

const OVERALL=["serveDiff","returnDiff"], SURFACE=["surfaceServeDiff","surfaceReturnDiff"];
const SURFACE_RESIDUAL=["surfaceServeResidualDiff","surfaceReturnResidualDiff"];
const SURFACE_SHRUNK=["shrunkSurfaceServeDiff","shrunkSurfaceReturnDiff"];
const PROFILE=[
 "firstServeInDiff","firstServeWonDiff","secondServeWonDiff","aceRateDiff",
 "doubleFaultRateDiff","breakPointSaveDiff","firstServeReturnDiff",
 "secondServeReturnDiff","breakPointConvertDiff"
];
const SURFACE_PROFILE=PROFILE.map(name=>"surface"+name[0].toUpperCase()+name.slice(1));
const SHRUNK_SURFACE_PROFILE=PROFILE.map(name=>"shrunkSurface"+name[0].toUpperCase()+name.slice(1));
const SPECS=[
 {name:"overall_serve_only",features:["serveDiff"]},
 {name:"overall_return_only",features:["returnDiff"]},
 {name:"overall_serve_return",features:OVERALL},
 {name:"surface_serve_only",features:["surfaceServeDiff"]},
 {name:"surface_return_only",features:["surfaceReturnDiff"]},
 {name:"surface_serve_return",features:SURFACE},
 {name:"overall_plus_surface",features:[...OVERALL,...SURFACE]},
 {name:"surface_residual_only",features:SURFACE_RESIDUAL},
 {name:"overall_plus_surface_residual",features:[...OVERALL,...SURFACE_RESIDUAL]},
 {name:"surface_shrunk_only",features:SURFACE_SHRUNK},
 {name:"overall_plus_surface_shrunk",features:[...OVERALL,...SURFACE_SHRUNK]},
 {name:"serve_profile_only",features:PROFILE.slice(0,6)},
 {name:"return_profile_only",features:PROFILE.slice(6)},
 {name:"extended_serve_return_profile",features:PROFILE},
 {name:"core_plus_extended_profile",features:[...OVERALL,...PROFILE]},
 {name:"surface_profile_only",features:SURFACE_PROFILE},
 {name:"shrunk_surface_profile_only",features:SHRUNK_SURFACE_PROFILE},
 {name:"overall_plus_shrunk_surface_profile",features:[...PROFILE,...SHRUNK_SURFACE_PROFILE]}
];
const SURFACES=new Set(["Hard","Clay","Grass","Carpet"]);
const dayNumber=date=>Date.UTC(+date.slice(0,4),+date.slice(4,6)-1,+date.slice(6,8))/86400000;
const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
const clamp=p=>Math.min(1-1e-9,Math.max(1e-9,p));
const logit=p=>Math.log(clamp(p)/(1-clamp(p)));
const pairKey=(date,a,b,surface)=>date+":"+(Number(a)<Number(b)?a+":"+b:b+":"+a)+":"+(SURFACES.has(surface)?surface:"Unknown");
const num=v=>v===""||v==null?null:Number(v);

function serveSideInvalidReason(prefix,row){
 const svpt=num(row[prefix+"_svpt"]),firstIn=num(row[prefix+"_1stIn"]);
 const firstWon=num(row[prefix+"_1stWon"]),secondWon=num(row[prefix+"_2ndWon"]);
 if (![svpt,firstIn,firstWon,secondWon].every(Number.isInteger)) return "missing_or_non_integer";
 if (svpt<=0) return "non_positive_service_points";
 if (firstIn<0||firstIn>svpt) return "first_in_out_of_range";
 if (firstWon<0||firstWon>firstIn) return "first_won_out_of_range";
 if (secondWon<0||secondWon>svpt-firstIn) return "second_won_exceeds_opportunities";
 if (firstWon+secondWon>svpt) return "total_won_exceeds_service_points";
 return null;
}
function validServeSide(prefix,row){return serveSideInvalidReason(prefix,row)===null;}

export function auditServeReturnStats(rows){
 const report={matches:rows.length,winner:{valid:0,invalid:0,reasons:{}},loser:{valid:0,invalid:0,reasons:{}}};
 for(const row of rows){
  for(const [prefix,side] of [["w","winner"],["l","loser"]]){
   const reason=serveSideInvalidReason(prefix,row);
   if(reason===null)report[side].valid++;
   else{
    report[side].invalid++;
    report[side].reasons[reason]=(report[side].reasons[reason]||0)+1;
   }
  }
 }
 return report;
}
const PROFILE_KEYS=[
 "firstServeIn","firstServeWon","secondServeWon","aceRate","doubleFaultRate",
 "breakPointSave","firstServeReturn","secondServeReturn","breakPointConvert"
];
function profileMetric(numerator,denominator){
 return Number.isInteger(numerator)&&Number.isInteger(denominator)&&denominator>0&&
  numerator>=0&&numerator<=denominator?[numerator,denominator]:null;
}
function extendedSideProfile(prefix,row,opponentPrefix){
 const svpt=num(row[prefix+"_svpt"]),firstIn=num(row[prefix+"_1stIn"]);
 const firstWon=num(row[prefix+"_1stWon"]),secondWon=num(row[prefix+"_2ndWon"]);
 const oppSvpt=num(row[opponentPrefix+"_svpt"]),oppFirstIn=num(row[opponentPrefix+"_1stIn"]);
 const oppFirstWon=num(row[opponentPrefix+"_1stWon"]),oppSecondWon=num(row[opponentPrefix+"_2ndWon"]);
 const p={};
 p.firstServeIn=profileMetric(firstIn,svpt);
 p.firstServeWon=profileMetric(firstWon,firstIn);
 p.secondServeWon=profileMetric(secondWon,svpt-firstIn);
 const ace=num(row[prefix+"_ace"]),df=num(row[prefix+"_df"]);
 if(Number.isInteger(ace)&&Number.isInteger(df)&&ace>=0&&df>=0&&ace+df<=svpt){
  p.aceRate=profileMetric(ace,svpt);p.doubleFaultRate=profileMetric(df,svpt);
 }
 const saved=num(row[prefix+"_bpSaved"]),faced=num(row[prefix+"_bpFaced"]);
 if(Number.isInteger(saved)&&Number.isInteger(faced)&&saved>=0&&saved<=faced&&faced<=svpt){
  p.breakPointSave=profileMetric(saved,faced);
 }
 // Return metrics are derived from the opponent's service opportunities.
 if(Number.isInteger(oppSvpt)&&Number.isInteger(oppFirstIn)&&Number.isInteger(oppFirstWon)&&Number.isInteger(oppSecondWon)){
  const secondOpp=oppSvpt-oppFirstIn;
  p.firstServeReturn=profileMetric(oppFirstIn-oppFirstWon,oppFirstIn);
  p.secondServeReturn=profileMetric(secondOpp-oppSecondWon,secondOpp);
 }
 const oppSaved=num(row[opponentPrefix+"_bpSaved"]),oppFaced=num(row[opponentPrefix+"_bpFaced"]);
 if(Number.isInteger(oppSaved)&&Number.isInteger(oppFaced)&&oppSaved>=0&&oppSaved<=oppFaced&&oppFaced<=oppSvpt){
  p.breakPointConvert=profileMetric(oppFaced-oppSaved,oppFaced);
 }
 return p;
}
function statsForPlayers(row){
 if(!validServeSide("w",row)||!validServeSide("l",row))return null;
 const wTotal=num(row.w_svpt),lTotal=num(row.l_svpt);
 const wWon=num(row.w_1stWon)+num(row.w_2ndWon),lWon=num(row.l_1stWon)+num(row.l_2ndWon);
 return {
  winner:{serveTotal:wTotal,serveWon:wWon,returnTotal:lTotal,returnWon:lTotal-lWon,
   profile:extendedSideProfile("w",row,"l")},
  loser:{serveTotal:lTotal,serveWon:lWon,returnTotal:wTotal,returnWon:wTotal-wWon,
   profile:extendedSideProfile("l",row,"w")}
 };
}
function aggregate(history,today,surface=null,windowDays=365){
 let serveTotal=0,serveWon=0,returnTotal=0,returnWon=0,matches=0;
 const profileSums=Object.fromEntries(PROFILE_KEYS.map(key=>[key,{numerator:0,denominator:0,matches:0}]));
 for(let i=history.length-1;i>=0;i--){
  const item=history[i],age=today-item.day;
  if(age>windowDays)break;
  if(age<1||(surface&&item.surface!==surface))continue;
  serveTotal+=item.serveTotal;serveWon+=item.serveWon;
  returnTotal+=item.returnTotal;returnWon+=item.returnWon;matches++;
  for(const key of PROFILE_KEYS){
   const pair=item.profile?.[key];if(!pair)continue;
   profileSums[key].numerator+=pair[0];profileSums[key].denominator+=pair[1];profileSums[key].matches++;
  }
 }
 const profile=Object.fromEntries(PROFILE_KEYS.map(key=>{
  const x=profileSums[key];return [key,{rate:x.denominator?x.numerator/x.denominator:null,matches:x.matches}];
 }));
 return {matches,serveRate:matches&&serveTotal?serveWon/serveTotal:null,
  returnRate:matches&&returnTotal?returnWon/returnTotal:null,profile};
}
export function buildPreMatchServeReturn(rows,{minOverallMatches=5,minSurfaceMatches=5,windowDays=365,surfaceShrinkageMatches=5}={}){
 if(!Number.isInteger(minOverallMatches)||minOverallMatches<1)throw new Error("minOverallMatches must be a positive integer");
 if(!Number.isInteger(minSurfaceMatches)||minSurfaceMatches<1)throw new Error("minSurfaceMatches must be a positive integer");
 if(!Number.isInteger(windowDays)||windowDays<1)throw new Error("windowDays must be a positive integer");
 if(!Number.isInteger(surfaceShrinkageMatches)||surfaceShrinkageMatches<1)throw new Error("surfaceShrinkageMatches must be a positive integer");
 const clean=rows.filter(row=>
  /^\d{8}$/.test(String(row.tourney_date??""))&&/^\d+$/.test(String(row.winner_id??""))&&
  /^\d+$/.test(String(row.loser_id??""))&&String(row.winner_id)!==String(row.loser_id)&&
  !/\b(?:W\/O|RET|ABD|DEF|DEFAULT)\b/i.test(String(row.score??""))
 ).slice().sort((a,b)=>
  String(a.tourney_date).localeCompare(String(b.tourney_date))||
  String(a.tourney_id??"").localeCompare(String(b.tourney_id??""))||
  String(a.match_num??"").localeCompare(String(b.match_num??""))
 );
 const histories=new Map(),features=new Map();let index=0;
 while(index<clean.length){
  const date=String(clean[index].tourney_date),today=dayNumber(date),day=[];
  while(index<clean.length&&String(clean[index].tourney_date)===date)day.push(clean[index++]);
  const get=(id,surface)=>{
   const history=histories.get(id)??[],overall=aggregate(history,today,null,windowDays);
   const surfaceStats=SURFACES.has(surface)?aggregate(history,today,surface,windowDays):aggregate([],today,null,windowDays);
   return {overall,surface:surfaceStats};
  };
  for(const row of day){
   const winner=String(row.winner_id),loser=String(row.loser_id);
   const p1=Number(winner)<Number(loser)?winner:loser,p2=p1===winner?loser:winner;
   const a=get(p1,row.surface),b=get(p2,row.surface);
   const overallReady=a.overall.matches>=minOverallMatches&&b.overall.matches>=minOverallMatches;
   const surfaceReady=a.surface.matches>=minSurfaceMatches&&b.surface.matches>=minSurfaceMatches;
   const surfaceKnown=SURFACES.has(row.surface);
   const surfaceReadyWithOverall=surfaceKnown&&surfaceReady&&overallReady;
   const shrinkA=a.surface.matches/(a.surface.matches+surfaceShrinkageMatches);
   const shrinkB=b.surface.matches/(b.surface.matches+surfaceShrinkageMatches);
   const shrunkServeA=surfaceReadyWithOverall?a.overall.serveRate+shrinkA*(a.surface.serveRate-a.overall.serveRate):null;
   const shrunkServeB=surfaceReadyWithOverall?b.overall.serveRate+shrinkB*(b.surface.serveRate-b.overall.serveRate):null;
   const shrunkReturnA=surfaceReadyWithOverall?a.overall.returnRate+shrinkA*(a.surface.returnRate-a.overall.returnRate):null;
   const shrunkReturnB=surfaceReadyWithOverall?b.overall.returnRate+shrinkB*(b.surface.returnRate-b.overall.returnRate):null;
   const profileNames={
    firstServeIn:"firstServeInDiff",firstServeWon:"firstServeWonDiff",
    secondServeWon:"secondServeWonDiff",aceRate:"aceRateDiff",
    doubleFaultRate:"doubleFaultRateDiff",breakPointSave:"breakPointSaveDiff",
    firstServeReturn:"firstServeReturnDiff",secondServeReturn:"secondServeReturnDiff",
    breakPointConvert:"breakPointConvertDiff"
   };
   const profileFeatures={};
   for(const [key,featureName] of Object.entries(profileNames)){
    const av=a.overall.profile[key],bv=b.overall.profile[key];
    const as=a.surface.profile[key],bs=b.surface.profile[key];
    const overallReadyForMetric=av.matches>=minOverallMatches&&bv.matches>=minOverallMatches&&
     av.rate!==null&&bv.rate!==null;
    const surfaceReadyForMetric=surfaceReadyWithOverall&&
     as.matches>=minSurfaceMatches&&bs.matches>=minSurfaceMatches&&as.rate!==null&&bs.rate!==null;
    profileFeatures[featureName]=overallReadyForMetric?av.rate-bv.rate:null;
    const surfaceName="surface"+featureName[0].toUpperCase()+featureName.slice(1);
    const shrunkName="shrunkSurface"+featureName[0].toUpperCase()+featureName.slice(1);
    profileFeatures[surfaceName]=surfaceReadyForMetric?as.rate-bs.rate:null;
    if(overallReadyForMetric&&surfaceReadyForMetric){
     const shrinkA=as.matches/(as.matches+surfaceShrinkageMatches);
     const shrinkB=bs.matches/(bs.matches+surfaceShrinkageMatches);
     const shrunkA=av.rate+shrinkA*(as.rate-av.rate);
     const shrunkB=bv.rate+shrinkB*(bs.rate-bv.rate);
     profileFeatures[shrunkName]=shrunkA-shrunkB;
    }else profileFeatures[shrunkName]=null;
   }
   features.set(pairKey(date,p1,p2,row.surface),{
    serveDiff:overallReady?a.overall.serveRate-b.overall.serveRate:null,
    returnDiff:overallReady?a.overall.returnRate-b.overall.returnRate:null,
    surfaceServeDiff:surfaceReadyWithOverall?a.surface.serveRate-b.surface.serveRate:null,
    surfaceReturnDiff:surfaceReadyWithOverall?a.surface.returnRate-b.surface.returnRate:null,
    surfaceServeResidualDiff:surfaceReadyWithOverall?(a.surface.serveRate-a.overall.serveRate)-(b.surface.serveRate-b.overall.serveRate):null,
    surfaceReturnResidualDiff:surfaceReadyWithOverall?(a.surface.returnRate-a.overall.returnRate)-(b.surface.returnRate-b.overall.returnRate):null,
    shrunkSurfaceServeDiff:surfaceReadyWithOverall?shrunkServeA-shrunkServeB:null,
    shrunkSurfaceReturnDiff:surfaceReadyWithOverall?shrunkReturnA-shrunkReturnB:null,
    ...profileFeatures,
    minOverallPriorMatches:Math.min(a.overall.matches,b.overall.matches),
    minSurfacePriorMatches:surfaceKnown?Math.min(a.surface.matches,b.surface.matches):0,
    profilePriorMatches:Object.fromEntries(Object.keys(profileNames).map(key=>[key,
     Math.min(a.overall.profile[key].matches,b.overall.profile[key].matches)])),
    surfaceProfilePriorMatches:Object.fromEntries(Object.keys(profileNames).map(key=>[key,
     Math.min(a.surface.profile[key].matches,b.surface.profile[key].matches)]))
   });
  }
  // Same-date matches are all scored before any same-date stats enter player histories.
  for(const row of day){
   const stats=statsForPlayers(row);if(!stats)continue;
   const surface=SURFACES.has(row.surface)?row.surface:null;
   for(const [id,side] of [[String(row.winner_id),stats.winner],[String(row.loser_id),stats.loser]]){
    if(!histories.has(id))histories.set(id,[]);
    histories.get(id).push({day:today,surface,...side});
   }
  }
 }
 return features;
}
function solve(matrix,vector){
 const n=vector.length,a=matrix.map((row,i)=>[...row,vector[i]]);
 for(let col=0;col<n;col++){
  let pivot=col;for(let row=col+1;row<n;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
  if(Math.abs(a[pivot][col])<1e-12)return Array(n).fill(0);
  [a[col],a[pivot]]=[a[pivot],a[col]];
  const divisor=a[col][col];for(let j=col;j<=n;j++)a[col][j]/=divisor;
  for(let row=0;row<n;row++)if(row!==col){const factor=a[row][col];for(let j=0;j<=n;j++)a[row][j]-=factor*a[col][j];}
 }
 return a.map(row=>row[n]);
}
function fitModel(rows,names,penalty=0.05){
 if(rows.length<500)return null;
 const standardization=names.map(name=>{
  const values=rows.map(row=>row.features[name]),mean=values.reduce((a,b)=>a+b,0)/values.length;
  const variance=values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length;
  return {name,mean,sd:Math.sqrt(variance)||1};
 });
 let beta=Array(names.length).fill(0);
 for(let iteration=0;iteration<50;iteration++){
  const gradient=Array(names.length).fill(0),hessian=Array.from({length:names.length},()=>Array(names.length).fill(0));
  for(const row of rows){
   const x=standardization.map(item=>(row.features[item.name]-item.mean)/item.sd);
   const p=sigmoid(logit(row.baseProbability)+x.reduce((sum,value,i)=>sum+value*beta[i],0));
   const error=row.outcome-p,weight=p*(1-p);
   for(let i=0;i<names.length;i++){gradient[i]+=error*x[i];for(let j=0;j<names.length;j++)hessian[i][j]+=weight*x[i]*x[j];}
  }
  for(let i=0;i<names.length;i++){
   gradient[i]=gradient[i]/rows.length-penalty*beta[i];
   for(let j=0;j<names.length;j++)hessian[i][j]/=rows.length;
   hessian[i][i]+=penalty;
  }
  const step=solve(hessian,gradient),maxStep=Math.max(...step.map(Math.abs));
  beta=beta.map((value,i)=>value+step[i]);if(maxStep<1e-7)break;
 }
 return {standardization,beta};
}
function aggregatePredictions(rows){
 const n=rows.length;if(!n)return {matches:0,baseline:null,adjusted:null,pairedDifference:null};
 let b0=0,l0=0,b=0,l=0,db=0,db2=0,dl=0,dl2=0,correct0=0,correct=0;
 const bins0=Array.from({length:10},()=>({count:0,predicted:0,observed:0}));
 const bins=Array.from({length:10},()=>({count:0,predicted:0,observed:0}));
 for(const row of rows){
  const p0=clamp(row.baseProbability),p=clamp(row.adjustedProbability),y=row.outcome;
  const b0i=(p0-y)**2,bi=(p-y)**2,l0i=-y*Math.log(p0)-(1-y)*Math.log(1-p0),li=-y*Math.log(p)-(1-y)*Math.log(1-p);
  b0+=b0i;l0+=l0i;b+=bi;l+=li;db+=bi-b0i;db2+=(bi-b0i)**2;dl+=li-l0i;dl2+=(li-l0i)**2;
  if((p0>=0.5?1:0)===y)correct0++;
  if((p>=0.5?1:0)===y)correct++;
  for(const [probability,target] of [[p0,bins0],[p,bins]]){
   const bin=target[Math.min(9,Math.floor(probability*10))];
   bin.count++;bin.predicted+=probability;bin.observed+=y;
  }
 }
 const ci=(sum,sum2)=>n>1?1.96*Math.sqrt(Math.max(0,(sum2-sum*sum/n)/(n-1))/n):null;
 const calibration=source=>{
  const populated=source.filter(bin=>bin.count>0);
  return {
   expectedCalibrationError:Number(populated.reduce((sum,bin)=>sum+bin.count/n*Math.abs(bin.predicted/bin.count-bin.observed/bin.count),0).toFixed(6)),
   bins:source.map((bin,index)=>({lower:index/10,upper:(index+1)/10,matches:bin.count,
    meanPredicted:bin.count?Number((bin.predicted/bin.count).toFixed(5)):null,
    observedWinRate:bin.count?Number((bin.observed/bin.count).toFixed(5)):null}))
  };
 };
 return {
  matches:n,
  baseline:{brier:Number((b0/n).toFixed(6)),logLoss:Number((l0/n).toFixed(6)),accuracy:Number((100*correct0/n).toFixed(2)),calibration:calibration(bins0)},
  adjusted:{brier:Number((b/n).toFixed(6)),logLoss:Number((l/n).toFixed(6)),accuracy:Number((100*correct/n).toFixed(2)),calibration:calibration(bins)},
  pairedDifference:{
   brier:Number((db/n).toFixed(6)),brierCI95:n>1?{lower:Number((db/n-ci(db,db2)).toFixed(6)),upper:Number((db/n+ci(db,db2)).toFixed(6))}:null,
   logLoss:Number((dl/n).toFixed(6)),logLossCI95:n>1?{lower:Number((dl/n-ci(dl,dl2)).toFixed(6)),upper:Number((dl/n+ci(dl,dl2)).toFixed(6))}:null
  }
 };
}
function scoreWithModel(row,model){
 const z=model.standardization.reduce((sum,item,i)=>sum+((row.features[item.name]-item.mean)/item.sd)*model.beta[i],0);
 return {...row,adjustedProbability:clamp(sigmoid(logit(row.baseProbability)+z))};
}

export function evaluateFixedHoldout(rows,names,{holdoutStartYear=2025,featureStartYear=2016,lastEvaluationYear=2026}={}){
 const training=rows.filter(row=>row.year>=featureStartYear&&row.year<holdoutStartYear);
 const evaluation=rows.filter(row=>row.year>=holdoutStartYear&&row.year<=lastEvaluationYear);
 const model=fitModel(training,names);
 if(!model)return {status:"insufficient_training",trainingMatches:training.length,evaluationMatches:evaluation.length,holdoutStartYear};
 if(!evaluation.length)return {status:"no_holdout_matches",trainingMatches:training.length,evaluationMatches:0,holdoutStartYear};
 const scored=evaluation.map(row=>scoreWithModel(row,model));
 return {
  status:"ok",trainingStartYear:featureStartYear,trainingEndYear:holdoutStartYear-1,
  holdoutStartYear,holdoutEndYear:lastEvaluationYear,
  trainingMatches:training.length,evaluationMatches:scored.length,
  metrics:aggregatePredictions(scored),
  standardizedCoefficients:Object.fromEntries(names.map((name,i)=>[name,Number(model.beta[i].toFixed(5))]))
 };
}
export function runServeReturnResearch(fileInputs,{firstEvaluationYear=2020,lastEvaluationYear=2026,featureStartYear=2016,windowDays=365,minOverallMatches=5,minSurfaceMatches=5,surfaceShrinkageMatches=5,holdoutStartYear=2025}={}){
 if(!Number.isInteger(windowDays)||windowDays<1)throw new Error("windowDays must be a positive integer");
 if(!Number.isInteger(minOverallMatches)||minOverallMatches<1)throw new Error("minOverallMatches must be a positive integer");
 if(!Number.isInteger(minSurfaceMatches)||minSurfaceMatches<1)throw new Error("minSurfaceMatches must be a positive integer");
 if(!Number.isInteger(surfaceShrinkageMatches)||surfaceShrinkageMatches<1)throw new Error("surfaceShrinkageMatches must be a positive integer");
 const allRows={ATP:[],WTA:[]};
 for(const input of fileInputs){
  const match=String(input.filename).match(/(?:^|\/)(atp|wta)_matches_(\d{4})\.csv$/i);
  if(!match)throw new Error("Unrecognized Sackmann match filename: "+input.filename);
  allRows[match[1].toUpperCase()].push(...parseCsv(input.content));
 }
 const reports={};
 for(const tour of ["ATP","WTA"]){
  const rows=allRows[tour];if(!rows.length)continue;
  const featureMap=buildPreMatchServeReturn(rows,{windowDays,minOverallMatches,minSurfaceMatches,surfaceShrinkageMatches});
  const backtest=runBacktest(rows,{evaluationStart:featureStartYear+"0101",evaluationEnd:lastEvaluationYear+"1231",includePredictions:true});
  const matched=[];let missingFeatures=0;
  for(const prediction of backtest.predictions??[]){
   const features=featureMap.get(pairKey(prediction.date,prediction.player1Id,prediction.player2Id,prediction.surface));
   if(!features){missingFeatures++;continue;}
   matched.push({year:Number(prediction.date.slice(0,4)),baseProbability:prediction.probabilities.elo,
    outcome:prediction.winnerId===prediction.player1Id?1:0,features});
  }
  const bySpec={};
  for(const spec of SPECS){
   const eligible=matched.filter(row=>spec.features.every(name=>Number.isFinite(row.features[name])));
   const outOfSample=[],annual=[];
   for(let year=firstEvaluationYear;year<=lastEvaluationYear;year++){
    const training=eligible.filter(row=>row.year>=featureStartYear&&row.year<year);
    const evaluation=eligible.filter(row=>row.year===year),model=fitModel(training,spec.features);
    if(!model||!evaluation.length){annual.push({year,trainingMatches:training.length,evaluationMatches:evaluation.length,status:!model?"insufficient_training":"no_evaluation_matches"});continue;}
    const yearRows=[];
    for(const row of evaluation){
     const z=model.standardization.reduce((sum,item,i)=>sum+((row.features[item.name]-item.mean)/item.sd)*model.beta[i],0);
     const scored={...row,adjustedProbability:clamp(sigmoid(logit(row.baseProbability)+z))};
     outOfSample.push(scored);yearRows.push(scored);
    }
    annual.push({year,trainingMatches:training.length,evaluation:aggregatePredictions(yearRows),
     standardizedCoefficients:Object.fromEntries(spec.features.map((name,i)=>[name,Number(model.beta[i].toFixed(5))]))});
   }
   const fixedHoldout=evaluateFixedHoldout(eligible,spec.features,{holdoutStartYear,featureStartYear,lastEvaluationYear});
   bySpec[spec.name]={features:spec.features,eligibleMatches:eligible.length,annual,outOfSample:aggregatePredictions(outOfSample),fixedHoldout};
  }
  reports[tour]={sourceRows:rows.length,serveStatsQuality:auditServeReturnStats(rows),featureMatches:matched.length,predictionsWithoutFeatureRecord:missingFeatures,
   featureWindowDays:windowDays,minimumPriorMatches:{overall:minOverallMatches,surface:minSurfaceMatches},surfaceShrinkageMatches,
   trainingProtocol:"Expanding walk-forward: each evaluation year is fitted only on eligible earlier years from 2016 onward; same-day results are excluded from all pre-match rolling features.",
   baseline:"Chronological K=32 Elo from the existing backtest engine; earlier match results are warm-up only.",
   specifications:bySpec};
 }
 return {
  schemaVersion:1,source:"Jeff Sackmann / Tennis Abstract ATP and WTA match datasets",
  sourceRepositories:["https://github.com/JeffSackmann/tennis_atp","https://github.com/JeffSackmann/tennis_wta"],
  archiveMirror:"https://github.com/Aneeshers/tennis-sackmann-archive",
  dataLicense:"CC BY-NC-SA 4.0",reportLicense:"CC BY-NC-SA 4.0",
  attribution:"Match data compiled by Jeff Sackmann / Tennis Abstract. Aggregate research only; no raw rows or player-level records are included.",
  evaluationPeriod:firstEvaluationYear+"–"+lastEvaluationYear,featureStartYear,fixedHoldoutStartYear:holdoutStartYear,fixedHoldoutProtocol:"Fit each feature specification once using eligible rows from featureStartYear through the year before holdoutStartYear; freeze coefficients and evaluate holdoutStartYear through lastEvaluationYear without refitting.",reports,
  method:`For each player, aggregate serve points won / serve points played and return points won / return points faced over the previous ${windowDays} days. Build overall and same-surface rates; require at least ${minOverallMatches} prior statistics-complete matches overall and ${minSurfaceMatches} same-surface matches for each player. Surface rates are shrunk toward overall rates with a prior strength of ${surfaceShrinkageMatches} matches. Compare each player1-minus-player2 feature set as a regularized logistic correction to Elo. Lower Brier and LogLoss are better.`,
  limitations:[
   "The source is non-commercial CC BY-NC-SA 4.0; do not use it commercially without separate permission.",
   "Match statistics are observed after each match and are used only in future-date histories. All same-day matches are scored before that date's statistics are added.",
   "The evaluation is research-only and measures probability quality, not betting ROI, CLV or profitability.",
   "The 2026 archive is partial through 2026-05-25."
  ]
 };
}
async function main(){
 const args=process.argv.slice(2),files=[];let output="sackmann-serve-return-report.json";
 const options={};
 for(let i=0;i<args.length;i++){
  if(args[i]==="--out"){if(!args[i+1])throw new Error("Missing output path");output=args[++i];}
  else if(["--window-days","--min-overall-matches","--min-surface-matches","--surface-shrinkage-matches","--holdout-start-year"].includes(args[i])){
   if(!args[i+1])throw new Error("Missing value for "+args[i]);
   const key={"--window-days":"windowDays","--min-overall-matches":"minOverallMatches","--min-surface-matches":"minSurfaceMatches","--surface-shrinkage-matches":"surfaceShrinkageMatches","--holdout-start-year":"holdoutStartYear"}[args[i]];
   options[key]=Number(args[++i]);
   if(!Number.isInteger(options[key])||options[key]<1)throw new Error(args[i-1]+" must be a positive integer");
  }else if(args[i].startsWith("--"))throw new Error("Unknown option: "+args[i]);
  else files.push(args[i]);
 }
 if(!files.length)throw new Error("Usage: node scripts/sackmann-serve-return-research.mjs [--window-days 365] [--min-overall-matches 5] [--min-surface-matches 5] [--surface-shrinkage-matches 5] [--holdout-start-year 2025] [--out report.json] atp_matches_YYYY.csv wta_matches_YYYY.csv ...");
 const inputs=[];for(const filename of files){inputs.push({filename,content:await readFile(filename,"utf8")});console.error("Loaded "+filename);}
 const report=runServeReturnResearch(inputs,options);await writeFile(output,JSON.stringify(report,null,2)+"\n");
 console.log("Wrote aggregate research report: "+output);console.error("Research only: no live probabilities, EV or recommendations are changed.");
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1]))await main();
