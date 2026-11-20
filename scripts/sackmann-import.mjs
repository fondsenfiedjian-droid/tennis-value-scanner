#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const SURFACES = new Map([
  ["hard", "Hard"], ["clay", "Clay"], ["grass", "Grass"], ["carpet", "Carpet"]
]);
const validDate = value => {
  const s=String(value??"");
  if(!/^\d{8}$/.test(s)) return false;
  const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6,8);
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d;
};
const positiveId = v => /^\d+$/.test(String(v??"")) && Number(v)>0;
const finiteOrNull = v => {
  if(v==null || String(v).trim()==="") return null;
  const n=Number(v); return Number.isFinite(n) ? n : null;
};
const completedScore = (value, bestOf, tourneyName) => {
  const s=String(value??"").trim();
  if(!s || /\b(?:W\/O|RET|ABD|DEF|DEFAULT|CANC)\b/i.test(s)) return false;
  const fast4=/next\s*gen|fast\s*4/i.test(String(tourneyName??""));
  const sets=[...s.matchAll(/(\d{1,2})-(\d{1,2})(?:\((\d+)\))?/g)]
    .filter(match=>{
      const a=Number(match[1]),b=Number(match[2]);
      const high=Math.max(a,b),low=Math.min(a,b);
      if(fast4) return (high===4 && low<=2) || (high===4 && low===3 && match[3]!==undefined);
      return (high>=6 && high-low>=2) || (high===7 && low===6);
    }).length;
  const format=Number(bestOf);
  const requiredSets=format===5 ? 3 : 2;
  return sets>=requiredSets;
};

export function normalizeSackmannRows(rows, tour) {
  if(!["atp","wta"].includes(tour)) throw new RangeError("tour must be atp or wta");
  const output=[], excluded={invalidDate:0,invalidPlayers:0,unfinishedOrRetired:0,unsupportedSurface:0};
  for(const row of rows){
    if(!validDate(row.tourney_date)){excluded.invalidDate++;continue;}
    if(!positiveId(row.winner_id)||!positiveId(row.loser_id)||String(row.winner_id)===String(row.loser_id)){
      excluded.invalidPlayers++;continue;
    }
    if(!completedScore(row.score,row.best_of,row.tourney_name)){excluded.unfinishedOrRetired++;continue;}
    const surface=SURFACES.get(String(row.surface??"").trim().toLowerCase())??null;
    if(!surface) excluded.unsupportedSurface++;
    output.push({
      tourney_date:String(row.tourney_date),
      tourney_id:String(row.tourney_id??""),
      tourney_name:String(row.tourney_name??""),
      tour,
      tourney_level:String(row.tourney_level??""),
      round:String(row.round??""),
      match_num:String(row.match_num??""),
      surface:surface??"",
      winner_id:String(row.winner_id),
      loser_id:String(row.loser_id),
      winner_name:String(row.winner_name??""),
      loser_name:String(row.loser_name??""),
      winner_rank:finiteOrNull(row.winner_rank),
      loser_rank:finiteOrNull(row.loser_rank),
      winner_rank_points:finiteOrNull(row.winner_rank_points),
      loser_rank_points:finiteOrNull(row.loser_rank_points),
      winner_age:finiteOrNull(row.winner_age),
      loser_age:finiteOrNull(row.loser_age),
      score:String(row.score).trim(),
      best_of:finiteOrNull(row.best_of),
      durationMinutes:finiteOrNull(row.minutes),
      source:"Jeff Sackmann tennis_atp / tennis_wta"
    });
  }
  output.sort((a,b)=>a.tourney_date.localeCompare(b.tourney_date)||
    a.tourney_id.localeCompare(b.tourney_id)||a.match_num.localeCompare(b.match_num));
  return {rows:output,excluded};
}

const columns=["tourney_date","tourney_id","tourney_name","tour","tourney_level","round","match_num","surface",
  "winner_id","loser_id","winner_name","loser_name","winner_rank","loser_rank","winner_rank_points",
  "loser_rank_points","winner_age","loser_age","score","best_of","durationMinutes","source"];
const csvCell=v=>{
  const s=v==null?"":String(v);
  return /[",\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
};
export function toCsv(rows){
  return [columns.join(","),...rows.map(row=>columns.map(key=>csvCell(row[key])).join(","))].join("\n")+"\n";
}

async function main(){
  const args=process.argv.slice(2), opts={};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!["--tour","--input-dir","--output"].includes(key)||!args[i+1]) throw new Error("Usage: node scripts/sackmann-import.mjs --tour atp|wta --input-dir PATH --output PATH");
    opts[key.slice(2)]=args[++i];
  }
  if(!opts.tour||!opts["input-dir"]||!opts.output) throw new Error("Usage: node scripts/sackmann-import.mjs --tour atp|wta --input-dir PATH --output PATH");
  const prefix=opts.tour+"_matches_";
  const files=(await readdir(opts["input-dir"])).filter(name=>new RegExp("^"+prefix+"\\d{4}\\.csv$","i").test(name)).sort();
  if(!files.length) throw new Error("No yearly "+opts.tour.toUpperCase()+" match CSV files found in "+opts["input-dir"]);
  const all=[];
  for(const file of files){
    const rows=parseCsv(await readFile(join(opts["input-dir"],file),"utf8"));
    all.push(...rows);
    console.error("Loaded "+rows.length+" rows from "+basename(file));
  }
  const result=normalizeSackmannRows(all,opts.tour);
  await writeFile(opts.output,toCsv(result.rows),"utf8");
  console.log(JSON.stringify({tour:opts.tour,sourceFiles:files.length,sourceRows:all.length,normalizedRows:result.rows.length,excluded:result.excluded,output:opts.output},null,2));
  console.error("Research import only. Keep source CSVs and generated data outside the public repository.");
}
if(import.meta.url===`file://${process.argv[1]}`) await main();
