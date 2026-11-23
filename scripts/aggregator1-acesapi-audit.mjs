#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const VBT=/^valuebetennis-matchs-(\\d{4})\\.csv$/i;
const ACES=/^acesapi-(atp|wta)-(\\d{4})(?:-.*)?\\.json$/i;
const norm=v=>String(v??"").normalize("NFKD").replace(/\\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
const surf=v=>{const s=norm(v);if(["hard","dur","indoorhard","outdoorhard"].includes(s))return "hard";if(["clay","terrebattue","terre"].includes(s))return "clay";if(["grass","gazon"].includes(s))return "grass";if(["carpet","moquette"].includes(s))return "carpet";return null;};
const day=v=>{const s=String(v??"").trim();const m=s.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);if(!m)return null;const t=Date.UTC(+m[1],+m[2]-1,+m[3]);const d=new Date(t);return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?t/86400000:null;};
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
function extractMatches(obj){
  const root=obj?.data??obj;
  if(Array.isArray(root))return root;
  if(Array.isArray(root?.matches))return root.matches;
  if(Array.isArray(root?.rounds))return root.rounds.flatMap(r=>(r.matches||[]).map(m=>({...m,round_name:r.round})));
  throw new Error("Unsupported AcesAPI JSON shape: expected data.matches or data.rounds[].matches");
}
export function auditAcesApi(valuebetFiles,acesFiles,{dateWindowDays=1}={}){
  if(!valuebetFiles.length||!acesFiles.length)throw new Error("Valuebetennis CSVs and AcesAPI JSON files are required");
  if(!Number.isInteger(dateWindowDays)||dateWindowDays<0||dateWindowDays>3)throw new Error("dateWindowDays must be 0..3");
  const index=new Map(),sourceByTourYear={},sourceByTourYearDraw={},sourceDuplicates={};
  for(const file of acesFiles){
    const fm=basename(file.filename).match(ACES);
    if(!fm)throw new Error("Unexpected AcesAPI filename: "+basename(file.filename));
    const tour=fm[1].toUpperCase(),year=fm[2];
    const matches=extractMatches(JSON.parse(file.content));
    for(const m of matches){
      const a=norm(m.player1),b=norm(m.player2),date=day(m.match_date??m.starts_at),surface=surf(m.surface);
      if(!a||!b||a===b||date===null||!surface)continue;
      const draw=String(m.draw??"unknown").toLowerCase();
      const id=String(m.match_id??"").trim();
      const fingerprint=id?tour+":"+id:[tour,year,date,[a,b].sort().join("|"),surface,norm(m.tournament)].join("::");
      if(index.has(fingerprint)){sourceDuplicates[tour+"::"+year]=(sourceDuplicates[tour+"::"+year]||0)+1;continue;}
      const record={tour,year,date,surface,draw,playerA:a,playerB:b};
      index.set(fingerprint,record);
      const pair=[tour,[a,b].sort().join("|")].join("::");
      if(!sourceByTourYear[tour+"::"+year])sourceByTourYear[tour+"::"+year]=0;
      sourceByTourYear[tour+"::"+year]++;
      const dk=tour+"::"+year+"::"+draw;
      sourceByTourYearDraw[dk]=(sourceByTourYearDraw[dk]||0)+1;
      if(!pair)throw new Error("Internal pair-key error");
    }
  }
  const byTourYear={},byTourYearCategory={};
  let totalRows=0;
  for(const file of valuebetFiles){
    const fm=basename(file.filename).match(VBT);
    if(!fm)throw new Error("Unexpected Valuebetennis filename: "+basename(file.filename));
    for(const row of parseCsv(file.content,{delimiter:";"})){
      totalRows++;
      const tour=String(row.genre??"").trim().toUpperCase(),year=fm[1],category=String(row.categorie??"").trim()||"(empty)";
      const key=tour+"::"+year,catKey=key+"::"+category;
      const init=()=>({rows:0,validRows:0,candidateRows:0,linkedUnique:0,ambiguous:0,noCandidate:0,pairAbsent:0,surfaceAbsent:0,dateWindowMiss:0,invalidPlayerPair:0,invalidDate:0,unknownSurface:0});
      const g=byTourYear[key]??(byTourYear[key]=init()),c=byTourYearCategory[catKey]??(byTourYearCategory[catKey]=init());
      for(const bucket of [g,c])bucket.rows++;
      const d=day(row.date),a=norm(row.joueur1),b=norm(row.joueur2),sf=surf(row.surface);
      if(d===null){for(const x of [g,c])x.invalidDate++;continue;}
      if(!a||!b||a===b){for(const x of [g,c]){x.invalidPlayerPair++;x.noCandidate++;}continue;}
      if(!["ATP","WTA"].includes(tour)){continue;}
      for(const x of [g,c])x.validRows++;
      if(!sf){for(const x of [g,c]){x.unknownSurface++;x.noCandidate++;}continue;}
      const pair=[tour,[a,b].sort().join("|")].join("::");
      const candidates=[...index.values()].filter(x=>x.tour===tour&&[x.playerA,x.playerB].sort().join("|")===[a,b].sort().join("|"));
      const sameSurface=candidates.filter(x=>x.surface===sf);
      const inWindow=sameSurface.filter(x=>Math.abs(x.date-d)<=dateWindowDays);
      if(inWindow.length)for(const x of [g,c])x.candidateRows++;
      if(inWindow.length===1)for(const x of [g,c])x.linkedUnique++;
      else if(inWindow.length>1)for(const x of [g,c])x.ambiguous++;
      else{
        for(const x of [g,c]){x.noCandidate++;if(!candidates.length)x.pairAbsent++;else if(!sameSurface.length)x.surfaceAbsent++;else x.dateWindowMiss++;}
      }
      if(!pair)throw new Error("Internal pair-key error");
    }
  }
  const finish=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{...v,linkagePct:pct(v.linkedUnique,v.validRows),candidatePct:pct(v.candidateRows,v.validRows)}]));
  return {schemaVersion:1,purpose:"Aggregate-only AcesAPI coverage audit; no match-level links or raw source records are written.",matching:{players:"exact normalized full-name pair, order-independent",surface:"exact normalized surface",date:"match_date/starts_at date within +/- "+dateWindowDays+" day(s)",acceptance:"exactly one candidate; multiple candidates remain ambiguous",tournamentNames:"not used to force a match"},valuebetRows:totalRows,acesApiUniqueRows:index.size,acesApiRowsByTourYear:sourceByTourYear,acesApiRowsByTourYearDraw:sourceByTourYearDraw,acesApiDuplicateRows:sourceDuplicates,byTourYear:finish(byTourYear),byTourYearCategory:finish(byTourYearCategory),warnings:["AcesAPI documents main draws from 2007 and qualifying from 2022; do not assume ITF/Futures coverage without verifying actual records.","This audit does not infer player aliases or merge fuzzy names.","AcesAPI terms permit internal research/backtesting/model training while the account is open; source-derived public redistribution is restricted.","AcesAPI states it is independent and does not grant ATP/WTA league rights."]};
}
async function main(){
  const args=process.argv.slice(2);let vdir="",adir="",out="aggregator1-acesapi-audit.json",window=1;
  for(let i=0;i<args.length;i++){if(args[i]==="--valuebet-dir")vdir=args[++i];else if(args[i]==="--aces-dir")adir=args[++i];else if(args[i]==="--out")out=args[++i];else if(args[i]==="--date-window")window=Number(args[++i]);else throw new Error("Usage: node scripts/aggregator1-acesapi-audit.mjs --valuebet-dir DIR --aces-dir DIR [--date-window 1] [--out report.json]");}
  if(!vdir||!adir)throw new Error("Both input directories are required");
  const vn=(await readdir(vdir)).filter(n=>VBT.test(n)).sort(),an=(await readdir(adir)).filter(n=>ACES.test(n)).sort();
  const vf=[];for(const n of vn)vf.push({filename:n,content:await readFile(join(vdir,n),"utf8")});
  const af=[];for(const n of an)af.push({filename:n,content:await readFile(join(adir,n),"utf8")});
  const report=auditAcesApi(vf,af,{dateWindowDays:window});
  await writeFile(out,JSON.stringify(report,null,2)+"\\n");
  console.log("Valuebetennis rows: "+report.valuebetRows);
  console.log("AcesAPI unique valid rows: "+report.acesApiUniqueRows);
  console.log("Aggregate report written to "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
