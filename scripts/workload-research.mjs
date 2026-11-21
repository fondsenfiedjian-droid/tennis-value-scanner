#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseValuebetennisCsv } from "./valuebetennis-backtest.mjs";
import { runBacktest } from "./backtest.mjs";

const CORE_FEATURE_NAMES = ["matches3", "matches7", "playingDays7", "restDays", "restDaysAvailable"];
const FEATURE_NAMES = [...CORE_FEATURE_NAMES, "matches14", "matches28", "playingDays3", "playingDays14", "playingDays28", "matches4to7", "matches8to14", "matches15to28", "playingDays4to7", "playingDays8to14", "playingDays15to28", "minutes7", "durationCoverage7"];
const dayNumber = key => Date.UTC(Number(key.slice(0,4)), Number(key.slice(4,6))-1, Number(key.slice(6,8))) / 86400000;
const pairKey = (date, a, b) => date + ":" + (Number(a) < Number(b) ? a + ":" + b : b + ":" + a);
const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
const clamp = p => Math.min(1 - 1e-9, Math.max(1e-9, p));
const logit = p => Math.log(clamp(p) / (1 - clamp(p)));

export function buildPreMatchWorkload(rows) {
  const clean = rows.filter(row =>
    !/\b(?:W\/O|RET|ABD|DEF|DEFAULT)\b/i.test(String(row.score ?? "")) &&
    /^\d{8}$/.test(String(row.tourney_date ?? "")) &&
    /^\d+$/.test(String(row.winner_id ?? "")) &&
    /^\d+$/.test(String(row.loser_id ?? ""))
  ).slice().sort((a,b) =>
    a.tourney_date.localeCompare(b.tourney_date) ||
    String(a.tourney_id ?? "").localeCompare(String(b.tourney_id ?? "")) ||
    String(a.match_num ?? "").localeCompare(String(b.match_num ?? ""))
  );
  const histories = new Map(), features = new Map();
  let index = 0;
  while (index < clean.length) {
    const date = clean[index].tourney_date, today = dayNumber(date), day = [];
    while (index < clean.length && clean[index].tourney_date === date) day.push(clean[index++]);
    const get = player => {
      const history = histories.get(player) ?? [];
      const prior28 = [];
      for (let i = history.length - 1; i >= 0; i--) {
        const age = today - history[i].day;
        if (age > 28) break;
        if (age >= 1) prior28.push(history[i]);
      }
      const prior3 = prior28.filter(item => today - item.day <= 3);
      const prior7 = prior28.filter(item => today - item.day <= 7);
      const prior14 = prior28.filter(item => today - item.day <= 14);
      const playingDays3 = new Set(prior3.map(item => item.date)).size;
      const playingDays7 = new Set(prior7.map(item => item.date)).size;
      const playingDays14 = new Set(prior14.map(item => item.date)).size;
      const playingDays28 = new Set(prior28.map(item => item.date)).size;
      const knownDurations7 = prior7.filter(item => Number.isFinite(item.durationMinutes));
      const minutes7 = knownDurations7.reduce((sum,item) => sum + item.durationMinutes, 0);
      const latest = history.at(-1);
      return {
        matches3: prior3.length,
        matches7: prior7.length,
        playingDays7,
        matches14: prior14.length,
        matches28: prior28.length,
        playingDays3,
        playingDays14,
        playingDays28,
        matches4to7: prior7.length - prior3.length,
        matches8to14: prior14.length - prior7.length,
        matches15to28: prior28.length - prior14.length,
        playingDays4to7: playingDays7 - playingDays3,
        playingDays8to14: playingDays14 - playingDays7,
        playingDays15to28: playingDays28 - playingDays14,
        restDays: latest ? Math.min(30, today - latest.day) : null,
        minutes7,
        durationCoverage7: prior7.length ? knownDurations7.length / prior7.length : 0,
        knownDurationMatches7: knownDurations7.length
      };
    };
    for (const row of day) {
      const winner = String(row.winner_id), loser = String(row.loser_id);
      const p1 = Number(winner) < Number(loser) ? winner : loser;
      const p2 = p1 === winner ? loser : winner;
      const a = get(p1), b = get(p2);
      features.set(pairKey(date,p1,p2), {
        ...Object.fromEntries(FEATURE_NAMES.map(name => [name, name === "restDaysAvailable" ? (a.restDays !== null && b.restDays !== null ? 1 : 0) : name === "restDays" ? (a.restDays !== null && b.restDays !== null ? a.restDays - b.restDays : 0) : a[name] - b[name]])),
        priorMatchRecords7: a.matches7 + b.matches7,
        priorMatchRecords14: a.matches14 + b.matches14,
        priorMatchRecords28: a.matches28 + b.matches28,
        knownDurationRecords7: a.knownDurationMatches7 + b.knownDurationMatches7
      });
    }
    // Update only after every match on the date has been evaluated. Same-day
    // matches are deliberately excluded because completion order is unknown.
    for (const row of day) {
      const duration = Number(row.durationMinutes);
      const durationMinutes = Number.isFinite(duration) && duration >= 1 && duration <= 600 ? duration : null;
      for (const player of [String(row.winner_id), String(row.loser_id)]) {
        if (!histories.has(player)) histories.set(player, []);
        histories.get(player).push({ date, day: today, durationMinutes });
      }
    }
  }
  return features;
}

