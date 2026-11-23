import assert from "node:assert/strict";
import { auditValuebetSackmann } from "./aggregator1-linkage-audit.mjs";

const valuebet = [
  {
    filename: "valuebetennis-matchs-2025.csv",
    content: [
      "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie;joueur1_id;joueur2_id",
      "v1;2025-01-12 14:00:00;Australian Open Melbourne;atp;dur;Novak Djokovic;Rafael Nadal;Grand Chelem;101;102",
      "v2;2025-01-13 14:00:00;Australian Open;atp;dur;Carlos Alcaraz;Jannik Sinner;Main tour;103;104",
      "v3;2025-02-01 14:00:00;WTA 500 Abu Dhabi;wta;dur intérieur;Emma Raducanu;Ons Jabeur;Main tour;201;202",
      "v4;2025-03-10 14:00:00;Miami Open;atp;dur;Player C;Player D;Main tour;107;108",
      "v5;2025-04-10 14:00:00;;atp;dur;Player E;Player F;;109;110",
      "v6;2025-04-11 14:00:00;Unknown Event;atp;wood;Player G;Player H;ITF;111;112",
      "v7;2025-06-01 14:00:00;Australian Open;atp;dur;Novak Djokovic;Rafael Nadal;Grand Chelem;101;102",
      "v8;2025-06-02 14:00:00;Unknown Challenger;atp;dur;;Player Z;Challenger;113;114"
    ].join("\n")
  }
];
const sackmann = [
  {
    filename: "atp_matches_2025.csv",
    content: [
      "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
      "20250106,Australian Open,Hard,Novak Djokovic,Rafael Nadal,1,2",
      "20250303,Miami Open,Hard,Player C,Player D,3,4",
      "20250304,Indian Wells,Hard,Player D,Player C,4,3",
      "20250403,,Hard,Player E,Player F,5,6",
      "20250404,Monte Carlo,Hard,Player F,Player E,6,5",
      "20250407,Unknown Event,Wood,Player G,Player H,7,8"
    ].join("\n")
  },
  {
    filename: "wta_matches_2025.csv",
    content: [
      "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
      "20250127,Abu Dhabi,Hard,Ons Jabeur,Emma Raducanu,22,21",
      "20250130,Doha,Hard,Ons Jabeur,Emma Raducanu,22,21"
    ].join("\n")
  }
];

