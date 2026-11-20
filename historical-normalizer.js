/**
 * Normalize poetsc/tennis-results records into a stable, source-neutral schema.
 * Archival adapter only: it does not train a model or alter predictions.
 */
const SCHEMA_VERSION = 1;
const VALID_TOURS = new Set(["atp-single", "wta-single"]);
const SURFACES = new Map([
  ["clay","clay"],["terre battue","clay"],["hard","hard"],["dur","hard"],
  ["indoors","indoor"],["indoor","indoor"],["moquette intérieur","carpet"],
  ["carpet","carpet"],["grass","grass"],["gazon","grass"]
]);
function text(v){return typeof v==="string"&&v.trim()?v.trim():null;}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function odds(v){const n=Number(v);return Number.isFinite(n)&&n>1&&n<=1000?n:null;}
function name(v){return text(v)?.normalize("NFKC").toLocaleLowerCase("en").replace(/[.']/g,"").replace(/\s+/g," ")??null;}
function surface(v){const k=text(v)?.toLocaleLowerCase("fr");return k?SURFACES.get(k)??"unknown":"unknown";}
function winnerSide(r){
 const w=name(r.winner),a=name(r.player1),b=name(r.player2);
 return !w||!a||!b?null:w===a?"A":w===b?"B":null;
}
function incompleteScore(r){
 if(!text(r.score)||r.finished!==true||!Array.isArray(r.sets)||!r.sets.length)return false;
 return r.sets.some(s=>Number.isFinite(Number(s?.player1))&&Number.isFinite(Number(s?.player2))&&Math.max(Number(s.player1),Number(s.player2))<6);
}
export function normalizeHistoricalMatch(raw){
 const r=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
 const tour=text(r.tour)?.toLowerCase()??"unknown",pA=text(r.player1),pB=text(r.player2);
 const finished=r.finished===true||text(r.status)?.toLowerCase()==="finished";
 const retired=r.retired===true,walkover=r.walkover===true,winner=winnerSide(r),badScore=incompleteScore(r);
 const rankA=positive(r.player1Rank??r.player1Info?.rank),rankB=positive(r.player2Rank??r.player2Info?.rank);
 const currentA=odds(r.oddsPlayer1),currentB=odds(r.oddsPlayer2);
 const openingA=odds(r.openingOddsPlayer1Avg),openingB=odds(r.openingOddsPlayer2Avg);
 const averageA=odds(r.currentOddsPlayer1Avg),averageB=odds(r.currentOddsPlayer2Avg);
 const resultExclusions=[],marketExclusions=[];
 if(!VALID_TOURS.has(tour))resultExclusions.push("unsupported_tour");
 if(!pA||!pB||name(pA)===name(pB))resultExclusions.push("invalid_players");
 if(!finished)resultExclusions.push("not_finished");
 if(retired)resultExclusions.push("retired");
 if(walkover)resultExclusions.push("walkover");
 if(!winner)resultExclusions.push("winner_unmatched");
 if(!text(r.score))resultExclusions.push("missing_score");
 if(badScore)resultExclusions.push("possible_incomplete_score");
 if(openingA===null||openingB===null)marketExclusions.push("invalid_opening_odds_pair");
 if(currentA===null||currentB===null)marketExclusions.push("invalid_current_odds_pair");
 const h2hA=r.h2hPlayer1Wins!=null&&r.h2hPlayer1Wins!==""&&Number.isInteger(Number(r.h2hPlayer1Wins))&&Number(r.h2hPlayer1Wins)>=0?Number(r.h2hPlayer1Wins):null;
 const h2hB=r.h2hPlayer2Wins!=null&&r.h2hPlayer2Wins!==""&&Number.isInteger(Number(r.h2hPlayer2Wins))&&Number(r.h2hPlayer2Wins)>=0?Number(r.h2hPlayer2Wins):null;
 const court=surface(r.surface),date=/^\d{4}-\d{2}-\d{2}$/.test(text(r.date)??"")?r.date:null;
 const time=/^\d{1,2}:\d{2}$/.test(text(r.time)??"")?r.time:null;
 const pair=(a,b)=>({A:a,B:b,validPair:a!==null&&b!==null});
 return {
  schemaVersion:SCHEMA_VERSION,source:"poetsc/tennis-results",sourceMatchId:text(r.matchId),
  date,time,scheduledAtLocal:date&&time?date+"T"+time:null,tour,
  tournament:text(r.tournament),round:text(r.round),surface:court,
  indoor:r.indoor===true||court==="indoor",
  players:{
   A:{name:pA,rank:rankA,birthDate:text(r.player1Info?.birthDate),heightCm:positive(r.player1Info?.heightCm),weightKg:positive(r.player1Info?.weightKg),plays:text(r.player1Info?.plays)},
   B:{name:pB,rank:rankB,birthDate:text(r.player2Info?.birthDate),heightCm:positive(r.player2Info?.heightCm),weightKg:positive(r.player2Info?.weightKg),plays:text(r.player2Info?.plays)}
  },
  headToHead:{playerAWins:h2hA,playerBWins:h2hB,matches:r.h2hMatches!=null&&r.h2hMatches!==""&&Number.isInteger(Number(r.h2hMatches))&&Number(r.h2hMatches)>=0?Number(r.h2hMatches):null,available:h2hA!==null&&h2hB!==null},
  market:{currentOdds:pair(currentA,currentB),openingAverageOdds:pair(openingA,openingB),currentAverageOdds:pair(averageA,averageB),bookmakerCount:Array.isArray(r.bookmakerOdds)?r.bookmakerOdds.length:0},
  result:{status:finished?"finished":text(r.status)?.toLowerCase()??"unknown",finished,retired,walkover,winnerSide:winner,score:text(r.score),sets:Array.isArray(r.sets)?r.sets:[],possibleIncompleteScore:badScore},
  quality:{
   resultEligible:resultExclusions.length===0,resultExclusions,
   marketEligible:marketExclusions.length===0,marketExclusions,
   missing:{rankA:rankA===null,rankB:rankB===null,h2h:h2hA===null||h2hB===null,openingOddsPair:openingA===null||openingB===null,currentOddsPair:currentA===null||currentB===null,surface:court==="unknown"}
  }
 };
}
export function normalizeHistoricalDataset(items){
 const input=Array.isArray(items)?items:[],records=input.map(normalizeHistoricalMatch);
 const ids=records.map(r=>r.sourceMatchId).filter(Boolean),tours={},surfaces={};
 for(const r of records){tours[r.tour]=(tours[r.tour]??0)+1;surfaces[r.surface]=(surfaces[r.surface]??0)+1;}
 return {
  schemaVersion:SCHEMA_VERSION,source:"poetsc/tennis-results",inputCount:input.length,normalizedCount:records.length,
  resultEligible:records.filter(r=>r.quality.resultEligible).length,
  marketEligible:records.filter(r=>r.quality.marketEligible).length,
  bothEligible:records.filter(r=>r.quality.resultEligible&&r.quality.marketEligible).length,
  duplicateSourceIds:ids.length-new Set(ids).size,tourCounts:tours,surfaceCounts:surfaces,records
 };
}
