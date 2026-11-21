#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";

const args=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i++){
  if(!["--tour","--input","--observations","--out"].includes(args[i])||!args[i+1])
    throw new Error("Usage: node scripts/protected-ranking-event-audit.mjs --tour atp|wta --input NORMALIZED.csv --observations OBSERVATIONS.csv [--out REPORT.json]");
  opts[args[i].slice(2)]=args[++i];
}
if(!["atp","wta"].includes(opts.tour)||!opts.input||!opts.observations)
  throw new Error("Usage: node scripts/protected-ranking-event-audit.mjs --tour atp|wta --input NORMALIZED.csv --observations OBSERVATIONS.csv [--out REPORT.json]");

const [archiveText,obsText]=await Promise.all([
  readFile(opts.input,"utf8"),readFile(opts.observations,"utf8")
]);
const archive=parseCsv(archiveText),observations=parseCsv(obsText);
const validId=v=>/^\d+$/.test(String(v??""))&&Number(v)>0;
const norm=s=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const rows=archive.filter(r=>/^\d{8}$/.test(String(r.tourney_date??""))&&validId(r.winner_id)&&validId(r.loser_id));
const report=[];
for(const obs of observations.filter(r=>String(r.tour).toLowerCase()===opts.tour)){
  const id=String(obs.player_id??"").trim();
  if(!validId(id)) throw new Error("Missing/invalid player_id for "+obs.source_player_name);
  const name=String(obs.source_player_name??"").trim();
  const playerRows=rows.filter(r=>String(r.winner_id)===id||String(r.loser_id)===id)
    .sort((a,b)=>String(a.tourney_date).localeCompare(String(b.tourney_date))||
      String(a.tourney_id).localeCompare(String(b.tourney_id))||
      String(a.match_num).localeCompare(String(b.match_num)));
  const year=String(obs.tournament_year);
  const target=norm(obs.tournament_name);
  const eventRows=playerRows.filter(r=>String(r.tourney_date).slice(0,4)===year&&
    (norm(r.tourney_name).includes(target)||target.includes(norm(r.tourney_name))));
  const eventDates=eventRows.map(r=>String(r.tourney_date)).sort();
  const firstEvent=eventDates[0]??null,lastEvent=eventDates.at(-1)??null;
  const before=firstEvent?playerRows.filter(r=>r.tourney_date<firstEvent).slice(-3):[];
  const after=lastEvent?playerRows.filter(r=>r.tourney_date>lastEvent).slice(0,3):[];
  const describe=r=>{
    const won=String(r.winner_id)===id;
    return {date:r.tourney_date,tournament:r.tourney_name,round:r.round,
      result:won?"W":"L",opponent:won?r.loser_name:r.winner_name,
      ordinaryRank:won?r.winner_rank:r.loser_rank,
      opponentOrdinaryRank:won?r.loser_rank:r.winner_rank,
      surface:r.surface};
  };
  report.push({
    tour:opts.tour,playerId:id,playerName:name,protectionType:obs.protection_type,
    publishedProtectedRank:obs.protected_rank===""?null:Number(obs.protected_rank),
    targetTournament:obs.tournament_name,targetYear:Number(year),
    archivePlayerMatches:playerRows.length,
    eventMatchCount:eventRows.length,
    eventDateRange:firstEvent&&lastEvent?{first:firstEvent,last:lastEvent}:null,
    eventMatches:eventRows.map(describe),
    lastThreeMatchesBeforeEvent:before.map(describe),
    firstThreeMatchesAfterEvent:after.map(describe),
    status:eventRows.length?"PLAYER_FOUND_IN_TARGET_EVENT":"NO_TARGET_EVENT_MATCH_IN_ARCHIVE"
  });
}
const summary={
  schemaVersion:1,researchOnly:true,tour:opts.tour,
  archiveRows:archive.length,observations:report.length,
  foundInTargetEvent:report.filter(r=>r.eventMatchCount>0).length,
  missingTargetEvent:report.filter(r=>r.eventMatchCount===0).length,
  limitation:"An absent target-event match may mean the player did not reach the main draw, the event name differs, or the archive lacks the match. Entry-list use does not prove a played match. The observed entry date is not treated as the protection start/end date."
};
const output={summary,players:report};
if(opts.out){
  const {writeFile}=await import("node:fs/promises");
  await writeFile(opts.out,JSON.stringify(output,null,2)+"\n","utf8");
}
console.log(JSON.stringify(output,null,2));