const playerFiles = [
  { filename:"atp_players.csv", content:[
    "player_id,name_first,name_last,hand,dob,ioc,height",
    "1,Novak,Djokovic,R,19870522,SRB,188",
    "2,Rafael,Nadal,L,19860603,ESP,185",
    "3,Player,C,R,19900101,USA,180",
    "4,Player,D,R,19900101,USA,180",
    "5,Player,E,R,19900101,USA,180",
    "6,Player,F,R,19900101,USA,180",
    "7,Player,G,R,19900101,USA,180",
    "8,Player,H,R,19900101,USA,180"
  ].join("\n") },
  { filename:"wta_players.csv", content:[
    "player_id,name_first,name_last,hand,dob,ioc,height",
    "21,Emma,Raducanu,R,20021113,GBR,175",
    "22,Ons,Jabeur,R,19940828,TUN,167"
  ].join("\n") }
];
const result = auditValuebetSackmann(valuebet, sackmann, {playerFiles});
assert.equal(result.totals.valuebetRows, 8);
assert.equal(result.totals.validValuebetRows, 7);
assert.equal(result.totals.candidateRows, 4);
assert.equal(result.totals.linkedUnique, 3);
assert.equal(result.totals.eventNameExactMatch, 3);
assert.equal(result.totals.eventNameMismatch, 0);
assert.equal(result.totals.eventNameUnavailableInSackmann, 0);
assert.equal(result.totals.sourceEventMissing, 0);
assert.equal(result.totals.linkedWithoutTournament, 1);
assert.equal(result.totals.linkedByTournament, 2);
assert.equal(result.totals.noCandidate, 4);
assert.equal(result.totals.invalidPlayerPair, 1);
assert.equal(result.totals.pairAbsent, 1);
assert.equal(result.totals.dateWindowMiss, 1);
assert.equal(result.totals.surfaceAbsent, 0);
assert.equal(result.totals.unknownSurface, 1);
assert.equal(result.totals.ambiguous, 1);
assert.equal(result.totals.linkagePct, 42.86);
assert.equal(result.byTour.ATP.linkedUnique, 2);
assert.equal(result.byTour.WTA.linkedUnique, 1);
assert.equal(result.byTourYear["ATP::2025"].rows, 7);
assert.equal(result.byTourYear["ATP::2025"].linkedUnique, 2);
assert.equal(result.byTourYear["ATP::2025"].pairAbsent, 1);
assert.equal(result.byTourYear["ATP::2025"].dateWindowMiss, 1);
assert.equal(result.byTourYear["ATP::2025"].invalidPlayerPair, 1);
assert.equal(result.byTourYear["WTA::2025"].rows, 1);
assert.equal(result.byTourYear["WTA::2025"].linkedUnique, 1);
assert.equal(result.coverageInterpretation.partialYear.includes("2026"), true);
assert.equal(result.coverageInterpretation.completeness.includes("No year is certified complete"), true);
assert.equal(result.sources.sackmannSourceRowsByYearTier["ATP:2025:main"], 6);
assert.equal(result.sources.sackmannSourceRowsByYearTier["WTA:2025:main"], 2);
assert.equal(result.playerIdEvidence.matchRowsWithBothPlayerIdsEvidence, 3);
assert.equal(result.playerIdEvidence.byTour.ATP.resolvedToSingleSackmannId, 4);
assert.equal(result.playerIdEvidence.byTour.WTA.resolvedToSingleSackmannId, 2);
assert.equal(result.playerIdEvidence.byTour.ATP.withAcceptedMatchEvidence, 4);
assert.equal(result.playerIdEvidence.byTour.WTA.withAcceptedMatchEvidence, 2);
assert.equal(result.playerIdComparison.ATP.bothUniqueAgreement, 4);
assert.equal(result.playerIdComparison.ATP.bothUniqueDisagreement, 0);
assert.equal(result.playerIdComparison.ATP.directOnlyUnique, 4);
assert.equal(result.playerIdComparison.WTA.bothUniqueAgreement, 2);
assert.equal(result.byTourCategory["ATP::Grand Chelem"].linkedUnique, 1);
assert.equal(result.byTourCategory["ATP::Main tour"].linkedUnique, 1);
assert.equal(result.byTourCategory["WTA::Main tour"].linkedUnique, 1);
assert.equal(result.byTourCategory["ATP::ITF"].unknownSurface, 1);
assert.equal(result.byTourCategory["ATP::Main tour"].pairAbsent, 1);
assert.equal(result.byTourYearCategory["ATP::2025::Grand Chelem"].rows, 2);
assert.equal(result.byTourYearCategory["ATP::2025::Grand Chelem"].linkedUnique, 1);
assert.equal(result.byTourYearCategory["ATP::2025::Main tour"].pairAbsent, 1);
assert.equal(result.byTourYearCategory["WTA::2025::Main tour"].linkedUnique, 1);
assert.equal(result.byTourYearCategory["ATP::2025::Challenger"].invalidPlayerPair, 1);
assert.equal(result.byTourCategory["ATP::Grand Chelem"].dateWindowMiss, 1);
assert.equal(result.byCategory["Main tour"].pairAbsent, 1);
assert.equal(result.byTourCategory["ATP::Challenger"].invalidPlayerPair, 1);
assert.equal(result.byCategory["Main tour"].rows, 3);

const conflictValuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie;joueur1_id;joueur2_id",
  "c1;2025-01-12;Australian Open;atp;dur;Novak Djokovic;Rafael Nadal;Grand Chelem;900;901",
  "c2;2025-02-10;Rotterdam;atp;dur;Novak Djokovic;Player Q;Main tour;900;902"
].join("\n")}];
const conflictSackmann=[{filename:"atp_matches_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
  "20250106,Australian Open,Hard,Novak Djokovic,Rafael Nadal,1,2",
  "20250203,Rotterdam,Hard,Player Q,Novak Djokovic,3,99"
].join("\n")}];
const conflictPlayers=[{filename:"atp_players.csv",content:[
  "player_id,name_first,name_last,hand,dob,ioc,height",
  "1,Novak,Djokovic,R,19870522,SRB,188",
  "2,Rafael,Nadal,L,19860603,ESP,185",
  "3,Player,Q,R,19900101,USA,180",
  "99,Novak,Djokovic,R,19900101,AUS,188"
].join("\n")}];
const conflictReport=auditValuebetSackmann(conflictValuebet,conflictSackmann,{playerFiles:conflictPlayers});
assert.equal(conflictReport.playerIdEvidence.byTour.ATP.conflictingSackmannIds,1);
assert.equal(conflictReport.playerIdEvidence.byTour.ATP.conflictProfile.differentBirthDateOrCountry,1);
const conflictCrosswalk=conflictReport.playerIdEvidence.conflictCrosswalkDiagnostics.ATP;
assert.equal(conflictCrosswalk.conflictingSourceIds,1);
assert.equal(conflictCrosswalk.directNameAmbiguous,1);
assert.equal(conflictCrosswalk.matchIdsAllInDirectCandidates,1);
assert.equal(conflictCrosswalk.matchIdsDoNotOverlapDirectCandidates,0);
assert.deepEqual(conflictCrosswalk.matchCandidateIdCounts,{"2":1});
assert.deepEqual(conflictCrosswalk.directCandidateIdCounts,{"2":1});
assert.deepEqual(conflictCrosswalk.registrySignatureCounts,{"2":1});
assert.deepEqual(conflictCrosswalk.candidateMetadataCompleteness,{"2":1});
assert.deepEqual(conflictCrosswalk.distinctDobCounts,{"2":1});
assert.deepEqual(conflictCrosswalk.distinctIocCounts,{"2":1});
assert.deepEqual(conflictCrosswalk.distinctHandCounts,{"1":1});
assert.deepEqual(conflictCrosswalk.metadataRelationshipProfiles,{"different_dob_and_ioc":1});





// Regression: abbreviated St Tropez and fully spelled Saint-Tropez must normalize identically.
const stTropezValuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie",
  "st1;2025-06-16;St Tropez CH;atp;dur;Player One;Player Two;Challenger"
].join("\n")}];
const stTropezSackmann=[{filename:"atp_matches_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
  "20250616,Saint-Tropez CH,Hard,Player One,Player Two,501,502"
].join("\n")}];
const stTropezReport=auditValuebetSackmann(stTropezValuebet,stTropezSackmann);
assert.equal(stTropezReport.totals.linkedUnique,1);
assert.equal(stTropezReport.totals.eventNameExactMatch,1);
assert.equal(stTropezReport.totals.eventNameMismatch,0);


const handConflictValuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie;joueur1_id;joueur2_id",
  "h1;2025-01-12;Australian Open;atp;dur;Alex Smith;Player B;Main tour;700;701",
  "h2;2025-02-10;Rotterdam;atp;dur;Alex Smith;Player C;Main tour;700;702"
].join("\n")}];
const handConflictSack=[{filename:"atp_matches_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
  "20250106,Australian Open,Hard,Alex Smith,Player B,71,72",
  "20250203,Rotterdam,Hard,Player C,Alex Smith,73,79"
].join("\n")}];
const handConflictPlayers=[{filename:"atp_players.csv",content:[
  "player_id,name_first,name_last,hand,dob,ioc,height",
  "71,Alex,Smith,R,19900101,USA,180",
  "79,Alex,Smith,L,19900101,USA,180",
  "72,Player,B,R,19910101,USA,181",
  "73,Player,C,R,19920101,USA,182"
].join("\n")}];
const handConflictReport=auditValuebetSackmann(handConflictValuebet,handConflictSack,{playerFiles:handConflictPlayers});
assert.equal(handConflictReport.playerIdEvidence.byTour.ATP.conflictingSackmannIds,1);
assert.equal(handConflictReport.playerIdEvidence.byTour.ATP.conflictProfile.sameDobIocDifferentHand,1);
assert.equal(handConflictReport.playerIdEvidence.byTour.ATP.conflictProfile.differentHandOnly,1);
assert.equal(handConflictReport.playerIdEvidence.byTour.ATP.conflictProfile.identicalAvailableSignature,0);
const handCrosswalk=handConflictReport.playerIdEvidence.conflictCrosswalkDiagnostics.ATP;
assert.deepEqual(handCrosswalk.candidateMetadataCompleteness,{"2":1});
assert.deepEqual(handCrosswalk.distinctDobCounts,{"1":1});
assert.deepEqual(handCrosswalk.distinctIocCounts,{"1":1});
assert.deepEqual(handCrosswalk.distinctHandCounts,{"2":1});
assert.deepEqual(handCrosswalk.metadataRelationshipProfiles,{"same_dob_ioc_different_hand":1});

