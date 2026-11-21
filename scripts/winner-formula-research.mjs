#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseValuebetennisCsv } from "./valuebetennis-backtest.mjs";
import { runBacktest } from "./backtest.mjs";
import { buildPreMatchWorkload } from "./workload-research.mjs";
import { fitLogistic, predictLogistic } from "./sackmann-rank-age-research.mjs";

const FEATURES = ["baseLogit","matches3","matches7","playingDays7","restDays","restDaysAvailable","minutes7","durationCoverage7","workloadAvailable"];
const clamp = p => Math.min(1 - 1e-9, Math.max(1e-9, p));
const logit = p => Math.log(clamp(p) / (1 - clamp(p)));
const pairKey = (date,a,b) => date + ":" + (Number(a) < Number(b) ? a + ":" + b : b + ":" + a);

function metrics(rows, model = null) {
  if (!rows.length) return { matches:0,brier:null,logLoss:null,accuracy:null,calibration:null,pairedDifferenceVsBase:null };
  let brier=0,logLoss=0,correct=0,baseBrier=0,baseLogLoss=0;
  let deltaBrier=0,deltaBrier2=0,deltaLogLoss=0,deltaLogLoss2=0;
  const bins=Array.from({length:10},()=>({matches:0,predicted:0,wins:0}));
  for (const row of rows) {
    const base=clamp(row.baseProbability);
    const p=clamp(model ? predictLogistic(model,row.features) : row.baseProbability);
    const y=row.outcome;
    const bs=(p-y)**2,baseBs=(base-y)**2;
    const ll=-y*Math.log(p)-(1-y)*Math.log(1-p);
    const baseLl=-y*Math.log(base)-(1-y)*Math.log(1-base);
    brier+=bs;logLoss+=ll;baseBrier+=baseBs;baseLogLoss+=baseLl;
    const db=bs-baseBs,dl=ll-baseLl;
    deltaBrier+=db;deltaBrier2+=db*db;deltaLogLoss+=dl;deltaLogLoss2+=dl*dl;
    correct+=p>0.5?y:p<0.5?1-y:0.5;
    const index=Math.min(9,Math.floor(p*10));
    bins[index].matches++;bins[index].predicted+=p;bins[index].wins+=y;
  }
  const n=rows.length;
  const ci=(sum,sum2)=>1.96*Math.sqrt(Math.max(0,(sum2-sum*sum/n)/(n-1))/n);
  const meanBrier=deltaBrier/n,meanLogLoss=deltaLogLoss/n;
  const calibrationBins=bins.map((bin,i)=>({
    lower:i/10,upper:(i+1)/10,matches:bin.matches,
    meanPredicted:bin.matches?+(bin.predicted/bin.matches).toFixed(5):null,
    observedWinRate:bin.matches?+(bin.wins/bin.matches).toFixed(5):null
  }));
  const ece=bins.reduce((sum,bin)=>sum+(bin.matches/n)*Math.abs(bin.predicted/Math.max(1,bin.matches)-bin.wins/Math.max(1,bin.matches)),0);
  return {
    matches:n,brier:+(brier/n).toFixed(6),logLoss:+(logLoss/n).toFixed(6),
    accuracy:+(100*correct/n).toFixed(2),
    calibration:{expectedCalibrationError:+ece.toFixed(6),bins:calibrationBins},
    pairedDifferenceVsBase:model?{
      brier:+meanBrier.toFixed(6),
      brierCI95:{lower:+(meanBrier-ci(deltaBrier,deltaBrier2)).toFixed(6),upper:+(meanBrier+ci(deltaBrier,deltaBrier2)).toFixed(6)},
      logLoss:+meanLogLoss.toFixed(6),
      logLossCI95:{lower:+(meanLogLoss-ci(deltaLogLoss,deltaLogLoss2)).toFixed(6),upper:+(meanLogLoss+ci(deltaLogLoss,deltaLogLoss2)).toFixed(6)}
    }:null
  };
}

function pairedModelDifference(rows, referenceModel, candidateModel) {
  if(rows.length<2)return {matches:rows.length,brier:null,brierCI95:null,logLoss:null,logLossCI95:null};
  let brier=0,brier2=0,logLoss=0,logLoss2=0;
  for(const row of rows){
    const y=row.outcome;
    const a=clamp(predictLogistic(referenceModel,row.features));
    const b=clamp(predictLogistic(candidateModel,row.features));
    const db=(b-y)**2-(a-y)**2;
    const dl=(-y*Math.log(b)-(1-y)*Math.log(1-b))-(-y*Math.log(a)-(1-y)*Math.log(1-a));
    brier+=db;brier2+=db*db;logLoss+=dl;logLoss2+=dl*dl;
  }
  const n=rows.length;
  const ci=(sum,sum2)=>1.96*Math.sqrt(Math.max(0,(sum2-sum*sum/n)/(n-1))/n);
  const meanBrier=brier/n,meanLogLoss=logLoss/n;
  return {
    matches:n,
    brier:+meanBrier.toFixed(6),
    brierCI95:{lower:+(meanBrier-ci(brier,brier2)).toFixed(6),upper:+(meanBrier+ci(brier,brier2)).toFixed(6)},
    logLoss:+meanLogLoss.toFixed(6),
    logLossCI95:{lower:+(meanLogLoss-ci(logLoss,logLoss2)).toFixed(6),upper:+(meanLogLoss+ci(logLoss,logLoss2)).toFixed(6)}
  };
}

