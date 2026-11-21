#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseCsv } from "./backtest.mjs";
import { parseValuebetennisCsv } from "./valuebetennis-backtest.mjs";

const dayNumber = key => Date.UTC(Number(key.slice(0,4)),Number(key.slice(4,6))-1,Number(key.slice(6,8)))/86400000;
const validAge = value => Number.isFinite(Number(value)) && Number(value)>=14 && Number(value)<=65;

export function normalizePlayerName(value) {
  return String(value??"").normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase()
    .replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}

function addPlayerSide(nameToIds, ageHistory, name, id, date, age, tour) {
  const playerId=String(id??"").trim(), normalized=normalizePlayerName(name);
  if(!playerId || !normalized || !/^\d+$/.test(playerId)) return;
  const key=tour+":"+normalized;
  if(!nameToIds.has(key)) nameToIds.set(key,new Set());
  nameToIds.get(key).add(playerId);
  if(!validAge(Number(age)) || !/^\\d{8}$/.test(String(date??""))) return;
  if(!ageHistory.has(tour+":"+playerId)) ageHistory.set(tour+":"+playerId,[]);
  ageHistory.get(tour+":"+playerId).push({date:String(date),age:Number(age)});
}

function ageAsOf(history, date) {
  if(!history?.length || !/^\\d{8}$/.test(String(date??""))) return null;
  const target=dayNumber(date);
  let low=0,high=history.length;
  while(low<high){
    const mid=(low+high)>>1;
    if(dayNumber(history[mid].date)<target) low=mid+1;
    else high=mid;
  }
  if(low===0) return null;
  const sample=history[low-1];
  return sample.age+(target-dayNumber(sample.date))/365.2425;
}

