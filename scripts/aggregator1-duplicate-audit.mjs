#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const FILE=/^valuebetennis-matchs-(\d{4})\.csv$/i;
const norm=v=>String(v??"").normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;

export function auditValuebetDuplicates(files){
  if(!files.length)throw new Error("Valuebetennis files are required");
  const ids=new Map(),fingerprints=new Map(),byYear={},byTour={};
  const totals={rows:0,rowsWithMatchId:0,missingMatchId:0,duplicateMatchIdRows:0,duplicateMatchIdGroups:0,conflictingMatchIdGroups:0,duplicateFingerprintRows:0,duplicateFingerprintGroups:0,duplicateFingerprintScoreConflictGroups:0,duplicateFingerprintScoreOrientationOnlyGroups:0,duplicateFingerprintScoreMaterialConflictGroups:0,duplicateFingerprintScoreUnresolvedGroups:0,duplicateFingerprintWinnerConflictGroups:0,duplicateFingerprintWinnerSamePlayerGroups:0,duplicateFingerprintWinnerDifferentPlayerGroups:0,duplicateFingerprintWinnerUnresolvedGroups:0,duplicateFingerprintIdenticalPayloadGroups:0,invalidCoreRows:0};
  const required=["match_id","date","genre","surface","joueur1","joueur2"];
  let columns=[];
  for(const file of files){
    const m=basename(file.filename).match(FILE);
    if(!m)throw new Error("Unexpected Valuebetennis filename: "+basename(file.filename));
    const rows=parseCsv(file.content,{delimiter:";"});
    if(!columns.length)columns=Object.keys(rows[0]||{});
    for(const key of required)if(!columns.includes(key))throw new Error("Missing required column: "+key);
    const year=m[1],yb=byYear[year]||(byYear[year]={rows:0,rowsInDuplicateMatchIdGroups:0,rowsInDuplicateFingerprintGroups:0,invalidCoreRows:0});
    for(const row of rows){
      totals.rows++;yb.rows++;
      const tour=String(row.genre??"").trim().toUpperCase()||"(empty)";
      const tb=byTour[tour]||(byTour[tour]={rows:0,rowsInDuplicateMatchIdGroups:0,rowsInDuplicateFingerprintGroups:0,invalidCoreRows:0});
      tb.rows++;
      const id=String(row.match_id??"").trim();
      if(id){totals.rowsWithMatchId++;if(!ids.has(id))ids.set(id,[]);ids.get(id).push({year,tour,row});}
      else{totals.missingMatchId++;}
      const date=String(row.date??"").trim().slice(0,10);
      const p1=norm(row.joueur1),p2=norm(row.joueur2),surface=norm(row.surface);
      const eventId=String(row.tournoi_id??"").trim();
      const event=eventId?"id:"+eventId:"name:"+norm(row.tournoi);
      if(!date||!p1||!p2||p1===p2||!surface||!event){
        totals.invalidCoreRows++;yb.invalidCoreRows++;tb.invalidCoreRows++;continue;
      }
      const pair=[p1,p2].sort().join("|");
      const fingerprint=[tour,date,event,surface,pair].join("::");
      if(!fingerprints.has(fingerprint))fingerprints.set(fingerprint,[]);
      fingerprints.get(fingerprint).push({year,tour,row,id});
    }
  }
  for(const [id,group] of ids){
    if(group.length<2)continue;
    totals.duplicateMatchIdGroups++;
    totals.duplicateMatchIdRows+=group.length-1;
    const signatures=new Set(group.map(x=>[x.tour,String(x.row.date??"").slice(0,10),norm(x.row.tournoi),norm(x.row.joueur1),norm(x.row.joueur2),norm(x.row.surface)].join("::")));
    if(signatures.size>1)totals.conflictingMatchIdGroups++;
    for(const x of group){byYear[x.year].rowsInDuplicateMatchIdGroups++;byTour[x.tour].rowsInDuplicateMatchIdGroups++;}
  }
  const scoreFields=columns.filter(k=>/score|set[1-5]|result/i.test(k));
  const winnerFields=columns.filter(k=>/winner|vainqueur|gagnant/i.test(k));
  for(const group of fingerprints.values()){
    if(group.length<2)continue;
    totals.duplicateFingerprintGroups++;
    totals.duplicateFingerprintRows+=group.length-1;
    const hasConflict=fields=>fields.some(field=>new Set(group.map(x=>String(x.row[field]??"").trim()).filter(Boolean)).size>1);
    if(hasConflict(scoreFields)){
      totals.duplicateFingerprintScoreConflictGroups++;
      const scoreValues=group.map(x=>String(x.row.score??"").trim()).filter(Boolean);
      const reverseScore=value=>value.replace(/(\\d+)-(\\d+)(\\(\\d+\\))?/g,(_,a,b,tie)=>b+"-"+a+(tie||""));
      const canonicalScores=scoreValues.map(value=>[value,reverseScore(value)].sort()[0]);
      if(scoreValues.length!==group.length||canonicalScores.some(value=>!value))totals.duplicateFingerprintScoreUnresolvedGroups++;
      else if(new Set(canonicalScores).size===1)totals.duplicateFingerprintScoreOrientationOnlyGroups++;
      else totals.duplicateFingerprintScoreMaterialConflictGroups++;
    }
    if(hasConflict(winnerFields)){
      totals.duplicateFingerprintWinnerConflictGroups++;
      const winnerNames=new Set(),unresolved=[];
      for(const x of group){
        const winnerId=String(x.row.vainqueur_id??x.row.winner_id??"").trim();
        const p1=String(x.row.joueur1_id??"").trim(),p2=String(x.row.joueur2_id??"").trim();
        const winnerName=winnerId&&winnerId===p1?norm(x.row.joueur1):winnerId&&winnerId===p2?norm(x.row.joueur2):"";
        if(winnerName)winnerNames.add(winnerName);else unresolved.push(x);
      }
      if(unresolved.length)totals.duplicateFingerprintWinnerUnresolvedGroups++;
      else if(winnerNames.size===1)totals.duplicateFingerprintWinnerSamePlayerGroups++;
      else if(winnerNames.size>1)totals.duplicateFingerprintWinnerDifferentPlayerGroups++;
    }
    const payloads=new Set(group.map(x=>{
      const payload=Object.fromEntries(Object.entries(x.row).filter(([key])=>key!=="match_id").sort(([a],[b])=>a.localeCompare(b)));
      return JSON.stringify(payload);
    }));
    if(payloads.size===1)totals.duplicateFingerprintIdenticalPayloadGroups++;
    for(const x of group){byYear[x.year].rowsInDuplicateFingerprintGroups++;byTour[x.tour].rowsInDuplicateFingerprintGroups++;}
  }
  return {
    schemaVersion:1,
    purpose:"Aggregate-only duplicate and integrity audit; no match IDs, player names, or row-level records are exported.",
    sources:{files:files.map(x=>basename(x.filename)).sort(),columns},
    totals:{...totals,matchIdCoveragePct:pct(totals.rowsWithMatchId,totals.rows),duplicateMatchIdRowPct:pct(totals.duplicateMatchIdRows,totals.rows),duplicateFingerprintRowPct:pct(totals.duplicateFingerprintRows,totals.rows)},
    byYear,byTour,
    methods:{
      matchId:"Repeated source match_id across all input years; conflicting groups have more than one tour/date/event/player-pair/surface signature.",
      fingerprint:"Same tour, calendar date, tournament_id (preferred) or normalized tournament name, surface, and unordered normalized player pair. This is a duplicate candidate, not an automatic deletion rule.",
      payloadComparison:{scoreFields,winnerFields,scoreOrientationMethod:"For detected score strings, reverse every numeric set score (a-b to b-a); if all group rows share one canonical string after allowing this reversal, classify as orientation-only. Other formats or missing scores remain unresolved.",winnerIdentityMethod:"vainqueur_id (or winner_id) is matched to joueur1_id/joueur2_id and converted to the normalized player side; no player name or ID is exported.",identicalPayload:"All columns except match_id are byte-for-byte equal after CSV parsing; this is a strong duplicate signal, not an automatic deletion rule.",conflicts:"A score or winner conflict means the corresponding detected field has more than one non-empty normalized value within the same fingerprint group."},
      exclusions:"Rows with missing date/player pair/surface/event or identical normalized player names are counted as invalid core rows and excluded from composite fingerprinting."
    },
    warnings:["Repeated composite fingerprints may represent genuine same-day repeats or source revisions; inspect before deduplication.","Match IDs are checked across all yearly files; do not assume they are globally unique until this report is reviewed."]
  };
}

async function main(){
  const args=process.argv.slice(2);let dir="",out="aggregator1-duplicate-audit.json";
  for(let i=0;i<args.length;i++){if(args[i]==="--valuebet-dir")dir=args[++i];else if(args[i]==="--out")out=args[++i];else throw new Error("Usage: node scripts/aggregator1-duplicate-audit.mjs --valuebet-dir DIR [--out report.json]");}
  if(!dir)throw new Error("Valuebetennis directory is required");
  const names=(await readdir(dir)).filter(n=>FILE.test(n)).sort();
  const files=[];for(const n of names)files.push({filename:n,content:await readFile(join(dir,n),"utf8")});
  const report=auditValuebetDuplicates(files);
  await writeFile(out,JSON.stringify(report,null,2)+"\n");
  console.log("Valuebetennis duplicate audit: "+JSON.stringify(report.totals));
  console.log("Aggregate duplicate report written to "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
