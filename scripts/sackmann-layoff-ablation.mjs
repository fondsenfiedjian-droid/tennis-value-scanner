#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";
import { runLayoffWalkForward } from "./sackmann-layoff-research.mjs";

const OVER90=["player1Over90","player2Over90"];
const OVER180=["player1Over180","player2Over180"];
const RETURN_COUNTS=["player1ReturnMatchesLog","player2ReturnMatchesLog","returnMatchesDiffLog"];
const VARIANTS = [
  { key:"full", label:"Все признаки", excluded:[] },
  { key:"no_90_180_indicators", label:"Без индикаторов 90/180 дней", excluded:[...OVER90,...OVER180] },
  { key:"no_90_indicators", label:"Без индикаторов 90 дней", excluded:OVER90 },
  { key:"no_180_indicators", label:"Без индикаторов 180 дней", excluded:OVER180 },
  { key:"no_max_layoff", label:"Без максимальной длительности перерыва", excluded:["layoffMaxLog"] },
  { key:"no_return_match_count", label:"Без числа матчей после возвращения", excluded:RETURN_COUNTS },
  { key:"no_unknown_history", label:"Без признака неизвестной истории", excluded:["unknownPriorCount"] },
  { key:"atp_compact", label:"Компактная модель ATP: без max layoff, счётчика возвращения и неизвестной истории",
    excluded:["layoffMaxLog",...RETURN_COUNTS,"unknownPriorCount"] }
];

function summarize(report) {
  const cohorts={};
  for(const key of ["90_179","180_364","365_plus"]) {
    const g=report.cohorts.layoffDays[key];
    cohorts[key]=g?{n:g.playerMatchObservations,delta:g.delta}:null;
  }
  for(const key of ["1","2","3"]) {
    const g=report.cohorts.firstMatchesAfterReturn[key];
    cohorts["return_"+key]=g?{n:g.playerMatchObservations,delta:g.delta}:null;
  }
  const annual=Object.values(report.byYear).filter(x=>x.delta);
  return {
    features:report.candidateFeatures,
    overall:{matches:report.summary.candidate.matches,delta:report.summary.delta},
    years:{count:annual.length,brierImproved:annual.filter(x=>x.delta.brier<0).length,
      logLossImproved:annual.filter(x=>x.delta.logLoss<0).length,
      accuracyImproved:annual.filter(x=>x.delta.accuracy>0).length},
    cohorts
  };
}

async function main() {
  const args=process.argv.slice(2),opts={},files=[];
  for(let i=0;i<args.length;i++) {
    if(["--tour","--from","--to","--k","--min-training","--max-training","--out"].includes(args[i])) {
      const key=args[i].slice(2),value=args[++i];
      if(!value) throw new Error("Missing value for --"+key);
      opts[key]=value;
    } else if(args[i].startsWith("--")) throw new Error("Unknown option "+args[i]);
    else files.push(args[i]);
  }
  if(!["atp","wta"].includes(opts.tour)||!files.length)
    throw new Error("Usage: node scripts/sackmann-layoff-ablation.mjs --tour atp|wta [--from YYYYMMDD] [--to YYYYMMDD] normalized.csv");
  const rows=[];
  for(const file of files) {
    const parsed=parseCsv(await readFile(file,"utf8"));
    rows.push(...parsed);
    console.error("Loaded "+parsed.length+" rows from "+file);
  }
  const common={tour:opts.tour,evaluationStart:opts.from??"20000101",
    evaluationEnd:opts.to??"20260525",kFactor:Number(opts.k??32),
    minTrainingMatches:Number(opts["min-training"]??1000),
    maxTrainingRows:Number(opts["max-training"]??20000),symmetricTraining:true};
  const variants=VARIANTS.filter(v=>v.key!=="atp_compact"||opts.tour==="atp");
  const results={schemaVersion:2,researchOnly:true,tour:opts.tour,
    method:"Walk-forward yearly models; same dates and Elo baseline in every variant; symmetric training; one feature group excluded at a time, plus a predeclared compact ATP combination.",
    variants:{}};
  for(const variant of variants) {
    console.error("Running "+variant.key+"...");
    const report=runLayoffWalkForward(rows,{...common,excludedFeatures:variant.excluded});
    results.variants[variant.key]={label:variant.label,excludedFeatures:variant.excluded,
      ...summarize(report)};
  }
  const json=JSON.stringify(results,null,2)+"\n";
  if(opts.out) await writeFile(opts.out,json,"utf8");
  console.log(json);
}
if(import.meta.url==="file://"+process.argv[1]) await main();