export function auditAgeLinks(valuebetennisRows, sackmannRowsByTour) {
  const nameToIds=new Map(),ageHistory=new Map();
  for(const tour of ["atp","wta"]){
    for(const row of sackmannRowsByTour[tour]??[]){
      addPlayerSide(nameToIds,ageHistory,row.winner_name,row.winner_id,row.tourney_date,row.winner_age,tour);
      addPlayerSide(nameToIds,ageHistory,row.loser_name,row.loser_id,row.tourney_date,row.loser_age,tour);
    }
  }
  for(const history of ageHistory.values()){
    history.sort((a,b)=>a.date.localeCompare(b.date));
  }
  const players=new Map(),byTourYear=new Map();
  let bothAges=0,oneAge=0,noAge=0,mappedBoth=0,mappedOne=0,mappedNone=0,ambiguousSides=0;
  for(const row of valuebetennisRows){
    const tour=row.tour,year=String(row.tourney_date).slice(0,4);
    const bucketKey=tour+":"+year;
    if(!byTourYear.has(bucketKey)) byTourYear.set(bucketKey,{tour,year,matches:0,mappedBoth:0,mappedOne:0,mappedNone:0,bothAges:0,oneAge:0,noAge:0});
    const bucket=byTourYear.get(bucketKey);bucket.matches++;
    const sides=[
      {id:String(row.player1Id??""),name:row.player1Name},
      {id:String(row.player2Id??""),name:row.player2Name}
    ];
    const mapped=sides.map(side=>{
      const ids=nameToIds.get(tour+":"+normalizePlayerName(side.name));
      if(!ids || ids.size===0) return {id:null,status:"unmatched",age:null};
      if(ids.size!==1) return {id:null,status:"ambiguous",age:null};
      const id=[...ids][0];
      return {id,status:"mapped",age:ageAsOf(ageHistory.get(tour+":"+id),row.tourney_date)};
    });
    for(let i=0;i<2;i++){
      const side=sides[i],key=tour+":"+side.id;
      if(!players.has(key)) players.set(key,{tour,id:side.id,names:new Set(),status:null});
      const p=players.get(key);p.names.add(String(side.name??""));
      const ids=nameToIds.get(tour+":"+normalizePlayerName(side.name));
      const status=!ids||ids.size===0?"unmatched":ids.size>1?"ambiguous":"mapped";
      if(p.status && p.status!==status)p.status="inconsistent_name_mapping";
      else p.status=status;
      if(status==="ambiguous")ambiguousSides++;
    }
    const ageCount=mapped.filter(x=>x.age!==null).length;
    const mapCount=mapped.filter(x=>x.status==="mapped").length;
    if(mapCount===2){mappedBoth++;bucket.mappedBoth++;}
    else if(mapCount===1){mappedOne++;bucket.mappedOne++;}
    else {mappedNone++;bucket.mappedNone++;}
    if(ageCount===2){bothAges++;bucket.bothAges++;}
    else if(ageCount===1){oneAge++;bucket.oneAge++;}
    else {noAge++;bucket.noAge++;}
  }
  const playerRows=[...players.values()];
  const mappedPlayers=playerRows.filter(p=>p.status==="mapped").length;
  const ambiguousPlayers=playerRows.filter(p=>p.status==="ambiguous").length;
  const unmatchedPlayers=playerRows.filter(p=>p.status==="unmatched").length;
  const formatBucket=b=>({
    ...b,
    bothAgePct:b.matches?Number((100*b.bothAges/b.matches).toFixed(2)):null,
    anyAgePct:b.matches?Number((100*(b.bothAges+b.oneAge)/b.matches).toFixed(2)):null,
    bothMappedPct:b.matches?Number((100*b.mappedBoth/b.matches).toFixed(2)):null
  });
  return {
    source:"Valuebetennis match identities joined to Jeff Sackmann match-age records by exact normalized full name and tour",
    method:"Only unique name-to-player-id mappings are accepted. Age is taken from the latest Sackmann match strictly before the target match date, then advanced by elapsed calendar days. Same-day and future age records are excluded.",
    licenseWarning:"Sackmann source data is CC BY-NC-SA 4.0 and non-commercial. This audit is research-only; do not use the derived age feature commercially without separate permission or a separately licensed age source.",
    totals:{
      valuebetennisMatches:valuebetennisRows.length,
      uniqueValuebetennisPlayers:playerRows.length,
      uniquelyMappedPlayers:mappedPlayers,
      ambiguousPlayers,
      unmatchedPlayers,
      ambiguousPlayerSides:ambiguousSides,
      uniquePlayerMappingPct:playerRows.length?Number((100*mappedPlayers/playerRows.length).toFixed(2)):null,
      matchesBothPlayersMapped:mappedBoth,
      matchesOnePlayerMapped:mappedOne,
      matchesNeitherPlayerMapped:mappedNone,
      matchesBothAgesAvailable:bothAges,
      matchesOneAgeAvailable:oneAge,
      matchesNoAgeAvailable:noAge,
      bothAgeCoveragePct:valuebetennisRows.length?Number((100*bothAges/valuebetennisRows.length).toFixed(2)):null,
      anyAgeCoveragePct:valuebetennisRows.length?Number((100*(bothAges+oneAge)/valuebetennisRows.length).toFixed(2)):null
    },
    byTourYear:Object.fromEntries([...byTourYear.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,b])=>[key,formatBucket(b)])),
    limits:["Name matching is exact after Unicode/accent/punctuation normalization; aliases and initials are not guessed.","Same-name people that map to multiple Sackmann ids are marked ambiguous and excluded.","Age is sourced from completed historical matches and is not a birth-date lookup."]
  };
}

async function main(){
  const args=process.argv.slice(2),opts={valuebetennis:[],atp:null,wta:null,out:"sackmann-age-link-audit.json"};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==="--valuebetennis"){if(!args[i+1])throw new Error("Missing file after --valuebetennis");opts.valuebetennis.push(args[++i]);}
    else if(["--atp","--wta","--out"].includes(key)){if(!args[i+1])throw new Error("Missing value after "+key);opts[key.slice(2)]=args[++i];}
    else throw new Error("Unknown option: "+key);
  }
  if(!opts.atp||!opts.wta||!opts.valuebetennis.length)throw new Error("Usage: node scripts/sackmann-age-link-audit.mjs --atp atp-normalized.csv --wta wta-normalized.csv --valuebetennis file.csv [--valuebetennis file.csv] --out report.json");
  const valuebetennisRows=[];
  for(const file of opts.valuebetennis) valuebetennisRows.push(...parseValuebetennisCsv(await readFile(file,"utf8")).rows);
  const atp=parseCsv(await readFile(opts.atp,"utf8")),wta=parseCsv(await readFile(opts.wta,"utf8"));
  const report=auditAgeLinks(valuebetennisRows,{atp,wta});
  await writeFile(opts.out,JSON.stringify(report,null,2)+"\n","utf8");
  console.log(JSON.stringify({out:opts.out,totals:report.totals,byTourYear:report.byTourYear},null,2));
  console.error("Loaded age-link sources: "+basename(opts.atp)+", "+basename(opts.wta));
}
if(import.meta.url===`file://${process.argv[1]}`) await main();
