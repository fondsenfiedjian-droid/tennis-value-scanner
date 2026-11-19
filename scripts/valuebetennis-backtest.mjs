#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseCsv, runBacktest } from "./backtest.mjs";

const REQUIRED = ["match_id","date","tournoi_id","genre","surface","joueur1_id","joueur2_id","vainqueur_id","score"];
const SURFACES = new Map([["hard","Hard"],["clay","Clay"],["grass","Grass"],["carpet","Carpet"]]);
const ODDS_FIELDS = {
  opening: ["cote1_ouverture", "cote2_ouverture"],
  closing: ["cote1_cloture", "cote2_cloture"]
};
function parseOdds(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 && n <= 100 ? n : null;
}
function marketBenchmark(rows, fields) {
  let valid = 0, invalid = 0, overround = 0, favouriteWins = 0, decisiveFavourite = 0, excludedNonstandard = 0;
  let brier = 0, logLoss = 0;
  for (const row of rows) {
    if (/\b(?:W\/O|RET|ABD|DEF|DEFAULT)\b/i.test(String(row.score ?? ""))) { excludedNonstandard++; continue; }
    const [field1, field2] = fields;
    const odds1 = parseOdds(row[field1]), odds2 = parseOdds(row[field2]);
    if (!odds1 || !odds2) { invalid++; continue; }
    const implied1 = 1 / odds1, implied2 = 1 / odds2, total = implied1 + implied2;
    const p1 = implied1 / total, outcome1 = String(row.vainqueur_id) === String(row.joueur1_id) ? 1 : 0;
    const favourite = odds1 === odds2 ? null : odds1 < odds2 ? 1 : 2;
    valid++;
    overround += total - 1;
    brier += (p1 - outcome1) ** 2;
    const p = Math.min(1 - 1e-12, Math.max(1e-12, p1));
    logLoss -= outcome1 * Math.log(p) + (1 - outcome1) * Math.log(1 - p);
    if (favourite !== null) {
      decisiveFavourite++;
      if ((favourite === 1 && outcome1 === 1) || (favourite === 2 && outcome1 === 0)) favouriteWins++;
    }
  }
  return {
    matchesWithTwoValidOdds: valid,
    matchesMissingOrInvalidOdds: invalid,
    matchesExcludedNonstandardOutcome: excludedNonstandard,
    averageOverroundPct: valid ? Number((100 * overround / valid).toFixed(3)) : null,
    marketFavouriteWinRatePct: decisiveFavourite ? Number((100 * favouriteWins / decisiveFavourite).toFixed(2)) : null,
    marketFavouriteSample: decisiveFavourite,
    noVigPlayer1ProbabilityBrier: valid ? Number((brier / valid).toFixed(5)) : null,
    noVigPlayer1ProbabilityLogLoss: valid ? Number((logLoss / valid).toFixed(5)) : null,
    note: "Descriptive market benchmark only; no simulated betting ROI and no claim of executable prices."
  };
}

