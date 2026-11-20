import test from "node:test";
import assert from "node:assert/strict";
import { buildPrematchRankRows } from "../scripts/sackmann-prematch-rank-research.mjs";

test("uses the latest weekly ranking strictly before the match date",()=>{
 const rankings=[
  {ranking_date:"20260105",player:"1",rank:"10"},
  {ranking_date:"20260112",player:"1",rank:"8"},
  {ranking_date:"20260105",player:"2",rank:"30"},
  {ranking_date:"20260112",player:"2",rank:"25"},
  {ranking_date:"20260119",player:"2",rank:"20"}
 ];
 const matches=[{tourney_date:"20260119",winner_id:"1",loser_id:"2"}];
 const result=buildPrematchRankRows(matches,rankings);
 assert.equal(result.rows[0].winner_rank,8);
 assert.equal(result.rows[0].loser_rank,25);
 assert.equal(result.rows[0].rank_snapshot_winner_date,"20260112");
 assert.equal(result.rows[0].rank_snapshot_loser_date,"20260112");
 assert.equal(result.coverage.bothPlayersRanked,1);
 assert.equal(result.coverage.sameDayRankingRowsExcluded,1);
});
test("does not invent rankings when no earlier snapshot exists",()=>{
 const result=buildPrematchRankRows([{tourney_date:"20200101",winner_id:"1",loser_id:"2"}],[{ranking_date:"20200101",player:"1",rank:"5"}]);
 assert.equal(result.rows[0].winner_rank,"");
 assert.equal(result.rows[0].loser_rank,"");
 assert.equal(result.coverage.neitherRanked,1);
});