function featureRow(prediction, workload) {
  const key=pairKey(prediction.date,prediction.player1Id,prediction.player2Id);
  const w=workload.get(key);
  const recentWorkloadAvailable=Boolean(w && (w.priorMatchRecords7??0)>0);
  const restDaysAvailable=Boolean(w && w.restDaysAvailable===1);
  return {
    date:prediction.date,
    features:{
      baseLogit:logit(prediction.probabilities.combined),
      matches3:recentWorkloadAvailable?w.matches3:0,
      matches7:recentWorkloadAvailable?w.matches7:0,
      playingDays7:recentWorkloadAvailable?w.playingDays7:0,
      restDays:restDaysAvailable?w.restDays:0,
      restDaysAvailable:restDaysAvailable?1:0,
      minutes7:recentWorkloadAvailable?w.minutes7:0,
      durationCoverage7:recentWorkloadAvailable?w.durationCoverage7:0,
      workloadAvailable:recentWorkloadAvailable?1:0
    },
    workloadDiagnostics:{
      priorMatchRecords7:w?.priorMatchRecords7??0,
      knownDurationRecords7:w?.knownDurationRecords7??0,
      bothPlayersHavePriorHistory:restDaysAvailable
    },
    baseProbability:prediction.probabilities.combined,
    outcome:prediction.winnerId===prediction.player1Id?1:0,
    surface:prediction.surface??"Unknown"
  };
}

function workloadAvailability(rows) {
  const total=rows.length;
  const anyHistory=rows.filter(row=>row.features.workloadAvailable===1).length;
  const bothHistory=rows.filter(row=>row.workloadDiagnostics.bothPlayersHavePriorHistory).length;
  const priorRecords=rows.reduce((sum,row)=>sum+row.workloadDiagnostics.priorMatchRecords7,0);
  const knownDurations=rows.reduce((sum,row)=>sum+row.workloadDiagnostics.knownDurationRecords7,0);
  return {
    matches:total,
    anyRecentWorkloadMatches:anyHistory,
    anyRecentWorkloadPct:total?+(100*anyHistory/total).toFixed(2):null,
    bothPlayersRestDaysAvailableMatches:bothHistory,
    bothPlayersRestDaysAvailablePct:total?+(100*bothHistory/total).toFixed(2):null,
    priorPlayerMatchRecords7:priorRecords,
    knownDurationPlayerMatchRecords7:knownDurations,
    knownDurationCoveragePct:priorRecords?+(100*knownDurations/priorRecords).toFixed(2):null
  };
}

