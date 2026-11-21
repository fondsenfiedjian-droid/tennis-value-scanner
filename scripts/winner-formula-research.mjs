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
  if (!rows.length) return { matches:0,brier:null,logLoss:null,accuracy:null };
  let brier=0,logLoss=0,correct=0;
  for (const row of rows) {
    const p=clamp(model ? predictLogistic(model,row.features) : row.baseProbability);
    brier+=(p-row.outcome)**2;
    logLoss-=row.outcome*Math.log(p)+(1-row.outcome)*Math.log(1-p);
    correct+=p>0.5?row.outcome:p<0.5?1-row.outcome:0.5;
  }
  return {matches:rows.length,brier:+(brier/rows.length).toFixed(6),logLoss:+(logLoss/rows.length).toFixed(6),accuracy:+(100*correct/rows.length).toFixed(2)};
}

function featureRow(prediction, workload) {
  const key=pairKey(prediction.date,prediction.player1Id,prediction.player2Id);
  const w=workload.get(key);
  const available=Boolean(w && (w.priorMatchRecords7??0)>0);
  return {
    date:prediction.date,
    features:{
      baseLogit:logit(prediction.probabilities.combined),
      matches3:available?w.matches3:0,
      matches7:available?w.matches7:0,
      playingDays7:available?w.playingDays7:0,
      minutes7:available?w.minutes7:0,
      durationCoverage7:available?w.durationCoverage7:0,
      workloadAvailable:available?1:0
    },
    baseProbability:prediction.probabilities.combined,
    outcome:prediction.winnerId===prediction.player1Id?1:0,
    surface:prediction.surface??"Unknown"
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
    const model=fitLogistic(training.map(row=>({...row.features,outcome:row.outcome})),FEATURES,{
      minMatches:minTrainingMatches,maxRows:50000,seed:"winner-formula-"+tour+"-"+trainEnd,penalty:1
    });
    reports[tour]={
      inputMatches:tourRows.length,
      trainingPeriod:"through "+trainEnd,
      evaluationPeriod:evalStart+" through "+evalEnd,
      trainingMatches:training.length,
      evaluationMatches:evaluation.length,
      workloadCoveragePct:evaluation.length?+(100*evaluation.filter(x=>x.features.workloadAvailable===1).length/evaluation.length).toFixed(2):null,
      baselineCombined:metrics(evaluation),
      winnerFormula:model?metrics(evaluation,model):null,
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
