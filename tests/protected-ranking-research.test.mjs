import test from "node:test";
import assert from "node:assert/strict";
import { buildProtectionIndex, prepareProtectedMatches, runProtectedRankingResearch } from "../scripts/protected-ranking-research.mjs";

test("protection index requires exact player IDs and flags conflicting ranks",()=>{
 const result=buildProtectionIndex([
  {tour:"atp",player_id:"11",tournament_year:"2024",tournament_name:"Roland-Garros",protected_rank:"15",source_url:"official"},
  {tour:"atp",player_id:"11",tournament_year:"2024",tournament_name:"Roland Garros",protected_rank:"15"},
  {tour:"atp",player_id:"",tournament_year:"2024",tournament_name:"Wimbledon"},
  {tour:"wta",player_id:"22",tournament_year:"2024",tournament_name:"Roland-Garros",protected_rank:"7"},
  {tour:"atp",player_id:"33",tournament_year:"2024",tournament_name:"US Open",protected_rank:"20"},
  {tour:"atp",player_id:"33",tournament_year:"2024",tournament_name:"US Open",protected_rank:"21"}
 ],"atp");
 assert.equal(result.index.size,1);
 assert.equal(result.index.get("2024|roland garros|11").protectedRank,15);
 assert.equal(result.missingIds.length,1);
 assert.equal(result.conflicts.length,1);
});

test("protected rank replaces only the documented player's ordinary rank",()=>{
 const index=new Map([["2024|roland garros|11",{playerId:"11",protectedRank:15}]]);
 const [match]=prepareProtectedMatches([{
  tourney_date:"20240527",tourney_id:"RG24",tourney_name:"Roland Garros",match_num:"1",round:"R128",
  winner_id:"11",loser_id:"22",winner_rank:300,loser_rank:20,surface:"Clay"
 }],index);
 assert.equal(match.hasProtection,true);
 assert.equal(match.protectedRank1,15);
 assert.equal(match.protectedRank2,null);
 assert.equal(match.rankAdv,Math.log(20)-Math.log(300));
});

function syntheticSeason(year,count=420){
 const rows=[];
 for(let i=0;i<count;i++){
  let a=String((i%24)+1),b=String(((i*7+5)%24)+1);if(a===b)b=String((Number(b)%24)+1);
  const winner=i%3===0?a:b,loser=winner===a?b:a;
  const month=String(Math.floor(i/35)%12+1).padStart(2,"0");
  const day=String(i%27+1).padStart(2,"0");
  rows.push({tourney_date:year+month+day,tourney_id:year+"T"+Math.floor(i/35),tourney_name:"Synthetic "+Math.floor(i/35),
   match_num:String(i%35),round:"R32",winner_id:winner,loser_id:loser,
   winner_rank:String(20+(Number(winner)*13)%250),loser_rank:String(20+(Number(loser)*17)%250),surface:"Hard"});
 }
 return rows;
}

test("walk-forward research evaluates documented event matches without changing production code",()=>{
 const rows=[...syntheticSeason("2000"),...syntheticSeason("2001"),...syntheticSeason("2002"),...syntheticSeason("2003")];
 rows.push({tourney_date:"20030915",tourney_id:"USO03",tourney_name:"US Open",match_num:"1",round:"R128",
  winner_id:"11",loser_id:"22",winner_rank:"300",loser_rank:"20",surface:"Hard"});
 const observations=[{tour:"atp",player_id:"11",source_player_name:"Player 11",tournament_name:"US Open",
  tournament_year:"2003",protected_rank:"15",source_url:"official"}];
 const report=runProtectedRankingResearch(rows,observations,{tour:"atp",evaluationStart:"20030101",evaluationEnd:"20031231",
  minTrainingMatches:100,maxTrainingRows:300});
 assert.equal(report.researchOnly,true);
 assert.equal(report.evaluatedProtectedMatches,1);
 assert.equal(report.summary.matches,1);
 assert.ok(Number.isFinite(report.summary.protectedVsOrdinary.brier));
 assert.equal(report.byYear["2003"].matches,1);
});

test("future seasons do not alter an earlier evaluation year",()=>{
 const past=[...syntheticSeason("2000"),...syntheticSeason("2001"),...syntheticSeason("2002"),...syntheticSeason("2003")];
 past.push({tourney_date:"20030915",tourney_id:"USO03",tourney_name:"US Open",match_num:"1",round:"R128",
  winner_id:"11",loser_id:"22",winner_rank:"300",loser_rank:"20",surface:"Hard"});
 const obs=[{tour:"atp",player_id:"11",tournament_name:"US Open",tournament_year:"2003",protected_rank:"15"}];
 const options={tour:"atp",evaluationStart:"20030101",evaluationEnd:"20031231",minTrainingMatches:100,maxTrainingRows:300};
 const a=runProtectedRankingResearch(past,obs,options);
 const b=runProtectedRankingResearch([...past,...syntheticSeason("2004")],obs,options);
 assert.deepEqual(b.byYear["2003"],a.byYear["2003"]);
});
