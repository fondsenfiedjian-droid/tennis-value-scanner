import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runObservationImport } from "../scripts/import-tournament-intent-observations.mjs";

const valid={
  tour:"wta",playerId:"12345",playerName:"Example Player",eventId:"event-1",tournament:"Example Open",
  targetMatchId:"match-1",targetMatchStart:"2026-11-25T12:00:00Z",
  preEventRank:95,rankingSnapshotDate:"2026-11-16T00:00:00Z",
  searchStartedAt:"2026-11-24T08:00:00Z",searchCompletedAt:"2026-11-24T08:12:00Z",
  searchDurationMinutes:12,searchOutcome:"no_evidence_found",evidenceIds:[],reviewedBy:"reviewer",
  sourceSearch:{official_tour_news:"searched",official_tournament_media:"searched",player_team_statement:"searched",reputable_media:"searched",official_schedule:"searched"}
};

test("observation importer saves normalized no-evidence coverage records and rejection reasons",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"intent-observations-"));
  try{
    const input=join(dir,"input.json"),out=join(dir,"registry.json");
    await writeFile(input,JSON.stringify([valid,{...valid,preEventRank:151}]));
    const result=await runObservationImport(["--input",input,"--out",out]);
    assert.equal(result.lastImport.acceptedCount,1);
    assert.equal(result.lastImport.rejectedCount,1);
    const saved=JSON.parse(await readFile(out,"utf8"));
    assert.equal(saved.records[0].searchOutcome,"no_evidence_found");
    assert.equal(saved.summary.noEvidenceFound,1);
    assert.ok(saved.rejected[0].errors.includes("rank_outside_top_150"));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("observation importer merges and de-duplicates exact player-match observations",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"intent-observations-merge-"));
  try{
    const input=join(dir,"input.jsonl"),out=join(dir,"registry.json");
    await writeFile(input,JSON.stringify(valid)+"\n"+JSON.stringify(valid)+"\n");
    const first=await runObservationImport(["--input",input,"--out",out]);
    assert.equal(first.lastImport.acceptedCount,1);
    assert.equal(first.lastImport.duplicateCount,1);
    const second=await runObservationImport(["--input",input,"--existing",out,"--out",out]);
    assert.equal(second.lastImport.acceptedCount,0);
    assert.equal(second.lastImport.duplicateCount,2);
    assert.equal(JSON.parse(await readFile(out,"utf8")).records.length,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("observation importer dry-run validates without writing",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"intent-observations-dry-"));
  try{
    const input=join(dir,"input.json"),out=join(dir,"registry.json");
    await writeFile(input,JSON.stringify([valid]));
    const result=await runObservationImport(["--input",input,"--dry-run"]);
    assert.equal(result.dryRun,true);
    assert.equal(result.lastImport.acceptedCount,1);
    await assert.rejects(readFile(out,"utf8"),{code:"ENOENT"});
  }finally{await rm(dir,{recursive:true,force:true});}
});
