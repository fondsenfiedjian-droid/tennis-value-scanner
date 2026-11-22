#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const TML=/^(\\d{4})_wta\\.csv$/i;
const SACK=/^wta_matches_(\\d{4})\\.csv$/i;
const norm=v=>String(v??"").normalize("NFKD").replace(/\\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
const surface=v=>{const s=norm(v);if(["hard","dur","durinterieur","hardcourt","indoorhard","outdoorhard"].includes(s))return "hard";if(["clay","terrebattue","terre","redclay"].includes(s))return "clay";if(["grass","gazon"].includes(s))return "grass";if(["carpet","moquette","moquetteinterieur","indoorcarpet"].includes(s))return "carpet";return null;};
const day=v=>{const s=String(v??"").trim();if(!/^\\d{8}$/.test(s))return null;const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6,8),t=Date.UTC(y,m-1,d),x=new Date(t);return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?t/86400000:null;};
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
const pair=r=>[norm(r.winner_name),norm(r.loser_name)].sort().join("|");
const score=v=>norm(v).replace(/(?:retired|ret|walkover|wo)/g,"");

export function auditWtaTmlSackmann(tmlFiles,sackFiles,{maxDateOffsetDays=14}={}){
 if(!tmlFiles.length||!sackFiles.length)throw new Error("WTA TennisMyLife and Sackmann files required");
 const index=new Map(),sackRowsByYear={};
 for(const f of sackFiles){const m=basename(f.filename).match(SACK);if(!m)throw new Error("Unexpected Sackmann file: "+f.filename);const y=m[1],rows=parseCsv(f.content);sackRowsByYear[y]=rows.length;
  for(const r of rows){const d=day(r.tourney_date),sf=surface(r.surface);if(d===null||!sf||!norm(r.winner_name)||!norm(r.loser_name))continue;const k=sf+"::"+pair(r);if(!index.has(k))index.set(k,[]);index.get(k).push({r,d});}
 }
 const totals={tmlRows:0,validRows:0,candidateRows:0,uniqueCandidateRows:0,scoreResolvedRows:0,tournamentResolvedRows:0,ambiguousRows:0,noCandidateRows:0,invalidDateRows:0,unknownSurfaceRows:0,playerIdsInMatches:0,playerIdsMapped:0,playerIdsUnmapped:0,crosswalkEdges:0,multipleSackmannIds:0,ageConflictObservations:0,iocMismatchObservations:0};
 const byYear={},ids=new Set(),cross=new Map(),offsets=[];
 for(const f of tmlFiles){const m=basename(f.filename).match(TML);if(!m)throw new Error("Unexpected TML WTA filename: "+f.filename);const y=m[1],rows=parseCsv(f.content),g=byYear[y]={rows:0,validRows:0,candidateRows:0,resolvedRows:0,ambiguousRows:0,noCandidateRows:0,invalidDateRows:0,unknownSurfaceRows:0};
  for(const r of rows){totals.tmlRows++;g.rows++;
   for(const side of ["winner","loser"]){const id=String(r[side+"_id"]??"").trim();if(id)ids.add(id);}
   const d=day(r.tourney_date);if(d===null){totals.invalidDateRows++;g.invalidDateRows++;continue;}
   const sf=surface(r.surface);if(!sf){totals.unknownSurfaceRows++;g.unknownSurfaceRows++;continue;}
   totals.validRows++;g.validRows++;
   const candidates=(index.get(sf+"::"+pair(r))||[]).filter(x=>Math.abs(d-x.d)<=maxDateOffsetDays);
   if(!candidates.length){totals.noCandidateRows++;g.noCandidateRows++;continue;}
   totals.candidateRows++;g.candidateRows++;
   let selected=null,kind="";
   if(candidates.length===1){selected=candidates[0];kind="uniqueCandidateRows";}
   else{
    const sc=score(r.score),byScore=sc?candidates.filter(x=>score(x.r.score)===sc):[];
    const ev=norm(r.tourney_name),byEvent=ev?candidates.filter(x=>norm(x.r.tourney_name)===ev):[];
    if(byScore.length===1&&byEvent.length===1&&byScore[0]!==byEvent[0]){}
    else if(byScore.length===1){selected=byScore[0];kind="scoreResolvedRows";}
    else if(byEvent.length===1){selected=byEvent[0];kind="tournamentResolvedRows";}
   }
   if(selected){totals[kind]++;g.resolvedRows++;offsets.push(d-selected.d);}
   else{totals.ambiguousRows++;g.ambiguousRows++;}
   // Aggregate-only source-ID crosswalk; no player-level mapping is exported.
   for(const side of ["winner","loser"]){const id=String(r[side+"_id"]??"").trim(),name=norm(r[side+"_name"]);if(!id||!name)continue;
    for(const c of candidates){const sr=c.r,ss=name===norm(sr.winner_name)?"winner":name===norm(sr.loser_name)?"loser":null;if(!ss)continue;
     const a=Number(r[side+"_age"]),b=Number(sr[ss+"_age"]);if(a>0&&b>0&&Math.abs(a-b)>0.6){totals.ageConflictObservations++;continue;}
     const ioc1=String(r[side+"_ioc"]??"").toUpperCase(),ioc2=String(sr[ss+"_ioc"]??"").toUpperCase();if(ioc1&&ioc2&&ioc1!==ioc2)totals.iocMismatchObservations++;
     const sid=String(sr[ss+"_id"]??"").trim();if(sid){if(!cross.has(id))cross.set(id,new Set());cross.get(id).add(sid);}
    }
   }
  }
 }
 totals.playerIdsInMatches=ids.size;totals.playerIdsMapped=cross.size;totals.playerIdsUnmapped=ids.size-cross.size;
 totals.crosswalkEdges=[...cross.values()].reduce((n,s)=>n+s.size,0);totals.multipleSackmannIds=[...cross.values()].filter(s=>s.size>1).length;
 totals.resolvedRows=totals.uniqueCandidateRows+totals.scoreResolvedRows+totals.tournamentResolvedRows;
 totals.resolvedMatchPct=pct(totals.resolvedRows,totals.tmlRows);totals.candidatePct=pct(totals.candidateRows,totals.validRows);totals.playerIdCoveragePct=pct(totals.playerIdsMapped,totals.playerIdsInMatches);
 const sorted=offsets.sort((a,b)=>a-b);totals.dateOffsetDays=sorted.length?{count:sorted.length,min:sorted[0],median:sorted[Math.floor((sorted.length-1)/2)],p90:sorted[Math.floor((sorted.length-1)*.9)],max:sorted.at(-1)}:null;
 for(const g of Object.values(byYear))g.resolvedMatchPct=pct(g.resolvedRows,g.rows);
 return {schemaVersion:1,purpose:"Aggregate-only WTA TennisMyLife to Sackmann linkage and source-ID crosswalk audit; no raw data or player-level links exported.",sources:{tmlFiles:tmlFiles.map(x=>basename(x.filename)).sort(),sackmannFiles:sackFiles.map(x=>basename(x.filename)).sort(),sackmannRowsByYear},matching:{playerNames:"exact normalized full-name pair, order-independent",surface:"normalized exact surface",date:"absolute tournament-week date difference <= "+maxDateOffsetDays+" days",resolution:"one candidate; otherwise unique exact score; otherwise unique exact tournament name; conflicts remain ambiguous",playerIds:"TML WTA IDs linked to Sackmann IDs by exact name in candidate rows, age guard >0.6 years; IDs are source-specific"},totals,byYear,warnings:["TennisMyLife WTA source states its WTA data reliability may not yet match its ATP data; this audit measures overlap, not accuracy.","TML WTA IDs are source-specific and must not be assumed equal to Sackmann IDs.","Player-ID crosswalk is aggregate-only and not exported.","TennisMyLife terms restrict use to personal, educational and non-commercial research; commercial model use requires prior written permission.","Sackmann data is CC BY-NC-SA 4.0; non-commercial use, attribution and share-alike conditions apply."]};
}
async function main(){const a=process.argv.slice(2);let td="",sd="",out="audit-output/aggregator1-wta-linkage.json",window=14;for(let i=0;i<a.length;i++){if(a[i]==="--tml-dir")td=a[++i];else if(a[i]==="--sackmann-dir")sd=a[++i];else if(a[i]==="--out")out=a[++i];else if(a[i]==="--date-window")window=Number(a[++i]);else throw new Error("Unknown argument "+a[i]);}if(!td||!sd||!Number.isInteger(window)||window<0||window>31)throw new Error("Invalid arguments");const tf=[];for(const n of (await readdir(td)).filter(n=>TML.test(n)).sort())tf.push({filename:n,content:await readFile(join(td,n),"utf8")});const sf=[];for(const n of (await readdir(sd)).filter(n=>SACK.test(n)).sort())sf.push({filename:n,content:await readFile(join(sd,n),"utf8")});const r=auditWtaTmlSackmann(tf,sf,{maxDateOffsetDays:window});await writeFile(out,JSON.stringify(r,null,2)+"\\n");console.log("TML WTA rows:",r.totals.tmlRows,"resolved:",r.totals.resolvedRows,"("+r.totals.resolvedMatchPct+"%)");console.log("WTA player IDs mapped:",r.totals.playerIdsMapped,"/",r.totals.playerIdsInMatches);console.log("Report:",out);}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
