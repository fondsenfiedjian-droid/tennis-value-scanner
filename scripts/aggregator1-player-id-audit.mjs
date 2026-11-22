#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const VBT=/^valuebetennis-matchs-(\d{4})\.csv$/i;
const norm=v=>String(v??"").normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;

export function auditPlayerIdCrosswalk(valuebetFiles,playerFiles){
  if(!valuebetFiles.length||!playerFiles.length)throw new Error("Valuebetennis match files and Sackmann player registries are required");
  const registryByTour={},registryNameCollisions={},registryColumns={};
  for(const file of playerFiles){
    const fileName=basename(file.filename).toLowerCase();
    const tour=fileName.startsWith("atp_")?"ATP":fileName.startsWith("wta_")?"WTA":null;
    if(!tour)throw new Error("Unexpected player registry filename: "+basename(file.filename));
    const rows=parseCsv(file.content),names=new Map();let validRows=0;
    registryColumns[tour]=Object.keys(rows[0]||{});
    for(const row of rows){
      const id=String(row.player_id??row.id??"").trim();
      const first=String(row.name_first??row.first_name??"").trim(),last=String(row.name_last??row.last_name??"").trim();
      const variants=[norm([first,last].filter(Boolean).join(" ")),norm([last,first].filter(Boolean).join(" "))].filter(Boolean);
      if(!id||!variants.length)continue;
      validRows++;
      for(const full of new Set(variants)){
        if(!names.has(full))names.set(full,new Set());
        names.get(full).add(id);
      }
    }
    if(!validRows)throw new Error("No valid "+tour+" player registry rows; columns: "+Object.keys(rows[0]||{}).join(","));
    registryByTour[tour]={names,rows:rows.length,validRows};
    registryNameCollisions[tour]=[...names.values()].filter(ids=>ids.size>1).length;
  }

  const sourceIds={ATP:new Map(),WTA:new Map()};let valuebetColumns=[];
  const totals={matchRows:0,playerObservations:0,missingSourcePlayerId:0,missingPlayerName:0};
  for(const file of valuebetFiles){
    if(!VBT.test(basename(file.filename)))throw new Error("Unexpected Valuebetennis filename: "+basename(file.filename));
    const parsedRows=parseCsv(file.content,{delimiter:";"});
    if(!valuebetColumns.length)valuebetColumns=Object.keys(parsedRows[0]||{});
    const required=["genre","joueur1_id","joueur1","joueur2_id","joueur2"];
    if(required.some(key=>!valuebetColumns.includes(key)))throw new Error("Valuebetennis player schema is missing required columns: "+required.filter(key=>!valuebetColumns.includes(key)).join(","));
    for(const row of parsedRows){
      const tour=String(row.genre??"").trim().toUpperCase();
      if(!["ATP","WTA"].includes(tour))continue;
      totals.matchRows++;
      for(const side of ["joueur1","joueur2"]){
        totals.playerObservations++;
        const id=String(row[side+"_id"]??"").trim(),name=norm(row[side]);
        if(!id){totals.missingSourcePlayerId++;continue;}
        if(!name){totals.missingPlayerName++;continue;}
        if(!sourceIds[tour].has(id))sourceIds[tour].set(id,new Set());
        sourceIds[tour].get(id).add(name);
      }
    }
  }

  const byTour={};
  for(const tour of ["ATP","WTA"]){
    const source=sourceIds[tour],registry=registryByTour[tour];
    const counts={distinctSourcePlayerIds:source.size,resolved:0,ambiguous:0,unmapped:0,multipleSourceNameVariants:0,registryNameCollisions:registryNameCollisions[tour],sourceIdsWithAnyRegistryName:0};
    for(const names of source.values()){
      if(names.size>1)counts.multipleSourceNameVariants++;
      const matchedIds=new Set();let anyHit=false;
      for(const name of names){
        const ids=registry.names.get(name);
        if(ids){anyHit=true;for(const id of ids)matchedIds.add(id);}
      }
      if(anyHit)counts.sourceIdsWithAnyRegistryName++;
      if(matchedIds.size===1)counts.resolved++;
      else if(matchedIds.size>1)counts.ambiguous++;
      else counts.unmapped++;
    }
    counts.resolutionPct=pct(counts.resolved,counts.distinctSourcePlayerIds);
    counts.anyNameHitPct=pct(counts.sourceIdsWithAnyRegistryName,counts.distinctSourcePlayerIds);
    byTour[tour]=counts;
  }
  return {
    schemaVersion:1,
    purpose:"Aggregate-only crosswalk coverage audit. No source player IDs, names, or ID mappings are exported.",
    sources:{valuebetennisFiles:valuebetFiles.map(x=>basename(x.filename)).sort(),valuebetennisColumns:valuebetColumns,sackmannPlayerRegistries:playerFiles.map(x=>basename(x.filename)).sort(),playerRegistryColumns:registryColumns,registryRows:Object.fromEntries(Object.entries(registryByTour).map(([tour,r])=>[tour,{rows:r.rows,validRows:r.validRows,distinctNormalizedNames:r.names.size}]))},
    totals,
    byTour,
    matching:{method:"exact normalized full name in either first-last or last-first order (Unicode diacritics removed; punctuation and spaces removed); all source-name variants for one Valuebetennis player ID must resolve to exactly one Sackmann player ID",fuzzyMatching:false,initialsMatching:false},
    warnings:["A resolved name match is a candidate crosswalk, not yet an authoritative identity assertion; review DOB/country/hand where available before use.","Source-native IDs are preserved conceptually and are never overwritten by this audit.","No player names, source player IDs, or row-level mappings are written to the report.","Sackmann data is CC BY-NC-SA 4.0; non-commercial use, attribution and share-alike conditions apply."]
  };
}