// Regression: tournament sponsor/location suffix variants map to the same canonical event.
const aliasValuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie",
  "a1;2025-03-10;M15 Naples;atp;dur;Alias Player A;Alias Player B;ITF",
  "a2;2025-06-16;Rothesay Open Nottingham;wta;gazon;Alias Player C;Alias Player D;ITF"
].join("\n")}];
const aliasSackmann=[
  {filename:"atp_matches_2025.csv",content:[
    "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
    "20250310,M15 Naples FL,Hard,Alias Player A,Alias Player B,601,602"
  ].join("\n")},
  {filename:"wta_matches_2025.csv",content:[
    "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
    "20250616,Nottingham,Grass,Alias Player C,Alias Player D,603,604"
  ].join("\n")}
];
const aliasReport=auditValuebetSackmann(aliasValuebet,aliasSackmann);
assert.equal(aliasReport.totals.linkedUnique,2);
assert.equal(aliasReport.totals.eventNameExactMatch,2);
assert.equal(aliasReport.totals.eventNameMismatch,0);

// Regression: location suffix and official event-name variants.
const locationAliasValuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie",
  "l1;2025-04-07;Morelos CH;atp;dur;Location Player A;Location Player B;Challenger",
  "l2;2025-07-14;W60 Berkeley;wta;dur;Location Player C;Location Player D;ITF"
].join("\n")}];
const locationAliasSack=[
  {filename:"atp_matches_2025.csv",content:[
    "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
    "20250407,Cuernavaca CH,Hard,Location Player A,Location Player B,701,702"
  ].join("\n")},
  {filename:"wta_matches_2025.csv",content:[
    "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
    "20250714,W60 Berkeley CA,Hard,Location Player C,Location Player D,703,704"
  ].join("\n")}
];
const locationAliasReport=auditValuebetSackmann(locationAliasValuebet,locationAliasSack);
assert.equal(locationAliasReport.totals.linkedUnique,2);
assert.equal(locationAliasReport.totals.eventNameExactMatch,2);
assert.equal(locationAliasReport.totals.eventNameMismatch,0);

console.log("Aggregator 1 linkage audit fixtures: PASS");

 
// Regression: event-name diagnostics retain aggregate year/tour/category/source-tier context.
const mismatchBreakdownValuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie",
  "mb1;2025-08-11;Source Event Alpha;atp;dur;Breakdown Player A;Breakdown Player B;Challenger"
].join("\n")}];
const mismatchBreakdownSack=[{filename:"atp_matches_qual_chall_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
  "20250811,Archive Event Beta,Hard,Breakdown Player A,Breakdown Player B,801,802"
].join("\n")}];
const mismatchBreakdownReport=auditValuebetSackmann(mismatchBreakdownValuebet,mismatchBreakdownSack);
assert.equal(mismatchBreakdownReport.totals.linkedUnique,1);
assert.equal(mismatchBreakdownReport.totals.eventNameMismatch,1);
assert.deepEqual(mismatchBreakdownReport.eventNameDiagnostics.topMismatchBreakdown[0],{
  tour:"ATP",year:"2025",category:"Challenger",sackmannTier:"qual_chall",
  pair:"sourceeventalpha -> archiveeventbeta",count:1
});
 
// Regression: aggregate diagnostics explain why multiple date/surface candidates remain ambiguous.
const ambiguousValuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie",
  "amb1;2025-03-10;M15 Orlando;atp;dur;Ambiguous Player A;Ambiguous Player B;ITF"
].join("\n")}];
const ambiguousSackmann=[{filename:"atp_matches_futures_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
  "20250310,M15 Orlando FL,Hard,Ambiguous Player A,Ambiguous Player B,801,802",
  "20250310,M15 Tampa FL,Hard,Ambiguous Player A,Ambiguous Player B,811,812",
  "20250313,M15 Orlando FL,Hard,Ambiguous Player A,Ambiguous Player B,801,802"
].join("\n")}];
const ambiguousReport=auditValuebetSackmann(ambiguousValuebet,ambiguousSackmann);
assert.equal(ambiguousReport.totals.ambiguous,1);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.rows,1);
assert.deepEqual(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.resolutionStrategies,{
  unresolvedRows:1,uniqueNearestDate:1,singleNearestSignature:0,uniquePlayerIdPair:0,
  completePlayerIds:1,nearestSignatureAndUniqueIds:0,strictCandidate:0,strictCandidateSingleRow:0,strictCandidateDuplicateRows:0,strictCandidateSingleTier:0,strictCandidateMultipleTiers:0,strictCandidateCrossTierDuplicate:0,strictCandidateSameTierDuplicate:0,strictCandidateAllScoresPresent:0,strictCandidateOneDistinctScore:0,strictCandidateScoreConflict:0,strictCandidateAllRoundsPresent:0,strictCandidateOneDistinctRound:0,strictCandidateRoundConflict:0
});

