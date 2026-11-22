#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const TML=/^(\\d{4})\\.csv$/i;
const SACK=/^atp_matches_(\\d{4})\\.csv$/i;
const norm=value=>String(value??"").normalize("NFKD").replace(/\\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
const surface=value=>norm(value);
const dateDay=value=>{
  const s=String(value??"").trim();
  if(!/^\\d{8}$/.test(s))return null;
  const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6,8),t=Date.UTC(y,m-1,d),dt=new Date(t);
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?t/86400000:null;
};
const scoreKey=value=>norm(value).replace(/(?:retired|ret|walkover|wo)/g,"");
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
const playerPair=row=>[norm(row.winner_name),norm(row.loser_name)].sort().join("|");
const pairKey=row=>[surface(row.surface),playerPair(row)].join("::");

export function auditTmlSackmann( tmlFiles, sackmannFiles, registryFile, {maxDateOffsetDays=14}={} ){
  if(!tmlFiles.length||!sackmannFiles.length||!registryFile?.content)throw new Error("TennisMyLife, Sackmann and ATP player registry files are required");
  const registryRows=parseCsv(registryFile.content);
  const registry=new Map(registryRows.filter(r=>r.id).map(r=>[String(r.id).trim(),r]));
  const sackByYear=new Map();
  const sackRowsByYear={};
  for(const file of sackmannFiles){
    const m=basename(file.filename).match(SACK);
    if(!m)throw new Error("Unexpected Sackmann filename: "+basename(file.filename));
    const year=m[1],rows=parseCsv(file.content);
    sackRowsByYear[year]=(sackRowsByYear[year]||0)+rows.length;
    const index=new Map();
    for(const row of rows){
      const day=dateDay(row.tourney_date);
      if(day===null||!surface(row.surface)||!norm(row.winner_name)||!norm(row.loser_name))continue;
      const key=pairKey(row);
      if(!index.has(key))index.set(key,[]);
      index.get(key).push({row,day});
    }
    sackByYear.set(year,index);
  }
  const totals={
    tmlRows:0,candidateRows:0,uniqueCandidateRows:0,scoreResolvedRows:0,tournamentResolvedRows:0,
    unresolvedAmbiguousRows:0,noCandidateRows:0,invalidDateRows:0,unknownSurfaceRows:0,
    playerIdsInMatches:0,playerIdsMapped:0,playerIdsUnmapped:0,crosswalkEdges:0,
    multipleSackmannIds:0,ageConflictObservations:0,iocMismatchObservations:0,
    registryMissingPlayerIds:0,registryNameMismatches:0
  };
  const byYear={}, allTmlIds=new Set(), mapped=new Map();
  for(const file of tmlFiles){
    const m=basename(file.filename).match(TML);
    if(!m)throw new Error("Unexpected TennisMyLife filename: "+basename(file.filename));
    const year=m[1],rows=parseCsv(file.content),index=sackByYear.get(year);
    if(!index)throw new Error("Missing Sackmann ATP file for "+year);
    const y={
      rows:0,candidateRows:0,uniqueCandidateRows:0,scoreResolvedRows:0,tournamentResolvedRows:0,
      unresolvedAmbiguousRows:0,noCandidateRows:0,invalidDateRows:0,unknownSurfaceRows:0
    };
    byYear[year]=y;
    for(const row of rows){
      totals.tmlRows++;y.rows++;
      for(const side of ["winner","loser"]){
        const id=String(row[side+"_id"]??"").trim();
        if(id){allTmlIds.add(id);const p=registry.get(id);if(!p)totals.registryMissingPlayerIds++;
          else if(norm(p.atpname||p.player)&&norm(p.atpname||p.player)!==norm(row[side+"_name"]))totals.registryNameMismatches++;
        }
      }
      const day=dateDay(row.tourney_date);
      if(day===null){totals.invalidDateRows++;y.invalidDateRows++;continue;}
      if(!surface(row.surface)){totals.unknownSurfaceRows++;y.unknownSurfaceRows++;continue;}
      const candidates=(index.get(pairKey(row))||[]).filter(x=>Math.abs(day-x.day)<=maxDateOffsetDays);
      if(!candidates.length){totals.noCandidateRows++;y.noCandidateRows++;continue;}
      totals.candidateRows++;y.candidateRows++;
      let accepted=false;
      if(candidates.length===1){accepted=true;totals.uniqueCandidateRows++;y.uniqueCandidateRows++;}
      else{
        const score=scoreKey(row.score);
        const byScore=score?candidates.filter(x=>scoreKey(x.row.score)===score):[];
        const event=norm(row.tourney_name);
        const byEvent=event?candidates.filter(x=>norm(x.row.tourney_name)===event):[];
        if(byScore.length===1&&byEvent.length===1&&byScore[0].row!==byEvent[0].row){
          totals.unresolvedAmbiguousRows++;y.unresolvedAmbiguousRows++;
        }else if(byScore.length===1){accepted=true;totals.scoreResolvedRows++;y.scoreResolvedRows++;}
        else if(byEvent.length===1){accepted=true;totals.tournamentResolvedRows++;y.tournamentResolvedRows++;}
        else{totals.unresolvedAmbiguousRows++;y.unresolvedAmbiguousRows++;}
      }
      // Build the player crosswalk from every plausible same-pair candidate.
      // Names must match exactly after normalization; match ages are a guard against homonyms.
      for(const side of ["winner","loser"]){
        const id=String(row[side+"_id"]??"").trim(),name=row[side+"_name"];
        if(!id||!norm(name))continue;
        const player=registry.get(id);
        for(const candidate of candidates){
          const srow=candidate.row;
          const sackSide=norm(name)===norm(srow.winner_name)?"winner":norm(name)===norm(srow.loser_name)?"loser":null;
          if(!sackSide)continue;
          const tAge=Number(row[side+"_age"]),sAge=Number(srow[sackSide+"_age"]);
          if(tAge>0&&sAge>0&&Math.abs(tAge-sAge)>0.6){totals.ageConflictObservations++;continue;}
          const tIoc=String(row[side+"_ioc"]??player?.ioc??"").trim().toUpperCase();
          const sIoc=String(srow[sackSide+"_ioc"]??"").trim().toUpperCase();
          if(tIoc&&sIoc&&tIoc!==sIoc)totals.iocMismatchObservations++;
          const sackId=String(srow[sackSide+"_id"]??"").trim();
          if(!sackId)continue;
          if(!mapped.has(id))mapped.set(id,new Set());
          mapped.get(id).add(sackId);
        }
      }
    }
  }
  totals.playerIdsInMatches=allTmlIds.size;
  totals.playerIdsMapped=mapped.size;
  totals.playerIdsUnmapped=allTmlIds.size-mapped.size;
  totals.crosswalkEdges=[...mapped.values()].reduce((n,set)=>n+set.size,0);
  totals.multipleSackmannIds=[...mapped.values()].filter(set=>set.size>1).length;
  totals.matchCoveragePct=pct(totals.candidateRows,totals.tmlRows);
  totals.uniqueMatchCoveragePct=pct(totals.uniqueCandidateRows,totals.tmlRows);
  totals.resolvedMatchRows=totals.uniqueCandidateRows+totals.scoreResolvedRows+totals.tournamentResolvedRows;
  totals.resolvedMatchPct=pct(totals.resolvedMatchRows,totals.tmlRows);
  totals.playerIdCoveragePct=pct(totals.playerIdsMapped,totals.playerIdsInMatches);
  for(const y of Object.values(byYear)){
    y.resolvedMatchRows=y.uniqueCandidateRows+y.scoreResolvedRows+y.tournamentResolvedRows;
    y.resolvedMatchPct=pct(y.resolvedMatchRows,y.rows);
  }
  return {
    schemaVersion:1,
    purpose:"Aggregate-only TennisMyLife ATP to Sackmann linkage and player-ID crosswalk audit; no player-level crosswalk is exported.",
    sources:{
      tmlFiles:tmlFiles.map(x=>basename(x.filename)).sort(),
      sackmannFiles:sackmannFiles.map(x=>basename(x.filename)).sort(),
      tmlRegistryRows:registryRows.length,
      sackmannRowsByYear:sackRowsByYear
    },
    matching:{
      playerNames:"exact normalized full-name pair, order-independent",
      surface:"exact normalized surface",
      date:"absolute difference between tournament-week dates <= "+maxDateOffsetDays+" days",
      ambiguousResolution:"one candidate; otherwise unique exact score; otherwise unique exact tournament name; disagreements remain unresolved",
      playerIdCrosswalk:"TennisMyLife ATP player IDs are linked to Sackmann IDs by exact player name inside candidate matches; match-age disagreement >0.6 years is rejected; nationality-code differences are flagged, not automatically rejected"
    },
    totals,byYear,
    warnings:[
      "TennisMyLife ATP IDs are source-specific identifiers, not universal IDs.",
      "Some Sackmann player IDs map to one TennisMyLife ID across different years; these are retained as multiple source-ID aliases and are not silently collapsed.",
      "Nationality codes differ for some otherwise name- and age-consistent rows; inspect those source records before using nationality as a hard matching key.",
      "This is a research-only aggregate report. No raw datasets or player-level crosswalk are exported.",
      "TennisMyLife public terms restrict use to personal, educational and non-commercial research; commercial model use requires prior written permission."
    ]
  };
}