async function main(){
  const args=process.argv.slice(2);let vdir="",sdir="",out="aggregator1-player-id-audit.json";
  for(let i=0;i<args.length;i++){
    if(args[i]==="--valuebet-dir")vdir=args[++i];
    else if(args[i]==="--sackmann-dir")sdir=args[++i];
    else if(args[i]==="--out")out=args[++i];
    else throw new Error("Usage: node scripts/aggregator1-player-id-audit.mjs --valuebet-dir DIR --sackmann-dir DIR [--out report.json]");
  }
  if(!vdir||!sdir)throw new Error("Input directories are required");
  const vnames=(await readdir(vdir)).filter(n=>VBT.test(n)).sort();
  const pnames=(await readdir(sdir)).filter(n=>/^(atp|wta)_players\.csv$/i.test(n)).sort();
  const vfiles=[];for(const n of vnames)vfiles.push({filename:n,content:await readFile(join(vdir,n),"utf8")});
  const pfiles=[];for(const n of pnames)pfiles.push({filename:n,content:await readFile(join(sdir,n),"utf8")});
  const report=auditPlayerIdCrosswalk(vfiles,pfiles);
  await writeFile(out,JSON.stringify(report,null,2)+"\n");
  console.log("ATP source IDs: "+report.byTour.ATP.distinctSourcePlayerIds+"; uniquely name-mapped: "+report.byTour.ATP.resolved+"; registry: "+JSON.stringify(report.sources.registryRows.ATP));
  console.log("WTA source IDs: "+report.byTour.WTA.distinctSourcePlayerIds+"; uniquely name-mapped: "+report.byTour.WTA.resolved+"; registry: "+JSON.stringify(report.sources.registryRows.WTA));
  console.log("Valuebetennis columns: "+report.sources.valuebetennisColumns.join(","));
  console.log("Player registry columns: "+JSON.stringify(report.sources.playerRegistryColumns));
  console.log("Player observations: "+JSON.stringify(report.totals));
  console.log("Aggregate player-ID report written to "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