const strictAmbiguousSackmann=[{filename:"atp_matches_futures_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
  "20250310,M15 Orlando FL,Hard,Ambiguous Player A,Ambiguous Player B,801,802",
  "20250313,M15 Tampa FL,Hard,Ambiguous Player A,Ambiguous Player B,801,802"
].join("\n")}];
const strictAmbiguousReport=auditValuebetSackmann(ambiguousValuebet,strictAmbiguousSackmann);
assert.equal(strictAmbiguousReport.totals.ambiguous,1);
assert.deepEqual(strictAmbiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.resolutionStrategies,{
  unresolvedRows:1,uniqueNearestDate:1,singleNearestSignature:1,uniquePlayerIdPair:1,
  completePlayerIds:1,nearestSignatureAndUniqueIds:1,strictCandidate:1,strictCandidateSingleRow:1,strictCandidateDuplicateRows:0,strictCandidateSingleTier:1,strictCandidateMultipleTiers:0,strictCandidateCrossTierDuplicate:0,strictCandidateSameTierDuplicate:0,strictCandidateAllScoresPresent:0,strictCandidateOneDistinctScore:0,strictCandidateScoreConflict:0,strictCandidateAllRoundsPresent:0,strictCandidateOneDistinctRound:0,strictCandidateRoundConflict:0
});
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.noExactEventMatch,1);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.rowsWithExactDateCandidate,1);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.rowsWithUniqueNearestCandidateDate,1);
assert.deepEqual(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestCandidateOffsetDays,[{days:0,count:1}]);
assert.deepEqual(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestCandidateGapDays,[{days:3,count:1}]);
assert.deepEqual(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.distinctCandidateDates,[{dates:2,count:1}]);
assert.deepEqual(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateCandidateRows,[{rows:2,count:1}]);
assert.deepEqual(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDistinctSignatures,[{signatures:2,count:1}]);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMultipleSignatures,1);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithSingleSignature,0);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMultiplePlayerIdPairs,1);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMissingPlayerIds,0);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMultiplePlayerIdPairsWithinSignature,0);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMultiplePlayerIdPairsAcrossSignaturesOnly,1);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMultipleWinnerIds,1);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMultipleLoserIds,1);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMultiplePlayerIdPairsAcrossTiers,0);
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMultiplePlayerIdPairsWithinTierOnly,1);

const sameSignatureIdConflictSackmann=[{filename:"atp_matches_futures_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
  "20250310,M15 Orlando FL,Hard,Ambiguous Player A,Ambiguous Player B,801,802",
  "20250310,M15 Orlando FL,Hard,Ambiguous Player A,Ambiguous Player B,811,812"
].join("\n")}];
const sameSignatureIdConflictReport=auditValuebetSackmann(ambiguousValuebet,sameSignatureIdConflictSackmann);
const sameSignatureIdDiagnostics=sameSignatureIdConflictReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics;
assert.equal(sameSignatureIdDiagnostics.rowsWithSingleSignature,1);
assert.equal(sameSignatureIdDiagnostics.rowsWithMultiplePlayerIdPairs,1);
assert.equal(sameSignatureIdDiagnostics.rowsWithMultiplePlayerIdPairsWithinSignature,1);
assert.equal(sameSignatureIdDiagnostics.rowsWithMultiplePlayerIdPairsAcrossSignaturesOnly,0);
assert.equal(sameSignatureIdDiagnostics.rowsWithMultipleWinnerIds,1);
assert.equal(sameSignatureIdDiagnostics.rowsWithMultipleLoserIds,1);
assert.equal(sameSignatureIdDiagnostics.rowsWithMultiplePlayerIdPairsAcrossTiers,0);
assert.equal(sameSignatureIdDiagnostics.rowsWithMultiplePlayerIdPairsWithinTierOnly,1);

assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.topBreakdown[0].sourceEvent,"m15orlando");
assert.equal(ambiguousReport.eventNameDiagnostics.ambiguousCandidateResolution.topBreakdown[0].candidateEvent,"m15orlandofl");
 
// Regression: identical event/date/player candidates repeated across source tiers are diagnosed as cross-tier duplicates.
const tierDuplicateValuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;categorie",
  "td1;2025-05-12;M15 Example;atp;dur;Tier Player A;Tier Player B;ITF"
].join("\n")}];
const tierDuplicateSack=[
  {filename:"atp_matches_futures_2025.csv",content:[
    "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id,score,round",
    "20250512,M15 Example,Hard,Tier Player A,Tier Player B,901,902,6-4 6-4,R32"
  ].join("\n")},
  {filename:"atp_matches_qual_chall_2025.csv",content:[
    "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id,score,round",
    "20250512,M15 Example,Hard,Tier Player A,Tier Player B,901,902,6-4 6-4,R32"
  ].join("\n")}
];
const tierDuplicateReport=auditValuebetSackmann(tierDuplicateValuebet,tierDuplicateSack);
assert.equal(tierDuplicateReport.totals.ambiguous,1);
assert.equal(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.rowsWithCrossTierDuplicateCandidate,1);
assert.equal(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.duplicateCandidateExtraRows,1);
assert.deepEqual(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateCandidateRows,[{rows:2,count:1}]);
const tierPairBreakdown=tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.tierConflictBreakdown;
assert.equal(tierPairBreakdown.length,1);
assert.equal(tierPairBreakdown[0].candidates,1);
assert.equal(tierPairBreakdown[0].internallyConsistentScores,1);
assert.equal(tierPairBreakdown[0].internallyConsistentRounds,1);
assert.deepEqual(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDistinctSignatures,[{signatures:1,count:1}]);
assert.equal(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithSingleSignature,1);
assert.equal(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.duplicateExtraRows,1);
assert.equal(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithCrossTierDuplicate,1);
assert.equal(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMultiplePlayerIdPairs,0);
assert.equal(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.nearestDateDiagnostics.rowsWithMissingPlayerIds,0);
assert.equal(tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.topReasonBreakdown[0].crossTierDuplicate,"cross-tier-duplicate");

// Strict candidates are still not automatically accepted: classify duplicate rows by source tier.
const strictTierDiagnostics=tierDuplicateReport.eventNameDiagnostics.ambiguousCandidateResolution.resolutionStrategies;
assert.equal(strictTierDiagnostics.strictCandidate,1);
assert.equal(strictTierDiagnostics.strictCandidateSingleRow,0);
assert.equal(strictTierDiagnostics.strictCandidateDuplicateRows,1);
assert.equal(strictTierDiagnostics.strictCandidateSingleTier,0);
assert.equal(strictTierDiagnostics.strictCandidateMultipleTiers,1);
assert.equal(strictTierDiagnostics.strictCandidateCrossTierDuplicate,1);
assert.equal(strictTierDiagnostics.strictCandidateSameTierDuplicate,0);
assert.equal(strictTierDiagnostics.strictCandidateAllScoresPresent,1);
assert.equal(strictTierDiagnostics.strictCandidateOneDistinctScore,1);
assert.equal(strictTierDiagnostics.strictCandidateScoreConflict,0);
assert.equal(strictTierDiagnostics.strictCandidateAllRoundsPresent,1);
assert.equal(strictTierDiagnostics.strictCandidateOneDistinctRound,1);
assert.equal(strictTierDiagnostics.strictCandidateRoundConflict,0);

// Same-date duplicate rows with inconsistent score must remain flagged, not auto-resolved.
const scoreConflictSack=[{filename:"atp_matches_futures_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id,score,round",
  "20250512,M15 Example,Hard,Tier Player A,Tier Player B,901,902,6-4 6-4,R32",
  "20250512,M15 Example,Hard,Tier Player A,Tier Player B,901,902,4-6 6-4 6-3,R32"
].join("\n")}];
const scoreConflictReport=auditValuebetSackmann(tierDuplicateValuebet,scoreConflictSack);
const scoreConflictDiagnostics=scoreConflictReport.eventNameDiagnostics.ambiguousCandidateResolution.resolutionStrategies;
assert.equal(scoreConflictDiagnostics.strictCandidate,1);
assert.equal(scoreConflictDiagnostics.strictCandidateAllScoresPresent,1);
assert.equal(scoreConflictDiagnostics.strictCandidateOneDistinctScore,0);
assert.equal(scoreConflictDiagnostics.strictCandidateScoreConflict,1);
assert.equal(scoreConflictDiagnostics.strictCandidateOneDistinctRound,1);

