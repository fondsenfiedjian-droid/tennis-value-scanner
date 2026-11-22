import test from "node:test";
import assert from "node:assert/strict";
import { validateTournamentIntentObservation, summarizeTournamentIntentObservations } from "../tournament-intent-observations.js";

const base={
  tour:"wta",playerId:"12345",playerName:"Example Player",eventId:"event-1",tournament:"Example Open",
  targetMatchId:"match-1",targetMatchStart:"2026-11-25T12:00:00Z",
  preEventRank:95,rankingSnapshotDate:"2026-11-16T00:00:00Z",
  searchStartedAt:"2026-11-24T08:00:00Z",searchCompletedAt:"2026-11-24T08:12:00Z",
  searchDurationMinutes:12,searchOutcome:"no_evidence_found",evidenceIds:[],reviewedBy:"reviewer",
  sourceSearch:{official_tour_news:"searched",official_tournament_media:"searched",player_team_statement:"searched",reputable_media:"searched",official_schedule:"searched"}
};

test("records a complete no-evidence search without inventing a negative intent label",()=>{
  const result=validateTournamentIntentObservation(base);
  assert.equal(result.valid,true);
  assert.equal(result.observation.rankingBand,"51-100");
  assert.equal(result.observation.searchOutcome,"no_evidence_found");
});

test("records an evidence-found observation only with linked evidence IDs",()=>{
  const result=validateTournamentIntentObservation({...base,searchOutcome:"evidence_found",evidenceIds:["evidence-1"]});
  assert.equal(result.valid,true);
});

test("no-evidence-found requires every source category to have been searched",()=>{
  const result=validateTournamentIntentObservation({...base,sourceSearch:{...base.sourceSearch,reputable_media:"unavailable"}});
  assert.ok(result.errors.includes("no_evidence_requires_all_sources_searched"));
});

test("source-unavailable is distinct from an incomplete search",()=>{
  const unavailable=validateTournamentIntentObservation({...base,searchOutcome:"source_unavailable",sourceSearch:{...base.sourceSearch,official_tour_news:"unavailable"}});
  assert.equal(unavailable.valid,true);
  const incomplete=validateTournamentIntentObservation({...base,searchOutcome:"search_incomplete",sourceSearch:{...base.sourceSearch,reputable_media:"not_searched"}});
  assert.equal(incomplete.valid,true);
});

test("rejects post-match search completion and ranking snapshots after target start",()=>{
  const result=validateTournamentIntentObservation({...base,searchCompletedAt:"2026-11-25T12:01:00Z",rankingSnapshotDate:"2026-11-26T00:00:00Z"});
  assert.ok(result.errors.includes("search_completed_after_target_start"));
  assert.ok(result.errors.includes("ranking_snapshot_after_target_start"));
});

test("rejects ranks outside the frozen top-150 eligibility frame",()=>{
  const result=validateTournamentIntentObservation({...base,preEventRank:151});
  assert.ok(result.errors.includes("rank_outside_top_150"));
});

test("summarizes coverage outcomes and strata without treating no evidence as low priority",()=>{
  const a=validateTournamentIntentObservation(base).observation;
  const b=validateTournamentIntentObservation({...base,searchOutcome:"evidence_found",evidenceIds:["e1"]}).observation;
  const result=summarizeTournamentIntentObservations([a,b]);
  assert.deepEqual(result,{total:2,evidenceFound:1,noEvidenceFound:1,sourceUnavailable:0,searchIncomplete:0,byTour:{atp:0,wta:2},byRankBand:{"1-50":0,"51-100":2,"101-150":0}});
});
