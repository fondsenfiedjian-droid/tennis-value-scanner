#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const RESULT_FILE=/^(atp|wta)_matches_(?:(futures|qual_chall|qual_itf)_)?(\d{4})\.csv$/i;
const META_FILE=/^charting-([mw])-matches\.csv$/i;
const normalize=value=>String(value??"").normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"");
const normalizeRound=value=>{
  const raw=String(value??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  const aliases={FINAL:"F",SEMIFINAL:"SF",SEMIFINALS:"SF",QUARTERFINAL:"QF",QUARTERFINALS:"QF",ROUND1:"R128",ROUND2:"R64",ROUND3:"R32",ROUND4:"R16"};
  return aliases[raw]||raw;
};
const eventAliases={
  frenchopen:"frenchopen",rolandgarros:"frenchopen",
  australianopen:"australianopen",usopen:"usopen",wimbledon:"wimbledon",
  rome:"rome",romemasters:"rome",madrid:"madrid",madridmasters:"madrid",
  paris:"paris",parismasters:"paris",montecarlo:"montecarlo",montecarlomasters:"montecarlo",
  indianwells:"indianwells",bnpparibasopen:"indianwells",miami:"miami",miamiopen:"miami"
};
const eventKey=value=>eventAliases[normalize(value)]||normalize(value);
const pairKey=(a,b)=>[normalize(a),normalize(b)].sort().join("|");
const validDate=value=>{
  const v=String(value??"");
  if(!/^\d{8}$/.test(v))return false;
  const y=+v.slice(0,4),m=+v.slice(4,6),d=+v.slice(6,8);
  if(y<1900||m<1||m>12||d<1||d>31)return false;
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
};
const dayNumber=value=>validDate(value)?Date.UTC(+value.slice(0,4),+value.slice(4,6)-1,+value.slice(6,8))/86400000:null;

function parseMcpCsv(source){
  source=source.replace(/^\uFEFF/,"");
  const rows=[];let row=[],field="",quoted=false;
  const pushField=()=>{row.push(field);field="";};
  const pushRow=()=>{pushField();if(row.some(value=>value!==""))rows.push(row);row=[];};
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(quoted){
      if(ch==='"'&&source[i+1]==='"'){field+='"';i++;}
      else if(ch==='"'&&[",","\n","\r",undefined].includes(source[i+1]))quoted=false;
      else field+=ch;
      continue;
    }
    if(ch==='"'&&field.length===0)quoted=true;
    else if(ch===",")pushField();
    else if(ch==="\n")pushRow();
    else if(ch==="\r"&&source[i+1]==="\n"){}
    else if(ch==="\r")field+=ch;
    else field+=ch;
  }
  if(field!==""||row.length)pushRow();
  if(!rows.length)return[];
  const headers=rows.shift().map(value=>value.trim());
  const seen=new Map();
  const unique=headers.map(header=>{const n=(seen.get(header)||0)+1;seen.set(header,n);return n===1?header:header+"_"+n;});
  return rows.map(values=>Object.fromEntries(unique.map((header,index)=>[header,values[index]??""])));
}