// Whitespace-only score formatting differences must normalize to one score.
const scoreWhitespaceSack=[{filename:"atp_matches_futures_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id,score,round",
  "20250512,M15 Example,Hard,Tier Player A,Tier Player B,901,902,6-4  6-4,R32",
  "20250512,M15 Example,Hard,Tier Player A,Tier Player B,901,902,6-4 6-4,R32"
].join("\n")}];
const scoreWhitespaceReport=auditValuebetSackmann(tierDuplicateValuebet,scoreWhitespaceSack);
const scoreWhitespaceDiagnostics=scoreWhitespaceReport.eventNameDiagnostics.ambiguousCandidateResolution.resolutionStrategies;
assert.equal(scoreWhitespaceDiagnostics.strictCandidate,1);
assert.equal(scoreWhitespaceDiagnostics.strictCandidateOneDistinctScore,1);
assert.equal(scoreWhitespaceDiagnostics.strictCandidateScoreConflict,0);
const conflictBreakdown=scoreConflictReport.eventNameDiagnostics.ambiguousCandidateResolution.scoreRoundConflictBreakdown;
assert.equal(conflictBreakdown.sameTierDuplicate.candidates,1);
assert.equal(conflictBreakdown.sameTierDuplicate.scoreConflict,1);
assert.equal(conflictBreakdown.sameTierDuplicate.roundConflict,0);
assert.equal(conflictBreakdown.crossTierDuplicate.candidates,0);

 
// Aggregate-only diagnostics distinguish absent player pairs from date-window misses.
const unmatchedValuebet=[{filename:"valuebetennis-matchs-2025.csv",content:[
  "match_id;date;tournoi;genre;surface;joueur1;joueur2;joueur1_id;joueur2_id;categorie",
  "un1;2025-05-12;Unknown Event;atp;dur;Registry Player A;Registry Player B;901;902;ITF"
].join("\n")}];
const unrelatedSack=[{filename:"atp_matches_futures_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
  "20250512,Other Event,Hard,Other Player A,Other Player B,801,802"
].join("\n")}];
const playerRegistry=[{filename:"atp_players.csv",content:[
  "player_id,name_first,name_last,dob,ioc,hand",
  "901,Registry,Player A,19900101,USA,R",
  "902,Registry,Player B,19910101,FRA,L"
].join("\n")}];
const unmatchedReport=auditValuebetSackmann(unmatchedValuebet,unrelatedSack,{playerFiles:playerRegistry});
const pairAbsentDiagnostics=unmatchedReport.noCandidateDiagnostics.byReason.pairAbsent;
assert.equal(unmatchedReport.noCandidateDiagnostics.rows,1);
assert.equal(pairAbsentDiagnostics.rows,1);
assert.equal(pairAbsentDiagnostics.bothNamesInRegistry,1);
assert.equal(pairAbsentDiagnostics.bothSourceIdsInRegistry,1);
assert.equal(JSON.stringify(unmatchedReport.noCandidateDiagnostics).includes("Registry Player"),false);

const dateMissSack=[{filename:"atp_matches_futures_2025.csv",content:[
  "tourney_date,tourney_name,surface,winner_name,loser_name,winner_id,loser_id",
  "20250301,Old Event,Hard,Registry Player A,Registry Player B,901,902"
].join("\n")}];
const dateMissReport=auditValuebetSackmann(unmatchedValuebet,dateMissSack,{playerFiles:playerRegistry});
const dateMissDiagnostics=dateMissReport.noCandidateDiagnostics.byReason.dateWindowMiss;
assert.equal(dateMissDiagnostics.rows,1);
assert.equal(dateMissDiagnostics.bothNamesInRegistry,1);
assert.equal(dateMissDiagnostics.bothSourceIdsInRegistry,1);
assert.deepEqual(dateMissReport.noCandidateDiagnostics.dateWindowMissNearestOffsetBuckets,{"15-30":0,"31-60":0,"61-180":1,">180":0});