async function main(){
  const args=process.argv.slice(2);let tdir="",sdir="",registryPath="",out="audit-output/aggregator1-tennismylife-audit.json",window=14;
  for(let i=0;i<args.length;i++){
    if(args[i]==="--tml-dir")tdir=args[++i];
    else if(args[i]==="--sackmann-dir")sdir=args[++i];
    else if(args[i]==="--registry")registryPath=args[++i];
    else if(args[i]==="--date-window")window=Number(args[++i]);
    else if(args[i]==="--out")out=args[++i];
    else throw new Error("Usage: node scripts/aggregator1-tennismylife-audit.mjs --tml-dir DIR --sackmann-dir DIR --registry FILE [--date-window 14] [--out report.json]");
  }
  if(!tdir||!sdir||!registryPath||!Number.isInteger(window)||window<0||window>31)throw new Error("Invalid input paths or date window");
  const tnames=(await readdir(tdir)).filter(n=>TML.test(n)).sort();
  const snames=(await readdir(sdir)).filter(n=>SACK.test(n)).sort();
  const tfiles=[];for(const n of tnames)tfiles.push({filename:n,content:await readFile(join(tdir,n),"utf8")});
  const sfiles=[];for(const n of snames)sfiles.push({filename:n,content:await readFile(join(sdir,n),"utf8")});
  const registryFile={filename:basename(registryPath),content:await readFile(registryPath,"utf8")};
  const report=auditTmlSackmann(tfiles,sfiles,registryFile,{maxDateOffsetDays:window});
  await writeFile(out,JSON.stringify(report,null,2)+"\n");
  console.log("TennisMyLife ATP rows: "+report.totals.tmlRows);
  console.log("Candidate matches: "+report.totals.candidateRows+"; resolved: "+report.totals.resolvedMatchRows+"; unresolved: "+report.totals.unresolvedAmbiguousRows);
  console.log("TML player IDs mapped: "+report.totals.playerIdsMapped+"/"+report.totals.playerIdsInMatches);
  console.log("Aggregate report written to "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