export function runWinnerFormulaResearch(csvTexts, options={}) {
  const inputs=Array.isArray(csvTexts)?csvTexts:[csvTexts];
  const parsed=inputs.map(parseValuebetennisCsv);
  const rows=parsed.flatMap(x=>x.rows);
  const trainEnd=String(options.trainingEnd??"20251231");
  const evalStart=String(options.evaluationStart??"20260101");
  const evalEnd=String(options.evaluationEnd??"20261231");
  if(!/^\d{8}$/.test(trainEnd)||!/^\d{8}$/.test(evalStart)||!/^\d{8}$/.test(evalEnd)||trainEnd>=evalStart||evalStart>evalEnd) {
    throw new RangeError("Use ordered YYYYMMDD dates: trainingEnd < evaluationStart <= evaluationEnd");
  }
  const minTrainingMatches=Number.isInteger(options.minTrainingMatches)?options.minTrainingMatches:1000;
  const reports={};
  for(const tour of ["atp","wta"]) {
    const tourRows=rows.filter(row=>row.tour===tour);
    if(!tourRows.length) continue;
    const workload=buildPreMatchWorkload(tourRows);
    const backtest=runBacktest(tourRows,{includePredictions:true});
    const observations=backtest.predictions.map(p=>featureRow(p,workload));
    const training=observations.filter(row=>row.date<=trainEnd);
    const evaluation=observations.filter(row=>row.date>=evalStart&&row.date<=evalEnd);
    const trainingRows=training.map(row=>({...row.features,outcome:row.outcome}));
    const fitOptions={minMatches:minTrainingMatches,maxRows:50000,seed:"winner-formula-"+tour+"-"+trainEnd,penalty:1};
    const model=fitLogistic(trainingRows,FEATURES,fitOptions);
    const calibrationFeatures=["baseLogit"];
    const coreAceFeatures=["baseLogit","matches3","matches7","playingDays7","restDays","restDaysAvailable","workloadAvailable"];
    const calibrationModel=fitLogistic(trainingRows,calibrationFeatures,fitOptions);
    const coreAceModel=fitLogistic(trainingRows,coreAceFeatures,fitOptions);
    const specificationTests={
      calibrationOnly:calibrationModel?{features:calibrationFeatures,metrics:metrics(evaluation,calibrationModel),coefficients:calibrationModel.coefficients}:null,
      coreAce:coreAceModel?{features:coreAceFeatures,metrics:metrics(evaluation,coreAceModel),coefficients:coreAceModel.coefficients}:null,
      fullAce:model?{features:FEATURES,metrics:metrics(evaluation,model),coefficients:model.coefficients}:null
    };
    const incrementalComparisons=calibrationModel&&coreAceModel?{
      coreAceVsCalibrationOnly:pairedModelDifference(evaluation,calibrationModel,coreAceModel),
      fullAceVsCoreAce:model?pairedModelDifference(evaluation,coreAceModel,model):null
    }:null;
    reports[tour]={
      inputMatches:tourRows.length,
      trainingPeriod:"through "+trainEnd,
      evaluationPeriod:evalStart+" through "+evalEnd,
      trainingMatches:training.length,
      evaluationMatches:evaluation.length,
      workloadCoveragePct:evaluation.length?+(100*evaluation.filter(x=>x.features.workloadAvailable===1).length/evaluation.length).toFixed(2):null,
      featureAvailability:{
        training:workloadAvailability(training),
        evaluation:workloadAvailability(evaluation)
      },
      baselineCombined:metrics(evaluation),
      winnerFormula:model?metrics(evaluation,model):null,
      specificationTests,
      incrementalComparisons,
      delta:model?{
        brier:+(metrics(evaluation,model).brier-metrics(evaluation).brier).toFixed(6),
        logLoss:+(metrics(evaluation,model).logLoss-metrics(evaluation).logLoss).toFixed(6),
        accuracy:+(metrics(evaluation,model).accuracy-metrics(evaluation).accuracy).toFixed(2)
      }:null,
      trainedModel:model?{...model,featureNames:FEATURES}:null,
      modelStatus:model?"trained_research_only":"insufficient_training_sample",
      featureDefinitions:{
        baseLogit:"logit of existing combined Elo/surface/form/H2H probability",
        matches3:"A-minus-B prior matches in previous 3 calendar days",
        matches7:"A-minus-B prior matches in previous 7 calendar days",
        playingDays7:"A-minus-B playing days in previous 7 calendar days",
        minutes7:"A-minus-B known match minutes in previous 7 calendar days",
        durationCoverage7:"A-minus-B share of prior matches with known duration",
        workloadAvailable:"1 when at least one player's prior 7-day match record exists"
      }
    };
  }
  return {
    source:"Valuebetennis open match data (CC BY 4.0)",
    method:"Chronological Elo baseline plus regularized logistic workload correction; train strictly before evaluation window.",
    trainingEnd:trainEnd,evaluationStart:evalStart,evaluationEnd:evalEnd,
    reportsByTour:reports,
    importantLimit:"Research only. This first formula tests measurable workload/recovery inputs on top of the existing combined model. It does not yet include verified injuries, weather, serve/return point stats, style matchups, psychological or motivation claims, protected ranking, or complete tour-wide workload. Missing workload is flagged, not invented. No production model is changed and this is not betting ROI."
  };
}

async function main(){
  const args=process.argv.slice(2),files=[],options={};
  for(let i=0;i<args.length;i++){
    if(args[i]==="--out"){if(!args[i+1])throw new Error("Missing path after --out");options.out=args[++i];}
    else if(["--train-through","--from","--to"].includes(args[i])){
      const key=args[i]==="--train-through"?"trainingEnd":args[i]==="--from"?"evaluationStart":"evaluationEnd";
      if(!args[i+1])throw new Error("Missing date after "+args[i]);
      options[key]=args[++i];
    }else if(args[i].startsWith("--"))throw new Error("Unknown option: "+args[i]);
    else files.push(args[i]);
  }
  if(!files.length)throw new Error("Usage: node scripts/winner-formula-research.mjs [--train-through YYYYMMDD] [--from YYYYMMDD] [--to YYYYMMDD] valuebetennis.csv [...]");
  const texts=[];
  for(const file of files){texts.push(await readFile(file,"utf8"));console.error("Loaded "+basename(file));}
  const report=runWinnerFormulaResearch(texts,options);
  const output=options.out??null;
  if(output)await writeFile(output,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  console.error("Lower Brier/log-loss is better. Research only; no production change.");
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1]))await main();
