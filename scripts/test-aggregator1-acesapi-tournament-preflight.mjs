import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAcesApiTournamentPreflight } from "./aggregator1-acesapi-tournament-preflight.mjs";
const root=await mkdtemp(join(tmpdir(),"acesapi-tournaments-"));let calls=0;
const fakeFetch=async(url,options)=>{calls++;const body=JSON.parse(options.body);
 assert.equal(url,"https://mcp.acesapi.com/v1/list_tournaments");assert.equal(body.season,2025);assert.equal(body.limit,100);
 assert.equal(body.league,calls===1?"tennis":"wta");
 return {ok:true,status:200,json:async()=>({data:{tournaments:[{tournament_id:"1-2025",name:"Sample Open",start_date:"2025-01-01",end_date:"2025-01-07",city:"Test",country:"France",major:false,surface:"hard",status:"final",main_draw_matches:28}],count:1,next_offset:null}})};
};
try{const r=await runAcesApiTournamentPreflight({apiKey:"test-only",outDir:root,fetchImpl:fakeFetch});
 assert.equal(calls,2);assert.equal(r.expectedCredits,2);assert.equal(r.results[0].returnedRows,1);
 assert.equal(r.results[0].completeCoreRows,1);assert.equal(r.results[0].surfaceCounts.hard,1);
 const saved=JSON.parse(await readFile(join(root,"acesapi-tournament-preflight-report.json"),"utf8"));assert.equal(saved.requests,2);
 console.log("AcesAPI tournament preflight fixture: PASS");
}finally{await rm(root,{recursive:true,force:true});}
