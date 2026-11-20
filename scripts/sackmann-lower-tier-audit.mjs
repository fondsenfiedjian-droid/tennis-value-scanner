#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const PINNED_COMMIT = "83733587353df8a41f2fd4f516147d5aa83f5a8d";
const validDate = value => {
  const s=String(value??"");
  if(!/^\d{8}$/.test(s)) return false;
  const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6,8);
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d;
};
const validId = value => /^\d+$/.test(String(value??"")) && Number(value)>0;
const validCount = value => value!=="" && value!=null && Number.isInteger(Number(value)) && Number(value)>=0;
const surfaces = new Set(["Hard","Clay","Grass","Carpet"]);
function completedScore(value,bestOf){
  const s=String(value??"").trim();
  if(!s || /\b(?:W\/O|RET|ABD|DEF|DEFAULT|CANC)\b/i.test(s)) return false;
  const sets=[...s.matchAll(/(\d{1,2})-(\d{1,2})/g)].filter(m=>{
    const a=+m[1],b=+m[2],hi=Math.max(a,b),lo=Math.min(a,b);
    return (hi>=6 && hi-lo>=2)||(hi===7&&lo===6);
  }).length;
  return sets >= (Number(bestOf)===5?3:2);
}
export function auditLowerTierFiles(files){
  const groups=new Map();
  const schemaCounts={};
  for(const file of files){
    const name=basename(file.filename);
    const m=name.match(/^(atp|wta)_matches_(futures|qual_chall|qual_itf)_(\d{4})\.csv$/i);
    if(!m) throw new Error("Unexpected lower-tier filename: "+name);
    const tour=m[1].toUpperCase();
    const type=m[2].toLowerCase();
    const year=m[3];
    const rows=parseCsv(file.content);
    const key=tour+":"+type;
    if(!groups.has(key)) groups.set(key,{tour,sourceType:type,files:0,rows:0,validDates:0,validPlayerPairs:0,completedMatches:0,rankBoth:0,ageBoth:0,knownSurface:0,coreServeStatsBoth:0,missingIds:0,invalidDates:0,invalidScores:0,players:new Set(),naturalKeys:new Map(),years:new Set(),columns:new Map()});
    const g=groups.get(key); g.files++; g.rows+=rows.length; g.years.add(year);
    for(const row of rows){
      const date=String(row.tourney_date??"");
      const winner=String(row.winner_id??""),loser=String(row.loser_id??"");
      const hasIds=validId(winner)&&validId(loser)&&winner!==loser;
      if(!hasIds) g.missingIds++;
      if(validDate(date)) g.validDates++; else g.invalidDates++;
      if(hasIds){g.validPlayerPairs++;g.players.add(winner);g.players.add(loser);}
      if(validCount(row.w_1stIn)&&validCount(row.w_1stWon)&&validCount(row.w_2ndWon)&&validCount(row.l_1stIn)&&validCount(row.l_1stWon)&&validCount(row.l_2ndWon)) g.coreServeStatsBoth++;
      if(validDate(date)&&hasIds&&completedScore(row.score,row.best_of)){
        g.completedMatches++;
        if(validId(row.winner_rank)&&validId(row.loser_rank))g.rankBoth++;
        if(Number.isFinite(Number(row.winner_age))&&Number(row.winner_age)>=13&&Number(row.winner_age)<=60&&Number.isFinite(Number(row.loser_age))&&Number(row.loser_age)>=13&&Number(row.loser_age)<=60)g.ageBoth++;
        if(surfaces.has(row.surface))g.knownSurface++;
        const pair=[winner,loser].sort((a,b)=>Number(a)-Number(b)).join(":");
        const natural=[date,row.tourney_id??"",row.match_num??"",pair,row.round??""].join("|");
        g.naturalKeys.set(natural,(g.naturalKeys.get(natural)||0)+1);
      } else g.invalidScores++;
      for(const col of Object.keys(row))g.columns.set(col,(g.columns.get(col)||0)+1);
    }
  }
  return {
    schemaVersion:1,
    source:"Aneeshers/tennis-sackmann-archive; original Jeff Sackmann ATP/WTA data",
    sourceCommit:PINNED_COMMIT,
    license:"CC BY-NC-SA 4.0; attribution required; non-commercial only; share-alike",
    groups:[...groups.values()].map(g=>{
      const duplicates=[...g.naturalKeys.values()].filter(n=>n>1).length;
      return {tour:g.tour,sourceType:g.sourceType,files:g.files,years:[...g.years].sort(),rows:g.rows,
        validDates:g.validDates,invalidDates:g.invalidDates,validPlayerPairs:g.validPlayerPairs,
        rowsMissingOrInvalidPlayerIds:g.missingIds,completedMatches:g.completedMatches,
        rejectedOrIncompleteMatches:g.invalidScores,uniquePlayers:g.players.size,
        rankBothPct:g.completedMatches?Number((100*g.rankBoth/g.completedMatches).toFixed(2)):null,
        ageBothPct:g.completedMatches?Number((100*g.ageBoth/g.completedMatches).toFixed(2)):null,
        knownSurfacePct:g.completedMatches?Number((100*g.knownSurface/g.completedMatches).toFixed(2)):null,
        coreServeStatsBothPct:g.completedMatches?Number((100*g.coreServeStatsBoth/g.completedMatches).toFixed(2)):null,
        duplicateNaturalMatchGroups:duplicates,columns:[...g.columns.keys()].sort()};
    }),
    warnings:["Lower-tier and qualifying results are separate from main-tour matches; do not merge Elo streams without tier-aware calibration.",
      "Counts are an audit only. No raw match rows or player-level derived data are retained.",
      "Historical source coverage and match-level quality vary by year and event type."]
  };
}
async function main(){
  const args=process.argv.slice(2);let dir="",out="lower-tier-audit.json";
  for(let i=0;i<args.length;i++){if(args[i]==="--input-dir")dir=args[++i];else if(args[i]==="--out")out=args[++i];else throw new Error("Usage: node scripts/sackmann-lower-tier-audit.mjs --input-dir DIR --out report.json");}
  if(!dir)throw new Error("Missing --input-dir");
  const names=(await readdir(dir)).filter(n=>/^(atp|wta)_matches_(futures|qual_chall|qual_itf)_\d{4}\.csv$/i.test(n)).sort();
  if(!names.length)throw new Error("No lower-tier source files found");
  const files=[];for(const name of names)files.push({filename:name,content:await readFile(join(dir,name),"utf8")});
  const report=auditLowerTierFiles(files);await writeFile(out,JSON.stringify(report,null,2)+"\n");
  for(const g of report.groups)console.log(g.tour+" "+g.sourceType+": "+g.completedMatches+" completed / "+g.rows+" source rows across "+g.files+" files");
  console.log("Wrote aggregate-only audit: "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