function detectDelimiter(text) {
  const line=String(text).replace(/^\uFEFF/,"").split(/\r?\n/,1)[0]??"";
  let quoted=false;const counts=[[",",0],[";",0],["\t",0]];
  for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'&&line[i+1]==='"'){i++;continue;}if(ch==='"')quoted=!quoted;else if(!quoted){const x=counts.find(v=>v[0]===ch);if(x)x[1]++;}}
  counts.sort((a,b)=>b[1]-a[1]);if(!counts[0][1])throw new SyntaxError("Could not detect CSV delimiter");return counts[0][0];
}
function validDate(value){
  const raw=String(value??"").trim(),m=/^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?)?$/.exec(raw);
  if(!m)return null;const y=+m[1],mo=+m[2],d=+m[3],date=new Date(Date.UTC(y,mo-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return null;
  if(m[4]!==undefined&&(Number(m[4])>23||Number(m[5])>59||Number(m[6]??0)>59))return null;
  return m[1]+m[2]+m[3];
}
export function parseValuebetennisCsv(text){
  const delimiter=detectDelimiter(text),rows=parseCsv(text,{delimiter});
  if(!rows.length)return{rows:[],inputRows:0,rejectedRows:0,rejectedByReason:{},delimiter};
  const headers=Object.keys(rows[0]),missing=REQUIRED.filter(x=>!headers.includes(x));
  if(missing.length)throw new Error("Valuebetennis CSV missing required columns: "+missing.join(", "));
  const normalized=[],rejectedByReason={},reject=reason=>{rejectedByReason[reason]=(rejectedByReason[reason]||0)+1;};
  for(const row of rows){
    const date=validDate(row.date),p1=String(row.joueur1_id??"").trim(),p2=String(row.joueur2_id??"").trim();
    const winner=String(row.vainqueur_id??"").trim(),id=String(row.match_id??"").trim(),tour=String(row.genre??"").trim().toLowerCase();
    if(!date){reject("invalid_date");continue;}
    if(!/^\d+$/.test(p1)||Number(p1)<=0||!/^\d+$/.test(p2)||Number(p2)<=0||p1===p2){reject("invalid_player_ids");continue;}
    if(winner!==p1&&winner!==p2){reject("winner_not_in_match");continue;}
    if(!id){reject("missing_match_id");continue;}
    if(tour&&!["atp","wta"].includes(tour)){reject("unsupported_tour");continue;}
    normalized.push({tourney_date:date,tourney_id:String(row.tournoi_id??"").trim()||id,match_num:id,winner_id:winner,loser_id:winner===p1?p2:p1,score:String(row.score??"").trim(),surface:SURFACES.get(String(row.surface??"").trim().toLowerCase())??null,tour,sourceOdds:{opening1:row.cote1_ouverture??"",opening2:row.cote2_ouverture??"",closing1:row.cote1_cloture??"",closing2:row.cote2_cloture??"",player1Id:p1,winnerId:winner}});
  }
  return{rows:normalized,inputRows:rows.length,rejectedRows:Object.values(rejectedByReason).reduce((a,b)=>a+b,0),rejectedByReason,delimiter};
}
export function runValuebetennisBacktest(csvTexts,options={}){
  const inputs=Array.isArray(csvTexts)?csvTexts:[csvTexts],parsed=inputs.map(parseValuebetennisCsv),rows=parsed.flatMap(x=>x.rows),rejectedByReason={};
  const marketRows=rows.map(row=>({joueur1_id:row.sourceOdds.player1Id,vainqueur_id:row.sourceOdds.winnerId,cote1_ouverture:row.sourceOdds.opening1,cote2_ouverture:row.sourceOdds.opening2,cote1_cloture:row.sourceOdds.closing1,cote2_cloture:row.sourceOdds.closing2,score:row.score}));
  for(const item of parsed)for(const[key,count]of Object.entries(item.rejectedByReason))rejectedByReason[key]=(rejectedByReason[key]||0)+count;
  const tours=[...new Set(rows.map(x=>x.tour).filter(Boolean))].sort(),years=[...new Set(rows.map(x=>x.tourney_date.slice(0,4)))].sort();
  return{source:"Valuebetennis open data (CC BY 4.0)",inputRows:parsed.reduce((n,x)=>n+x.inputRows,0),normalizedRows:rows.length,rejectedRows:parsed.reduce((n,x)=>n+x.rejectedRows,0),rejectedByReason,delimiters:[...new Set(parsed.map(x=>x.delimiter))],tours,years:years.length?{from:years[0],to:years.at(-1),count:years.length}:null,marketBenchmarks:{opening:marketBenchmark(marketRows,ODDS_FIELDS.opening),closing:marketBenchmark(marketRows,ODDS_FIELDS.closing)},
    report:runBacktest(rows,options),importantLimit:"The source provides match results and Pinnacle opening/last pre-match odds, but no archived pre-match model probabilities or full quote capture provenance. This run measures chronological Elo prediction quality only; it does not establish betting ROI or qualify for the strict odds-backtest."};
}
async function main(){
  const args=process.argv.slice(2),options={},files=[];
  for(let i=0;i<args.length;i++){if(args[i]==="--from"||args[i]==="--to"){if(!args[i+1])throw new Error("Missing date after "+args[i]);options[args[i]==="--from"?"evaluationStart":"evaluationEnd"]=args[++i];}else if(args[i].startsWith("--from="))options.evaluationStart=args[i].slice(7);else if(args[i].startsWith("--to="))options.evaluationEnd=args[i].slice(5);else if(args[i].startsWith("--"))throw new Error("Unknown option: "+args[i]);else files.push(args[i]);}
  if(!files.length){console.error("Usage: node scripts/valuebetennis-backtest.mjs [--from YYYYMMDD] [--to YYYYMMDD] valuebetennis-matchs-2026.csv [more CSV files...]");process.exitCode=2;return;}
  const texts=[];for(const file of files){texts.push(await readFile(file,"utf8"));console.error("Loaded "+basename(file));}
  console.log(JSON.stringify(runValuebetennisBacktest(texts,options),null,2));console.error("Lower Brier/log-loss is better. This is prediction quality, not ROI.");
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1]))await main();
