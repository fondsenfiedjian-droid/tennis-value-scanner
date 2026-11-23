#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const BASE="https://mcp.acesapi.com/v1";
const SEASON=2025;
const LIMIT=100;
const EXPECTED_CREDITS=4;

export async function runAcesApiPreflight({apiKey,outDir,fetchImpl=fetch}={}){
  if(!apiKey)throw new Error("ACESAPI_API_KEY is required");
  if(!outDir)throw new Error("outDir is required");
  const root=resolve(outDir);
  await mkdir(root,{recursive:true});
  const summaries=[];
  for(const spec of [{tour:"atp",league:"tennis"},{tour:"wta",league:"wta"}]){
    const response=await fetchImpl(BASE+"/get_matches",{
      method:"POST",
      headers:{"content-type":"application/json","x-api-key":apiKey},
      body:JSON.stringify({season:SEASON,limit:LIMIT,league:spec.league}),
      signal:AbortSignal.timeout(30000)
    });
    if(!response.ok){
      const body=(await response.text()).slice(0,500);
      throw new Error("AcesAPI "+spec.tour+" sample failed: HTTP "+response.status+" "+body);
    }
    const json=await response.json();
    const data=json?.data??json;
    if(!Array.isArray(data?.matches))throw new Error("AcesAPI "+spec.tour+" response has no data.matches array");
    const matches=data.matches;
    const drawCounts={},surfaceCounts={},fieldCounts={};
    let minDate=null,maxDate=null,completeCoreRows=0;
    for(const m of matches){
      const draw=String(m.draw??"(missing)").toLowerCase();
      const surface=String(m.surface??"(missing)").toLowerCase();
      drawCounts[draw]=(drawCounts[draw]||0)+1;
      surfaceCounts[surface]=(surfaceCounts[surface]||0)+1;
      for(const field of ["match_id","tournament_id","match_date","player1_id","player1","player2_id","player2","surface","draw","score","sets"]){
        if(m[field]!==undefined&&m[field]!==null)fieldCounts[field]=(fieldCounts[field]||0)+1;
      }
      if(m.match_date&&m.player1&&m.player2&&m.surface&&m.draw)completeCoreRows++;
      if(m.match_date){if(!minDate||m.match_date<minDate)minDate=m.match_date;if(!maxDate||m.match_date>maxDate)maxDate=m.match_date;}
    }
    const filename="acesapi-"+spec.tour+"-"+SEASON+"-sample.json";
    await writeFile(join(root,filename),JSON.stringify(json)+"\n");
    summaries.push({tour:spec.tour,season:SEASON,requestedLimit:LIMIT,returnedRows:matches.length,nextOffset:data.next_offset??null,minMatchDate:minDate,maxMatchDate:maxDate,drawCounts,surfaceCounts,fieldCounts,completeCoreRows,rawSampleFilename:filename});
  }
  const report={schemaVersion:1,source:"AcesAPI",purpose:"Bounded two-request schema and coverage preflight; not a full-season coverage claim.",season:SEASON,expectedCredits:EXPECTED_CREDITS,requests:2,perRequestCreditCost:2,results:summaries,rightsReminder:"Internal research/training only within current AcesAPI terms; no raw dataset redistribution. Confirm current terms before production use."};
  await writeFile(join(root,"acesapi-preflight-report.json"),JSON.stringify(report,null,2)+"\n");
  return report;
}

async function main(){
  if(!process.argv.includes("--confirm-live-calls"))throw new Error("Refusing network access: pass --confirm-live-calls to authorize exactly two requests (maximum expected cost: 4 credits)");
  const apiKey=process.env.ACESAPI_API_KEY;
  const outDir=process.env.ACESAPI_OUT_DIR||"./research-data/aggregator1/acesapi";
  const report=await runAcesApiPreflight({apiKey,outDir});
  for(const r of report.results)console.log(JSON.stringify({tour:r.tour,season:r.season,returnedRows:r.returnedRows,nextOffset:r.nextOffset,minMatchDate:r.minMatchDate,maxMatchDate:r.maxMatchDate,drawCounts:r.drawCounts,surfaceCounts:r.surfaceCounts,completeCoreRows:r.completeCoreRows}));
  console.log("AcesAPI preflight complete. Maximum expected spend: 4 credits. Raw samples remain in the local output directory; publish only the aggregate report.");
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