function solve(matrix, vector) {
  const n = vector.length, a = matrix.map((row,i) => [...row, vector[i]]);
  for (let col=0; col<n; col++) {
    let pivot=col;
    for(let row=col+1;row<n;row++) if(Math.abs(a[row][col])>Math.abs(a[pivot][col])) pivot=row;
    if(Math.abs(a[pivot][col])<1e-12) return Array(n).fill(0);
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const divisor=a[col][col];
    for(let j=col;j<=n;j++) a[col][j]/=divisor;
    for(let row=0;row<n;row++) if(row!==col){
      const factor=a[row][col];
      for(let j=col;j<=n;j++) a[row][j]-=factor*a[col][j];
    }
  }
  return a.map(row=>row[n]);
}

function fitStandardization(training, featureNames=FEATURE_NAMES) {
  return featureNames.map(name => {
    const values=training.map(row=>row.features[name]);
    const mean=values.reduce((a,b)=>a+b,0)/values.length;
    const variance=values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length;
    return {name,mean,sd:Math.sqrt(variance)||1};
  });
}

function fitCorrection(training, standardization, penalty=0.05) {
  const width=standardization.length;
  let beta=Array(width).fill(0);
  for(let iteration=0;iteration<40;iteration++){
    const gradient=Array(width).fill(0), hessian=Array.from({length:width},()=>Array(width).fill(0));
    for(const row of training){
      const x=standardization.map(item=>(row.features[item.name]-item.mean)/item.sd);
      const p=sigmoid(logit(row.baseProbability)+x.reduce((sum,value,i)=>sum+value*beta[i],0));
      const error=row.outcome-p, weight=p*(1-p);
      for(let i=0;i<width;i++){
        gradient[i]+=error*x[i];
        for(let j=0;j<width;j++) hessian[i][j]+=weight*x[i]*x[j];
      }
    }
    for(let i=0;i<width;i++){
      gradient[i]=gradient[i]/training.length-penalty*beta[i];
      for(let j=0;j<width;j++) hessian[i][j]/=training.length;
      hessian[i][i]+=penalty;
    }
    const step=solve(hessian,gradient);
    const maxStep=Math.max(...step.map(Math.abs));
    beta=beta.map((value,i)=>value+step[i]);
    if(maxStep<1e-7)break;
  }
  return beta;
}

function metrics(rows, beta=null, standardization=null) {
  let brier=0,logLoss=0,baseBrier=0,baseLogLoss=0,dBrier=0,dBrier2=0,dLog=0,dLog2=0;
  for(const row of rows){
    const p0=clamp(row.baseProbability);
    const z=beta&&standardization?standardization.reduce((sum,item,i)=>sum+((row.features[item.name]-item.mean)/item.sd)*beta[i],0):0;
    const p=clamp(sigmoid(logit(p0)+z)),y=row.outcome;
    const b0=(p0-y)**2,b=(p-y)**2;
    const l0=-y*Math.log(p0)-(1-y)*Math.log(1-p0);
    const l=-y*Math.log(p)-(1-y)*Math.log(1-p);
    baseBrier+=b0;baseLogLoss+=l0;brier+=b;logLoss+=l;
    const db=b-b0,dl=l-l0;dBrier+=db;dBrier2+=db*db;dLog+=dl;dLog2+=dl*dl;
  }
  const n=rows.length;
  const ci=(sum,sum2)=>n>1?1.96*Math.sqrt(Math.max(0,(sum2-sum*sum/n)/(n-1))/n):null;
  return {
    matches:n,
    baseline:{brier:n?Number((baseBrier/n).toFixed(6)):null,logLoss:n?Number((baseLogLoss/n).toFixed(6)):null},
    workloadAdjusted:{brier:n?Number((brier/n).toFixed(6)):null,logLoss:n?Number((logLoss/n).toFixed(6)):null},
    pairedDifferenceWorkloadMinusBaseline:{
      brier:n?Number((dBrier/n).toFixed(6)):null,
      brierCI95:n>1?{lower:Number((dBrier/n-ci(dBrier,dBrier2)).toFixed(6)),upper:Number((dBrier/n+ci(dBrier,dBrier2)).toFixed(6))}:null,
      logLoss:n?Number((dLog/n).toFixed(6)):null,
      logLossCI95:n>1?{lower:Number((dLog/n-ci(dLog,dLog2)).toFixed(6)),upper:Number((dLog/n+ci(dLog,dLog2)).toFixed(6))}:null
    }
  };
}

