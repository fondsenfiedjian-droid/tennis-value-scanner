/**
 * Point-in-time sampling ledger for tournament-intent source searches.
 * Records every sampled player-match, including no-evidence and unavailable cases.
 */

const SOURCE_CATEGORIES = [
  "official_tour_news",
  "official_tournament_media",
  "player_team_statement",
  "reputable_media",
  "official_schedule"
];
const SOURCE_STATES = new Set(["searched", "unavailable", "not_searched"]);
const OUTCOMES = new Set(["evidence_found", "no_evidence_found", "source_unavailable", "search_incomplete"]);

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function clean(value, max=160) {
  return typeof value === "string" ? value.trim().slice(0,max) : "";
}

/** Validate one player–target-match source-search observation. */
export function validateTournamentIntentObservation(input) {
  const errors=[];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {valid:false,errors:["observation_not_object"],observation:null};
  }
  const tour=clean(input.tour,12).toLowerCase();
  const playerId=input.playerId==null?null:String(input.playerId).trim();
  const playerName=clean(input.playerName,120);
  const eventId=input.eventId==null?null:String(input.eventId).trim();
  const tournament=clean(input.tournament,160);
  const targetMatchId=clean(input.targetMatchId,120);
  const targetStart=timestamp(input.targetMatchStart);
  const rank=Number(input.preEventRank);
  const rankDate=timestamp(input.rankingSnapshotDate);
  const started=timestamp(input.searchStartedAt);
  const completed=timestamp(input.searchCompletedAt);
  const duration=Number(input.searchDurationMinutes);
  const outcome=clean(input.searchOutcome,40);
  const reviewedBy=clean(input.reviewedBy,120);
  const evidenceIds=Array.isArray(input.evidenceIds)?input.evidenceIds.map(x=>String(x).trim()).filter(Boolean):[];
  const sourceSearch=input.sourceSearch;

  if (!["atp","wta"].includes(tour)) errors.push("invalid_tour");
  if (!playerId&&!playerName) errors.push("missing_player_identity");
  if (!eventId&&!tournament) errors.push("missing_event_identity");
  if (!targetMatchId) errors.push("missing_target_match_id");
  if (targetStart===null) errors.push("invalid_target_match_start");
  if (!Number.isInteger(rank)||rank<1||rank>150) errors.push("rank_outside_top_150");
  if (rankDate===null) errors.push("invalid_ranking_snapshot_date");
  if (rankDate!==null&&targetStart!==null&&rankDate>targetStart) errors.push("ranking_snapshot_after_target_start");
  if (started===null) errors.push("invalid_search_started_at");
  if (completed===null) errors.push("invalid_search_completed_at");
  if (started!==null&&completed!==null&&started>completed) errors.push("search_completed_before_started");
  if (completed!==null&&targetStart!==null&&completed>targetStart) errors.push("search_completed_after_target_start");
  if (!Number.isFinite(duration)||duration<0||duration>15) errors.push("search_duration_outside_0_to_15_minutes");
  if (!OUTCOMES.has(outcome)) errors.push("invalid_search_outcome");
  if (!reviewedBy) errors.push("missing_reviewer");
  if (!Array.isArray(input.evidenceIds)) errors.push("evidence_ids_must_be_array");
  if (new Set(evidenceIds).size!==evidenceIds.length) errors.push("duplicate_evidence_ids");

  if (!sourceSearch||typeof sourceSearch!=="object"||Array.isArray(sourceSearch)) {
    errors.push("missing_source_search_statuses");
  } else {
    for (const category of SOURCE_CATEGORIES) {
      if (!SOURCE_STATES.has(sourceSearch[category])) errors.push("invalid_source_search_status:"+category);
    }
    for (const category of Object.keys(sourceSearch)) {
      if (!SOURCE_CATEGORIES.includes(category)) errors.push("unknown_source_search_category:"+category);
    }
  }

  if (sourceSearch&&typeof sourceSearch==="object"&&!Array.isArray(sourceSearch)) {
    const states=SOURCE_CATEGORIES.map(category=>sourceSearch[category]);
    const hasUnavailable=states.includes("unavailable");
    const hasNotSearched=states.includes("not_searched");
    const allSearched=states.every(state=>state==="searched");
    if (outcome==="evidence_found"&&evidenceIds.length===0) errors.push("evidence_found_requires_evidence_ids");
    if (outcome!=="evidence_found"&&evidenceIds.length>0) errors.push("evidence_ids_require_evidence_found_outcome");
    if (outcome==="no_evidence_found"&&!allSearched) errors.push("no_evidence_requires_all_sources_searched");
    if (outcome==="source_unavailable"&&(!hasUnavailable||hasNotSearched)) errors.push("source_unavailable_requires_completed_search_with_unavailable_source");
    if (outcome==="search_incomplete"&&!hasNotSearched) errors.push("search_incomplete_requires_not_searched_source");
    if (outcome==="evidence_found"&&!states.includes("searched")) errors.push("evidence_found_requires_at_least_one_searched_source");
  }

  if (errors.length) return {valid:false,errors,observation:null};
  const rankingBand=rank<=50?"1-50":rank<=100?"51-100":"101-150";
  const observation={
    schemaVersion:1,tour,playerId:playerId||null,playerName:playerName||null,
    eventId:eventId||null,tournament:tournament||null,targetMatchId,
    targetMatchStart:new Date(targetStart).toISOString(),
    preEventRank:rank,rankingBand,rankingSnapshotDate:new Date(rankDate).toISOString(),
    searchStartedAt:new Date(started).toISOString(),searchCompletedAt:new Date(completed).toISOString(),
    searchDurationMinutes:duration,searchOutcome:outcome,
    sourceSearch:Object.fromEntries(SOURCE_CATEGORIES.map(category=>[category,sourceSearch[category]])),
    evidenceIds,reviewedBy
  };
  observation.observationId=[tour,playerId||playerName.toLowerCase(),targetMatchId].join("|");
  return {valid:true,errors:[],observation};
}

/** Summarize coverage outcomes without treating missing evidence as a negative label. */
export function summarizeTournamentIntentObservations(observations) {
  const rows=Array.isArray(observations)?observations:[];
  const summary={total:rows.length,evidenceFound:0,noEvidenceFound:0,sourceUnavailable:0,searchIncomplete:0,byTour:{atp:0,wta:0},byRankBand:{"1-50":0,"51-100":0,"101-150":0}};
  for(const row of rows){
    if(OUTCOMES.has(row?.searchOutcome)){
      const key={evidence_found:"evidenceFound",no_evidence_found:"noEvidenceFound",source_unavailable:"sourceUnavailable",search_incomplete:"searchIncomplete"}[row.searchOutcome];
      summary[key]++;
    }
    if(Object.hasOwn(summary.byTour,row?.tour)) summary.byTour[row.tour]++;
    if(Object.hasOwn(summary.byRankBand,row?.rankingBand)) summary.byRankBand[row.rankingBand]++;
  }
  return summary;
}
