#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const YEARS=[2021,2022,2023,2024,2025,2026];
const args=process.argv.slice(2);
let outDir="./research-data/aggregator1",years=YEARS,includeWta=true,includeQuali=true;
for(let i=0;i<args.length;i++){
  if(args[i]==="--out")outDir=args[++i];
  else if(args[i]==="--years")years=args[++i].split(",").map(Number);
  else if(args[i]==="--no-wta")includeWta=false;
  else if(args[i]==="--no-quali")includeQuali=false;
  else throw new Error("Usage: node scripts/download-aggregator1-free-data.mjs [--out DIR] [--years 2021,2022,...,2026] [--no-wta] [--no-quali]");
}
if(!years.length||years.some(y=>!Number.isInteger(y)||y<2021||y>2026))throw new Error("Years must be between 2021 and 2026");
const root=resolve(outDir);
const manifest={createdAt:new Date().toISOString(),years,files:[],errors:[]};
const safePath=value=>{
  const normalized=String(value).replace(/\\/g,"/");
  if(normalized.startsWith("/")||normalized.split("/").some(p=>p===".."||p==="."))throw new Error("Unsafe source filename: "+value);
  return normalized;
};
async function save(url,rel,source){
  const path=safePath(rel),dest=join(root,path);
  await mkdir(dirname(dest),{recursive:true});
  const response=await fetch(url,{redirect:"follow",headers:{"user-agent":"TennisValueScanner-Aggregator1-Research/1.0"}});
  if(!response.ok)throw new Error(source+" "+path+": HTTP "+response.status);
  const type=response.headers.get("content-type")||"";
  if(type.includes("text/html")||type.includes("application/json"))throw new Error(source+" "+path+": unexpected content-type "+type);
  const hash=createHash("sha256");let bytes=0;
  const { Transform }=await import("node:stream");
  const meter=new Transform({transform(chunk,enc,cb){bytes+=chunk.length;hash.update(chunk);cb(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(dest));
  if(bytes<100)throw new Error(source+" "+path+": response too small ("+bytes+" bytes)");
  manifest.files.push({source,path,url,bytes,sha256:hash.digest("hex"),contentType:type});
  console.log("OK "+source+" "+path+" ("+bytes+" bytes)");
}
for(const year of years){
  const name="valuebetennis-matchs-"+year+".csv";
  try{await save("https://www.valuebetennis.com/datasets/"+name,"valuebetennis/"+name,"Valuebetennis");}
  catch(e){manifest.errors.push(String(e));console.error("FAILED "+String(e));}
}
let index;
try{
  const response=await fetch("https://stats.tennismylife.org/api/data-files",{headers:{"user-agent":"TennisValueScanner-Aggregator1-Research/1.0"}});
  if(!response.ok)throw new Error("TennisMyLife index HTTP "+response.status);
  index=await response.json();
  if(!Array.isArray(index.files))throw new Error("TennisMyLife index has no files array");
}catch(e){manifest.errors.push(String(e));console.error("TennisMyLife index failed: "+String(e));}
if(index?.files){
  const wanted=new Set(["ATP_Database.csv"]);
  for(const year of years){
    wanted.add(year+".csv");
    wanted.add(year+"_challenger.csv");
    if(includeWta)wanted.add(year+"_wta.csv");
    if(includeQuali)wanted.add("atp_quali/"+year+"_atp_quali.csv");
  }
  const selected=index.files.filter(item=>{
    const n=String(item.name||item.path||"").replace(/^\//,"");
    return wanted.has(n)||wanted.has(basename(n));
  });
  const found=new Set(selected.map(item=>String(item.name||item.path||"").replace(/^\//,"")));
  for(const target of wanted)if(![...found].some(n=>n===target||basename(n)===basename(target)))manifest.errors.push("TennisMyLife index missing expected file: "+target);
  for(const item of selected){
    const url=String(item.url||"");
    const name=safePath(item.name||item.path||"");
    if(!/^https:\/\/\//i.test(url)){manifest.errors.push("TennisMyLife file has invalid URL: "+name);continue;}
    try{await save(url,"tennismylife/"+name,"TennisMyLife");}
    catch(e){manifest.errors.push(String(e));console.error("FAILED "+String(e));}
  }
}
manifest.files.sort((a,b)=>a.source.localeCompare(b.source)||a.path.localeCompare(b.path));
await mkdir(root,{recursive:true});
await writeFile(join(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("\\nSaved "+manifest.files.length+" files to "+root);
console.log("Manifest: "+join(root,"manifest.json"));
if(manifest.errors.length){console.error(manifest.errors.length+" download/index warnings; inspect manifest.json");process.exitCode=1;}
