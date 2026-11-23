import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAcesApiPreflight } from "./aggregator1-acesapi-preflight.mjs";

const root=await mkdtemp(join(tmpdir(),"acesapi-preflight-"));
let calls=0;
const fakeFetch=async(url,options)=>{
  calls++;
  const body=JSON.parse(options.body);
  assert.equal(url,"https://mcp.acesapi.com/v1/get_matches");
  assert.equal(body.season,2025);
  assert.equal(body.limit,100);
  return {ok:true,status:200,json:async()=>({data:{matches:[{
    match_id:String(calls),match_date:"2025-01-05",player1_id:"1",player1:"Player One",
    player2_id:"2",player2:"Player Two",surface:"hard",draw:"main",score:"6-4 6-3",sets:[]
  }],count:1,next_offset:1}})};
};
try{
  const report=await runAcesApiPreflight({apiKey:"test-only",outDir:root,fetchImpl:fakeFetch});
  assert.equal(calls,2);
  assert.equal(report.expectedCredits,4);
  assert.equal(report.results.length,2);
  assert.equal(report.results[0].returnedRows,1);
  assert.equal(report.results[1].completeCoreRows,1);
  const saved=JSON.parse(await readFile(join(root,"acesapi-preflight-report.json"),"utf8"));
  assert.equal(saved.requests,2);
  console.log("AcesAPI preflight fixture: PASS");
}finally{await rm(root,{recursive:true,force:true});}
