#!/usr/bin/env node
/** Local JSON/JSONL importer for reviewed player-match source-search observations. */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { validateTournamentIntentObservation, summarizeTournamentIntentObservations } from "../tournament-intent-observations.js";

function parseArgs(args){
  const options={};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==="--dry-run"){options.dryRun=true;continue;}
    if(arg==="--help"||arg==="-h"){options.help=true;continue;}
    if(!["--input","--existing","--out"].includes(arg)||!args[i+1])throw new Error("Unknown option or missing value: "+arg);
    options[arg.slice(2)]=args[++i];
  }
  return options;
}
function usage(){
  return "Usage: node scripts/import-tournament-intent-observations.mjs --input observations.json|jsonl --out observations-registry.json [--existing existing.json] [--dry-run]";
}
async function readRows(path,optional=false){
  if(!path)return [];
  let raw;
  try{raw=await readFile(resolve(path),"utf8");}
  catch(error){if(optional&&error.code==="ENOENT")return [];throw error;}
  if(!raw.trim())return [];
  try{
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))return parsed;
    if(Array.isArray(parsed.records))return parsed.records;
    if(optional)throw new Error("Expected existing JSON array or records[] object");
    return [parsed];
  }catch(error){
    if(optional)throw error;
    const rows=[];
    for(const [i,line] of raw.split(/\r?\n/).entries()){
      if(!line.trim())continue;
      try{rows.push(JSON.parse(line));}
      catch{throw new Error("Invalid JSON or JSONL at line "+(i+1));}
    }
    return rows;
  }
}
export async function runObservationImport(args){
  const options=parseArgs(args);
  if(options.help)return {help:usage()};
  if(!options.input||(!options.out&&!options.dryRun))throw new Error(usage());
  const [existing,incoming]=await Promise.all([readRows(options.existing,true),readRows(options.input,false)]);
  const records=existing.slice(),known=new Set(records.map(row=>row?.observationId).filter(Boolean));
  const accepted=[],rejected=[];let duplicates=0;
  for(const [index,row] of incoming.entries()){
    const result=validateTournamentIntentObservation(row);
    if(!result.valid){rejected.push({index,errors:result.errors});continue;}
    if(known.has(result.observation.observationId)){duplicates++;continue;}
    known.add(result.observation.observationId);records.push(result.observation);accepted.push(result.observation);
  }
  const output={schemaVersion:1,updatedAt:new Date().toISOString(),records,summary:summarizeTournamentIntentObservations(records),lastImport:{receivedCount:incoming.length,acceptedCount:accepted.length,rejectedCount:rejected.length,duplicateCount:duplicates},rejected};
  if(!options.dryRun){
    const destination=resolve(options.out),temporary=destination+".tmp";
    await writeFile(temporary,JSON.stringify(output,null,2)+"\n",{flag:"w"});
    await rename(temporary,destination);
  }
  return {dryRun:Boolean(options.dryRun),outputPath:options.dryRun?null:resolve(options.out),lastImport:output.lastImport,summary:output.summary,rejected,recordCount:records.length};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
  try{
    const result=await runObservationImport(process.argv.slice(2));
    process.stdout.write((result.help||JSON.stringify(result,null,2))+"\n");
  }catch(error){process.stderr.write(String(error.message||error)+"\n");process.exitCode=1;}
}
