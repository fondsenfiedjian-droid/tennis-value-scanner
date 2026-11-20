#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const PINNED_COMMIT="83733587353df8a41f2fd4f516147d5aa83f5a8d";
const SLAMS=["ausopen","frenchopen","wimbledon","usopen"];
const SLAM_META=/^(\d{4})-(ausopen|frenchopen|wimbledon|usopen)-matches\.csv$/i;
const RESULT_FILE=/^(atp|wta)_matches_(\d{4})\.csv$/i;
const EVENT_ALIASES={ausopen:["australianopen"],frenchopen:["frenchopen","rolandgarros"],wimbledon:["wimbledon"],usopen:["usopen"]};
const normalizeName=value=>String(value??"").normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"");
const normalizeRound=value=>String(value??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
const pairKey=(a,b)=>[normalizeName(a),normalizeName(b)].sort().join("|");
const eventMatches=(name,slam)=>EVENT_ALIASES[slam].some(alias=>normalizeName(name).includes(alias));

export function auditSlamMatchLinkage(files){
  if(!Array.isArray(files)||!files.length)throw new Error("No Slam linkage files supplied");
  const slamMeta=new Map(),resultFiles=[];
  for(const file of files){
    const name=basename(file.filename),sm=name.match(SLAM_META),rm=name.match(RESULT_FILE);
    if(sm)slamMeta.set(sm[1]+"-"+sm[2].toLowerCase(),{year:sm[1],slam:sm[2].toLowerCase(),rows:parseCsv(file.content)});
    else if(rm)resultFiles.push({tour:rm[1].toUpperCase(),year:rm[2],rows:parseCsv(file.content)});
    else throw new Error("Unexpected Slam linkage filename: "+name);
  }
  if(!slamMeta.size||!resultFiles.length)throw new Error("Both Slam metadata and main-tour result files are required");
  const index=new Map(),resultEventCounts={};
  for(const file of resultFiles)for(const row of file.rows){
    const year=String(row.tourney_date??"").slice(0,4);
    if(year!==file.year)continue;
    for(const slam of SLAMS)if(eventMatches(row.tourney_name,slam)){
      const key=[year,slam,pairKey(row.winner_name,row.loser_name)].join(":");
      if(!index.has(key))index.set(key,[]);
      index.get(key).push({...row,__tour:file.tour});
      const group=file.tour+":"+year+":"+slam;
      resultEventCounts[group]=(resultEventCounts[group]||0)+1;
    }
  }
  const events=[];
  for(const [eventKey,meta] of [...slamMeta.entries()].sort(([a],[b])=>a.localeCompare(b))){
    let linked=0,linkedATP=0,linkedWTA=0,ambiguous=0,unmatched=0,missingNames=0,roundConflicts=0,winnerChecks=0,winnerMismatches=0;
    let firstDate=null,lastDate=null;
    const seenIds=new Set();
    for(const row of meta.rows){
      const id=String(row.match_id??"").trim();if(id)seenIds.add(id);
      const p1=String(row.player1??"").trim(),p2=String(row.player2??"").trim();
      if(!p1||!p2){missingNames++;continue;}
      const key=[meta.year,meta.slam,pairKey(p1,p2)].join(":");
      let candidates=index.get(key)||[];
      const round=normalizeRound(row.round);
      if(candidates.length>1&&round){
        const roundMatches=candidates.filter(candidate=>normalizeRound(candidate.round)===round);
        if(roundMatches.length===1)candidates=roundMatches;
      }
      if(candidates.length===0){unmatched++;continue;}
      if(candidates.length>1){ambiguous++;continue;}
      const candidate=candidates[0];
      if(round&&normalizeRound(candidate.round)!==round){roundConflicts++;continue;}
      linked++;
      if(candidate.__tour==="ATP")linkedATP++;else if(candidate.__tour==="WTA")linkedWTA++;
      const date=String(candidate.tourney_date??"");
      if(date&&(!firstDate||date<firstDate))firstDate=date;
      if(date&&(!lastDate||date>lastDate))lastDate=date;
      const winner=String(row.winner??"").trim();
      if(winner==="1"||winner==="2"){
        winnerChecks++;
        const expected=normalizeName(winner==="1"?p1:p2);
        if(normalizeName(candidate.winner_name)!==expected)winnerMismatches++;
      } else if(winner){
        const expected=normalizeName(winner);
        if(expected===normalizeName(p1)||expected===normalizeName(p2)){
          winnerChecks++;
          if(normalizeName(candidate.winner_name)!==expected)winnerMismatches++;
        }
      }
    }
    const metadataRows=meta.rows.length;
    events.push({
      year:meta.year,slam:meta.slam,metadataRows,uniqueMetadataMatchIds:seenIds.size,
      linkedUniqueMatches:linked,linkedATP,linkedWTA,ambiguous,unmatched,missingPlayerNames:missingNames,roundConflicts,
      winnerCrossChecks:winnerChecks,winnerMismatches,
      linkagePct:metadataRows?Number((100*linked/metadataRows).toFixed(2)):null,
      linkedResultDateRange:firstDate&&lastDate?{from:firstDate,to:lastDate}:null,
      mainTourResultRows:(resultEventCounts["ATP:"+meta.year+":"+meta.slam]||0)+(resultEventCounts["WTA:"+meta.year+":"+meta.slam]||0)
    });
  }
  const totals=events.reduce((s,e)=>({
    events:s.events+1,metadataRows:s.metadataRows+e.metadataRows,uniqueMetadataMatchIds:s.uniqueMetadataMatchIds+e.uniqueMetadataMatchIds,
    linkedUniqueMatches:s.linkedUniqueMatches+e.linkedUniqueMatches,linkedATP:s.linkedATP+e.linkedATP,linkedWTA:s.linkedWTA+e.linkedWTA,
    ambiguous:s.ambiguous+e.ambiguous,unmatched:s.unmatched+e.unmatched,missingPlayerNames:s.missingPlayerNames+e.missingPlayerNames,
    roundConflicts:s.roundConflicts+e.roundConflicts,winnerCrossChecks:s.winnerCrossChecks+e.winnerCrossChecks,winnerMismatches:s.winnerMismatches+e.winnerMismatches
  }),{events:0,metadataRows:0,uniqueMetadataMatchIds:0,linkedUniqueMatches:0,linkedATP:0,linkedWTA:0,ambiguous:0,unmatched:0,missingPlayerNames:0,roundConflicts:0,winnerCrossChecks:0,winnerMismatches:0});
  return {
    schemaVersion:1,source:"Jeff Sackmann Grand Slam point-by-point archive linked to Sackmann ATP/WTA main-tour results",
    sourceCommit:PINNED_COMMIT,license:"CC BY-NC-SA 4.0; attribution required; non-commercial only; share-alike",
    totals,events,
    warnings:[
      "Linkage uses normalized full player-name pairs plus Slam and year; no fuzzy or guessed links are accepted.",
      "Only unique matches are linked. Ambiguous, unmatched, missing-name and round-conflict cases remain excluded.",
      "Linked tourney_date is the source event date (typically the Monday of tournament week), not the exact point/match date.",
      "Metadata round and winner fields are mostly absent; do not assume within-tournament chronology from this linkage alone."
    ]
  };
}

async function main(){
  const args=process.argv.slice(2);let dir="",out="slam-linkage-audit.json";
  for(let i=0;i<args.length;i++){if(args[i]==="--input-dir")dir=args[++i];else if(args[i]==="--out")out=args[++i];else throw new Error("Usage: node scripts/slam-match-linkage-audit.mjs --input-dir DIR --out report.json");}
  if(!dir)throw new Error("Missing --input-dir");
  const names=(await readdir(dir)).filter(n=>SLAM_META.test(n)||RESULT_FILE.test(n)).sort();
  const files=[];for(const name of names)files.push({filename:name,content:await readFile(join(dir,name),"utf8")});
  const report=auditSlamMatchLinkage(files);
  await writeFile(out,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report.totals));
  console.log("Wrote aggregate-only Slam linkage audit: "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
