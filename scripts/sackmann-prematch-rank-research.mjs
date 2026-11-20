#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";
import { runRankAgeWalkForward } from "./sackmann-rank-age-research.mjs";

const validDate = value => {
  const s = String(value ?? "");
  if (!/^\d{8}$/.test(s)) return null;
  const y=Number(s.slice(0,4)),m=Number(s.slice(4,6)),d=Number(s.slice(6,8));
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d ? s : null;
};
const validRank = value => Number.isFinite(value) && value>0 && value<=10000;
function hasOnDate(records, date) {\n  let low=0, high=records.length;\n  while(low<high){const mid=(low+high)>>>1;if(records[mid].date<date)low=mid+1;else high=mid;}\n  return low<records.length && records[low].date===date;\n}\nfunction latestBefore(records, date) {
  let low=0, high=records.length;
  while(low<high){const mid=(low+high)>>>1;if(records[mid].date<date)low=mid+1;else high=mid;}
  return low ? records[low-1] : null;
}
export function buildPrematchRankRows(matches, rankingRows) {
  const byPlayer=new Map();
  for(const row of rankingRows){
    const date=validDate(row.ranking_date), id=String(row.player??"").trim(), rank=Number(row.rank);
    if(!date || !/^\d+$/.test(id) || !validRank(rank)) continue;
    if(!byPlayer.has(id)) byPlayer.set(id,new Map());
    const dates=byPlayer.get(id);
    const prior=dates.get(date);
    if(prior==null || rank<prior) dates.set(date,rank);
  }
  const indexes=new Map();
  for(const [id,dates] of byPlayer) indexes.set(id,[...dates].map(([date,rank])=>({date,rank})).sort((a,b)=>a.date.localeCompare(b.date)));
  let both=0, one=0, none=0, exactSameDayExcluded=0, maxAge=0, ageTotal=0, ageCount=0;
  const enriched=matches.map(row=>{
    const date=validDate(row.tourney_date);
    const w=String(row.winner_id??"").trim(), l=String(row.loser_id??"").trim();
    const wr=date ? latestBefore(indexes.get(w)??[],date) : null;
    const lr=date ? latestBefore(indexes.get(l)??[],date) : null;
    const winner_rank=wr?.rank??"";
    const loser_rank=lr?.rank??"";
    if(wr&&lr){
      both++;
      const age=Math.max(0,Math.round((Date.parse(date.slice(0,4)+"-"+date.slice(4,6)+"-"+date.slice(6,8)+"T00:00:00Z")-Date.parse(wr.date.slice(0,4)+"-"+wr.date.slice(4,6)+"-"+wr.date.slice(6,8)+"T00:00:00Z"))/86400000));
      const age2=Math.max(0,Math.round((Date.parse(date.slice(0,4)+"-"+date.slice(4,6)+"-"+date.slice(6,8)+"T00:00:00Z")-Date.parse(lr.date.slice(0,4)+"-"+lr.date.slice(4,6)+"-"+lr.date.slice(6,8)+"T00:00:00Z"))/86400000));
      maxAge=Math.max(maxAge,age,age2);ageTotal+=age+age2;ageCount+=2;
    } else if(wr||lr) one++; else none++;
    if(date && (hasOnDate(indexes.get(w)??[],date)||hasOnDate(indexes.get(l)??[],date))) exactSameDayExcluded++;
    return {...row,winner_rank,loser_rank,rank_snapshot_winner_date:wr?.date??"",rank_snapshot_loser_date:lr?.date??""};
  });
  return {rows:enriched,coverage:{matches:matches.length,bothPlayersRanked:both,onePlayerRanked:one,neitherRanked:none,bothCoveragePct:Number((100*both/Math.max(1,matches.length)).toFixed(2)),sameDayRankingRowsExcluded:exactSameDayExcluded,averageSnapshotAgeDays:ageCount?Number((ageTotal/ageCount).toFixed(1)):null,maxSnapshotAgeDays:maxAge}};
}
async function main(){
 const args=process.argv.slice(2),opts={},files=[];
 for(let i=0;i<args.length;i++){
  if(["--tour","--rankings-dir","--from","--to","--k","--min-training","--max-training","--out"].includes(args[i])){
   const key=args[i].slice(2),value=args[++i];if(!value)throw new Error("Missing value for --"+key);
   opts[key]=value;
  } else if(args[i].startsWith("--"))throw new Error("Unknown option "+args[i]); else files.push(args[i]);
 }
 if(!["atp","wta"].includes(opts.tour)||!opts["rankings-dir"]||!files.length)throw new Error("Usage: node scripts/sackmann-prematch-rank-research.mjs --tour atp|wta --rankings-dir DIR [--from YYYYMMDD] [--to YYYYMMDD] [--k 32] normalized.csv");
 const rankingFiles=(await readdir(opts["rankings-dir"])).filter(n=>n.endsWith(".csv")).sort();
 if(!rankingFiles.length)throw new Error("No ranking CSV files found");
 const rankings=[];
 for(const name of rankingFiles){const rows=parseCsv(await readFile(join(opts["rankings-dir"],name),"utf8"));for(const row of rows)rankings.push(row);console.error("Loaded "+rows.length+" weekly ranking rows from "+name);}
 const matches=[];
 for(const file of files){const rows=parseCsv(await readFile(file,"utf8"));for(const row of rows)matches.push(row);console.error("Loaded "+rows.length+" matches from "+basename(file));}
 const built=buildPrematchRankRows(matches,rankings);
 const report=runRankAgeWalkForward(built.rows,{tour:opts.tour,evaluationStart:opts.from??"20000101",evaluationEnd:opts.to??"20261231",kFactor:Number(opts.k??32),minTrainingMatches:Number(opts["min-training"]??1000),maxTrainingRows:Number(opts["max-training"]??20000)});
 report.rankSource="latest official weekly ranking snapshot strictly earlier than tournament date";
 report.rankCoverage=built.coverage;
 report.rankTimingRule="ranking_date < tourney_date; same-day ranking snapshots are excluded conservatively";
 const json=JSON.stringify(report,null,2)+"\n";
 if(opts.out)await writeFile(opts.out,json,"utf8");
 console.log(json);
}
if(import.meta.url==="file://"+process.argv[1])await main();
