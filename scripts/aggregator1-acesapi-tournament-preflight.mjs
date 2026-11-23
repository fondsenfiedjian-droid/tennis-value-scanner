#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const BASE="https://mcp.acesapi.com/v1";
const SEASON=2025, LIMIT=100, EXPECTED_CREDITS=2;
export async function runAcesApiTournamentPreflight({apiKey,outDir,fetchImpl=fetch}={}){
  if(!apiKey)throw new Error("ACESAPI_API_KEY is required");
  if(!outDir)throw new Error("outDir is required");
  const root=resolve(outDir); await mkdir(root,{recursive:true});
  const results=[];
  for(const spec of [{tour:"atp",league:"tennis"},{tour:"wta",league:"wta"}]){
    const response=await fetchImpl(BASE+"/list_tournaments",{
      method:"POST",headers:{"content-type":"application/json","x-api-key":apiKey},
      body:JSON.stringify({season:SEASON,limit:LIMIT,league:spec.league}),
      signal:AbortSignal.timeout(30000)
    });
    if(!response.ok)throw new Error("AcesAPI "+spec.tour+" tournament catalogue failed: HTTP "+response.status+" "+(await response.text()).slice(0,300));
    const json=await response.json(),data=json?.data??json;
    if(!Array.isArray(data?.tournaments))throw new Error("AcesAPI "+spec.tour+" response has no tournaments array");
    const tournaments=data.tournaments, surfaces={},majorCounts={major:0,nonMajor:0,unknown:0},statusCounts={};
    let minStart=null,maxEnd=null,completeRows=0;
    const coreFields=["tournament_id","name","start_date","end_date","surface","city","country"];
    const catalogueFields=[...coreFields,"indoor","major","status","main_draw_matches"];
    const missingCoreFields=Object.fromEntries(coreFields.map(k=>[k,0]));
    const missingCatalogueFields=Object.fromEntries(catalogueFields.map(k=>[k,0]));
    for(const t of tournaments){
      const s=String(t.surface??"(missing)").toLowerCase();surfaces[s]=(surfaces[s]||0)+1;
      const mk=t.major===true?"major":t.major===false?"nonMajor":"unknown";majorCounts[mk]++;
      const st=String(t.status??"(missing)").toLowerCase();statusCounts[st]=(statusCounts[st]||0)+1;
      for(const key of catalogueFields)if(t[key]===null||t[key]===undefined||t[key]===""){missingCatalogueFields[key]++;if(coreFields.includes(key))missingCoreFields[key]++;}
      if(coreFields.every(key=>t[key]!==null&&t[key]!==undefined&&t[key]!==""))completeRows++;
      if(t.start_date&&(!minStart||t.start_date<minStart))minStart=t.start_date;
      if(t.end_date&&(!maxEnd||t.end_date>maxEnd))maxEnd=t.end_date;
    }
    const filename="acesapi-"+spec.tour+"-tournaments-"+SEASON+".json";
    await writeFile(join(root,filename),JSON.stringify(json)+"\n");
    results.push({tour:spec.tour,season:SEASON,requestedLimit:LIMIT,returnedRows:tournaments.length,nextOffset:data.next_offset??null,minStartDate:minStart,maxEndDate:maxEnd,surfaceCounts:surfaces,majorCounts,statusCounts,completeCoreRows:completeRows,missingCoreFieldCounts:missingCoreFields,missingCatalogueFieldCounts:missingCatalogueFields,pagination:{hasMorePages:data.next_offset!==null&&data.next_offset!==undefined,pageAtLimit:tournaments.length>=LIMIT,likelyIncomplete:(data.next_offset!==null&&data.next_offset!==undefined)||tournaments.length>=LIMIT},rawSampleFilename:filename});
  }
  const report={schemaVersion:1,source:"AcesAPI list_tournaments",purpose:"Bounded two-request tournament-catalogue preflight; not a full-season completeness claim.",season:SEASON,expectedCredits:EXPECTED_CREDITS,requests:2,perRequestCreditCost:1,results,rightsReminder:"Internal research only within current provider terms; do not redistribute raw source data."};
  await writeFile(join(root,"acesapi-tournament-preflight-report.json"),JSON.stringify(report,null,2)+"\n");
  return report;
}
async function main(){
  if(!process.argv.includes("--confirm-live-calls"))throw new Error("Refusing network access: pass --confirm-live-calls to authorize exactly two requests (maximum expected cost: 2 credits)");
  const report=await runAcesApiTournamentPreflight({apiKey:process.env.ACESAPI_API_KEY,outDir:process.env.ACESAPI_OUT_DIR||"./research-data/aggregator1/acesapi"});
  for(const r of report.results)console.log(JSON.stringify(r));
  console.log("Tournament catalogue preflight complete. Maximum expected spend: 2 credits. Publish aggregate report only.");
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