function createContext(metadataFiles){
  const metadata=new Map();
  for(const file of metadataFiles){
    const m=basename(file.filename).match(META_FILE);
    if(!m)throw new Error("Unexpected metadata filename: "+basename(file.filename));
    metadata.set(m[1].toLowerCase(),parseMcpCsv(file.content));
  }
  if(!metadata.has("m")||!metadata.has("w"))throw new Error("ATP/WTA MCP metadata files are required");
  return {metadata,yearPairIndex:new Map()};
}
function addResultsFile(context,file){
  const name=basename(file.filename),m=name.match(RESULT_FILE);
  if(!m)throw new Error("Unexpected results filename: "+name);
  const tour=m[1].toUpperCase(),sourceType=m[2]||"main",fileYear=m[3];
  const rows=parseCsv(file.content);
  for(const row of rows){
    const year=String(row.tourney_date??"").slice(0,4);
    if(year!==fileYear)continue;
    const pair=pairKey(row.winner_name,row.loser_name);
    if(pair==="|")continue;
    const event=eventKey(row.tourney_name),round=normalizeRound(row.round);
    const identity=[row.tourney_id,row.match_num,pair,round,event].join(":");
    const key=[tour,year,pair].join(":");
    if(!context.yearPairIndex.has(key))context.yearPairIndex.set(key,new Map());
    const group=context.yearPairIndex.get(key);
    if(!group.has(identity)){
      group.set(identity,{event,round,date:String(row.tourney_date??""),sourceTypes:new Set([sourceType])});
    }else group.get(identity).sourceTypes.add(sourceType);
  }
}
function finishAudit(context){
  const byTour={};
  for(const [code,rows] of context.metadata){
    const tour=code==="m"?"ATP":"WTA";
    const counters={metadataRows:rows.length,uniqueMatchIds:0,linkedUnique:0,linkedFullName:0,ambiguous:0,roundConflicts:0,eventMismatches:0,noPlayerPairInYear:0,missingNames:0,invalidDates:0,missingDates:0,negativeDateOffsets:0,dateOffsetsOver21Days:0,linkedMainTour:0,linkedChallengerQualifying:0,linkedFutures:0,linkedITFQualifying:0};
    const seen=new Set(),offsets=[];
    for(const row of rows){
      const id=String(row.match_id??"").trim();
      if(!id||seen.has(id))continue;
      seen.add(id);counters.uniqueMatchIds++;
      const p1=String(row["Player 1"]??"").trim(),p2=String(row["Player 2"]??"").trim();
      if(!p1||!p2){counters.missingNames++;continue;}
      const date=String(row.Date??"").trim();
      if(!date)counters.missingDates++;else if(!validDate(date))counters.invalidDates++;
      const year=/^\d{4}/.test(date)?date.slice(0,4):id.slice(0,4);
      const pair=pairKey(p1,p2),event=eventKey(row.Tournament),round=normalizeRound(row.Round);
      const candidates=[...(context.yearPairIndex.get([tour,year,pair].join(":"))?.values()||[])];
      const eventCandidates=candidates.filter(candidate=>candidate.event===event);
      const exactCandidates=eventCandidates.filter(candidate=>candidate.round===round);
      if(exactCandidates.length===1){
        const candidate=exactCandidates[0];
        counters.linkedUnique++;counters.linkedFullName++;
        if(candidate.sourceTypes.has("main"))counters.linkedMainTour++;
        else if(candidate.sourceTypes.has("qual_chall"))counters.linkedChallengerQualifying++;
        else if(candidate.sourceTypes.has("futures"))counters.linkedFutures++;
        else if(candidate.sourceTypes.has("qual_itf"))counters.linkedITFQualifying++;
        const a=dayNumber(date),b=dayNumber(candidate.date);
        if(a!==null&&b!==null){
          const offset=a-b;offsets.push(offset);
          if(offset<0)counters.negativeDateOffsets++;
          if(offset>21)counters.dateOffsetsOver21Days++;
        }
      }else if(exactCandidates.length>1)counters.ambiguous++;
      else if(eventCandidates.length)counters.roundConflicts++;
      else if(candidates.length)counters.eventMismatches++;
      else counters.noPlayerPairInYear++;
    }
    offsets.sort((a,b)=>a-b);
    counters.dateOffsetDays=offsets.length?{count:offsets.length,min:offsets[0],median:offsets[Math.floor((offsets.length-1)/2)],p90:offsets[Math.floor((offsets.length-1)*0.9)],max:offsets.at(-1)}:null;
    counters.dateOffsetAnomalyLinks=counters.negativeDateOffsets+counters.dateOffsetsOver21Days;
    counters.dateOffsetConsistentLinks=offsets.length-counters.dateOffsetAnomalyLinks;
    counters.linkagePct=counters.uniqueMatchIds?Number((100*counters.linkedUnique/counters.uniqueMatchIds).toFixed(2)):null;
    byTour[tour]=counters;
  }
  const totals=Object.values(byTour).reduce((sum,x)=>{
    for(const k of ["metadataRows","uniqueMatchIds","linkedUnique","linkedFullName","ambiguous","roundConflicts","eventMismatches","noPlayerPairInYear","missingNames","invalidDates","missingDates","negativeDateOffsets","dateOffsetsOver21Days","linkedMainTour","linkedChallengerQualifying","linkedFutures","linkedITFQualifying","dateOffsetAnomalyLinks","dateOffsetConsistentLinks"])sum[k]=(sum[k]||0)+x[k];
    return sum;
  },{});
  totals.linkagePct=totals.uniqueMatchIds?Number((100*totals.linkedUnique/totals.uniqueMatchIds).toFixed(2)):null;
  return {schemaVersion:2,source:"Jeff Sackmann Match Charting Project metadata linked to Jeff Sackmann ATP/WTA main-tour and lower-tier results",mcpCommit:"1813a1309b7ed7ebf1c7e884b32bf675d00e4edf",resultsCommit:"83733587353df8a41f2fd4f516147d5aa83f5a8d",license:"CC BY-NC-SA 4.0; attribution required; non-commercial only; share-alike",totals,byTour,warnings:["Only exact normalized full-name pairs, explicit event aliases, year and round are accepted; no initials or fuzzy matches.","Only unique candidate matches are linked. Unmatched rows may be events absent from the archive or contain source naming/date inconsistencies.","Sackmann tourney_date is usually the event-week date, not the exact match date. MCP Date is the charted match date; date offsets are diagnostics only.","Only aggregate counts are written. No player names, match IDs or player-level linkage records are retained.","Metadata date/surface/hand quality anomalies remain quarantined; this audit does not approve those fields as model features."]};
}

export function auditMcpMatchLinkage(files){
  if(!Array.isArray(files)||!files.length)throw new Error("No MCP linkage files supplied");
  const metadataFiles=files.filter(file=>META_FILE.test(basename(file.filename)));
  const resultFiles=files.filter(file=>RESULT_FILE.test(basename(file.filename)));
  if(!resultFiles.length)throw new Error("Main-tour or lower-tier results are required");
  const context=createContext(metadataFiles);
  for(const file of resultFiles)addResultsFile(context,file);
  return finishAudit(context);
}

export async function auditMcpMatchLinkageDirectory(dir){
  const names=(await readdir(dir)).sort();
  const metadataFiles=[];
  for(const name of names)if(META_FILE.test(name))metadataFiles.push({filename:name,content:await readFile(join(dir,name),"utf8")});
  const context=createContext(metadataFiles);
  for(const name of names)if(RESULT_FILE.test(name)){
    const content=await readFile(join(dir,name),"utf8");
    addResultsFile(context,{filename:name,content});
  }
  return finishAudit(context);
}

async function main(){
  const args=process.argv.slice(2);let dir="",out="mcp-match-linkage-audit.json";
  for(let i=0;i<args.length;i++){if(args[i]==="--input-dir")dir=args[++i];else if(args[i]==="--out")out=args[++i];else throw new Error("Usage: node scripts/mcp-match-linkage-audit.mjs --input-dir DIR --out report.json");}
  if(!dir)throw new Error("Missing --input-dir");
  const report=await auditMcpMatchLinkageDirectory(dir);
  await writeFile(out,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report.totals));
  console.log("Wrote aggregate-only MCP linkage audit: "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