export function runWorkloadResearch(csvTexts) {
  const inputs=Array.isArray(csvTexts)?csvTexts:[csvTexts];
  const parsed=inputs.map(parseValuebetennisCsv);
  const rows=parsed.flatMap(item=>item.rows);
  const tours=[...new Set(rows.map(row=>row.tour).filter(Boolean))].sort();
  const reports={};
  for(const tour of tours){
    const tourRows=rows.filter(row=>row.tour===tour);
    const workload=buildPreMatchWorkload(tourRows);
    const backtest=runBacktest(tourRows,{evaluationStart:"20250101",evaluationEnd:"20261231",includePredictions:true});
    const matched=[];
    let missingFeature=0;
    for(const prediction of backtest.predictions??[]){
      const key=pairKey(prediction.date,prediction.player1Id,prediction.player2Id);
      const features=workload.get(key);
      if(!features){missingFeature++;continue;}
      matched.push({
        year:prediction.date.slice(0,4),
        month:prediction.date.slice(0,6),
        surface:prediction.surface??"Unknown",
        baseProbability:prediction.probabilities.elo,
        outcome:prediction.winnerId===prediction.player1Id?1:0,
        features
      });
    }
    const training=matched.filter(row=>row.year==="2025");
    const evaluation=matched.filter(row=>row.year==="2026");
    const standardization=fitStandardization(training);
    const beta=fitCorrection(training,standardization);
    const coreStandardization=fitStandardization(training,CORE_FEATURE_NAMES);
    const coreBeta=fitCorrection(training,coreStandardization);
    const evaluationByMonth=Object.fromEntries([...new Set(evaluation.map(row=>row.month))].sort().map(month=>[
      month,{
        fullWorkload:metrics(evaluation.filter(row=>row.month===month),beta,standardization),
        coreWorkload:metrics(evaluation.filter(row=>row.month===month),coreBeta,coreStandardization)
      }
    ]));
    const durationAvailability=sample=>({
      priorPlayerMatchRecords7:sample.reduce((sum,row)=>sum+row.features.priorMatchRecords7,0),
      knownDurationRecords7:sample.reduce((sum,row)=>sum+row.features.knownDurationRecords7,0),
      knownDurationCoveragePct:(()=>{const total=sample.reduce((sum,row)=>sum+row.features.priorMatchRecords7,0);const known=sample.reduce((sum,row)=>sum+row.features.knownDurationRecords7,0);return total?Number((100*known/total).toFixed(2)):null;})()
    });
    // Pre-declared ablations test whether the apparent gain depends on one
    // particular workload proxy. Every specification is trained on 2025 and
    // evaluated on the same untouched 2026 matches.
    const featureSpecifications = [
      { name:"matches3_only", features:["matches3"] },
      { name:"matches7_only", features:["matches7"] },
      { name:"playingDays7_and_restDays_with_availability", features:["playingDays7","restDays","restDaysAvailable"] },
      { name:"all_core_features", features:CORE_FEATURE_NAMES }
    ];
    const specificationTests = Object.fromEntries(featureSpecifications.map(spec => {
      const standardization = fitStandardization(training,spec.features);
      const beta = fitCorrection(training,standardization);
      return [spec.name,{
        features:spec.features,
        trainingMatches:training.length,
        evaluation:metrics(evaluation,beta,standardization),
        standardizedCoefficients:Object.fromEntries(spec.features.map((name,i)=>[name,Number(beta[i].toFixed(5))]))
      }];
    }));
    // A second chronological holdout within 2026: fit only on Jan-Jun and
    // score Jul-Nov. Elo probabilities are still generated chronologically
    // from prior results; no same-day workload records enter the features.
    const firstHalf2026=evaluation.filter(row=>row.month<="202606");
    const secondHalf2026=evaluation.filter(row=>row.month>"202606");
    const halfYearStandardization=fitStandardization(firstHalf2026,CORE_FEATURE_NAMES);
    const halfYearBeta=fitCorrection(firstHalf2026,halfYearStandardization);
    const within2026TemporalSplit={
      trainingPeriod:"2026-01 through 2026-06",
      evaluationPeriod:"2026-07 through 2026-11",
      trainingMatches:firstHalf2026.length,
      evaluation:metrics(secondHalf2026,halfYearBeta,halfYearStandardization),
      standardizedCoefficients:Object.fromEntries(CORE_FEATURE_NAMES.map((name,i)=>[name,Number(halfYearBeta[i].toFixed(5))]))
    };
    const evaluationBySurface=Object.fromEntries([...new Set(evaluation.map(row=>row.surface))].sort().map(surface=>{
      const sample=evaluation.filter(row=>row.surface===surface);
      return [surface,{
        matches:sample.length,
        fullYear:metrics(sample,coreBeta,coreStandardization),
        secondHalf:metrics(sample.filter(row=>row.month>"202606"),halfYearBeta,halfYearStandardization)
      }];
    }));
    reports[tour]={
      trainingYear:"2025",
      evaluationYear:"2026",
      training:metrics(training,beta,standardization),
      evaluation:metrics(evaluation,beta,standardization),
      evaluationCoreWorkload:metrics(evaluation,coreBeta,coreStandardization),
      specificationTests,
      within2026TemporalSplit,
      evaluationBySurface,
      durationAvailability:{training:durationAvailability(training),evaluation:durationAvailability(evaluation)},
      evaluationByMonth,
      trainingFeatureCoverage:training.length,
      evaluationFeatureCoverage:evaluation.length,
      predictionsWithoutWorkloadFeatures:missingFeature,
      standardizedFeatureCoefficients:Object.fromEntries(FEATURE_NAMES.map((name,i)=>[name,Number(beta[i].toFixed(5))])),
      standardizedCoreFeatureCoefficients:Object.fromEntries(CORE_FEATURE_NAMES.map((name,i)=>[name,Number(coreBeta[i].toFixed(5))])),
      standardization:Object.fromEntries(standardization.map(item=>[item.name,{mean:Number(item.mean.toFixed(4)),sd:Number(item.sd.toFixed(4))}])),
      durationCoverageNote:"minutes7 sums only observed durations; durationCoverage7 records the share of prior-week matches with known duration. Unknown durations are not fabricated.",
      sameDayLeakageProtection:"All matches on a UTC calendar date are scored from the history available before that date; same-day matches are added only after every prediction for that date is prepared.",
      limitation:"This is a research-only logistic correction to Elo, trained only on 2025 and evaluated only on 2026. It is not production model integration and does not estimate betting ROI."
    };
  }
  return {
    source:"Valuebetennis open data (CC BY 4.0)",
    inputRows:parsed.reduce((sum,item)=>sum+item.inputRows,0),
    normalizedRows:rows.length,
    years:[...new Set(rows.map(row=>row.tourney_date.slice(0,4)))].sort(),
    tours,
    reports,
    citation:"Valuebetennis, Tennis results and odds since 2021, https://www.valuebetennis.com/en/donnees.htm",
    method:"Pre-match workload differences: previous 3/7 calendar days, distinct playing days in 7 days, rest days capped at 30 when both players have prior history; otherwise restDays is neutral and restDaysAvailable=0. Same-day matches excluded."
  };
}

async function main(){
  const args=process.argv.slice(2),files=[];
  let output="workload-research-report.json";
  for(let i=0;i<args.length;i++){
    if(args[i]==="--out"){if(!args[i+1])throw new Error("Missing output path");output=args[++i];}
    else if(args[i].startsWith("--"))throw new Error("Unknown option: "+args[i]);
    else files.push(args[i]);
  }
  if(!files.length)throw new Error("Usage: node scripts/workload-research.mjs [--out report.json] file-2025.csv file-2026.csv");
  const texts=[];
  for(const file of files){texts.push(await readFile(file,"utf8"));console.error("Loaded "+file);}
  const report=runWorkloadResearch(texts);
  await writeFile(output,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  console.error("Research only: lower Brier/log-loss is better; this is not betting ROI.");
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1]))await main();
