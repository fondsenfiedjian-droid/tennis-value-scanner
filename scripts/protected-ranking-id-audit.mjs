#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";

const args=process.argv.slice(2), opts={};
for(let i=0;i<args.length;i++){
  if(!["--tour","--input","--observations"].includes(args[i]) || !args[i+1]) {
    throw new Error("Usage: node scripts/protected-ranking-id-audit.mjs --tour atp|wta --input NORMALIZED.csv --observations OBSERVATIONS.csv");
  }
  opts[args[i].slice(2)]=args[++i];
}
if(!["atp","wta"].includes(opts.tour)||!opts.input||!opts.observations) {
  throw new Error("Usage: node scripts/protected-ranking-id-audit.mjs --tour atp|wta --input NORMALIZED.csv --observations OBSERVATIONS.csv");
}
const norm=s=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const [archiveText,obsText]=await Promise.all([
  readFile(opts.input,"utf8"),readFile(opts.observations,"utf8")
]);
const archive=parseCsv(archiveText), observations=parseCsv(obsText);
const tourObservations=observations.filter(row=>String(row.tour??"").trim().toLowerCase()===opts.tour);
const index=new Map();
for(const row of archive){
  for(const side of ["winner","loser"]){
    const name=String(row[side+"_name"]??"").trim(), id=String(row[side+"_id"]??"").trim();
    if(!name||!/^\d+$/.test(id)) continue;
    const key=norm(name);
    if(!index.has(key)) index.set(key,new Map());
    const ids=index.get(key);
    if(!ids.has(id)) ids.set(id,{id,name,matches:0});
    ids.get(id).matches++;
  }
}
let matched=0,missing=0,ambiguous=0;
for(const row of tourObservations){
  const name=String(row.source_player_name??row.player_name??"").trim();
  if(!name) continue;
  const found=[...(index.get(norm(name))?.values()??[])];
  if(found.length===1){matched++;console.log("EXACT NAME CANDIDATE",JSON.stringify({sourceName:name,...found[0]}));}
  else if(found.length>1){ambiguous++;console.log("AMBIGUOUS NAME — MANUAL REVIEW",JSON.stringify({sourceName:name,candidates:found}));}
  else {missing++;console.log("NO EXACT NAME MATCH",JSON.stringify({sourceName:name}));}
}
console.log(JSON.stringify({tour:opts.tour,archiveRows:archive.length,observations:tourObservations.length,uniqueNameCandidates:matched,ambiguous,missing,warning:"Name matches are candidate IDs for manual verification only. Never auto-join model data by name; confirm the exact player ID from an authoritative profile before populating player_id."},null,2));
