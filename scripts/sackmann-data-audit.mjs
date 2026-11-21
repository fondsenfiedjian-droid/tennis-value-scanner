#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";

const SURFACES = new Set(["Hard", "Clay", "Grass", "Carpet"]);
const COUNT_FIELDS = [
  "w_ace","w_df","w_svpt","w_1stIn","w_1stWon","w_2ndWon","w_SvGms","w_bpSaved","w_bpFaced",
  "l_ace","l_df","l_svpt","l_1stIn","l_1stWon","l_2ndWon","l_SvGms","l_bpSaved","l_bpFaced"
];
const number = value => value === "" || value == null ? null : Number(value);
const validCount = value => Number.isInteger(number(value)) && number(value) >= 0;
const validPositive = value => Number.isInteger(number(value)) && number(value) > 0;
const validAge = value => Number.isFinite(number(value)) && number(value) >= 13 && number(value) <= 60;
const validDate = value => {
  const raw=String(value ?? "");
  if(!/^\d{8}$/.test(raw))return false;
  const year=Number(raw.slice(0,4)),month=Number(raw.slice(4,6)),day=Number(raw.slice(6,8));
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
};

function validSide(prefix, row) {
  const svpt = number(row[prefix + "_svpt"]);
  const firstIn = number(row[prefix + "_1stIn"]);
  const firstWon = number(row[prefix + "_1stWon"]);
  const secondWon = number(row[prefix + "_2ndWon"]);
  return Number.isInteger(svpt) && svpt > 0 &&
    Number.isInteger(firstIn) && firstIn >= 0 && firstIn <= svpt &&
    Number.isInteger(firstWon) && firstWon >= 0 && firstWon <= firstIn &&
    Number.isInteger(secondWon) && secondWon >= 0 && firstWon + secondWon <= svpt;
}

function blankCounts() {
  return {
    rows: 0, validMatches: 0, excludedRows: 0,
    statsBothSides: 0, statsCoreBothSides: 0, rankBoth: 0,
    ageBoth: 0, handBoth: 0, surfaceKnown: 0, durationKnown: 0,
    firstDate: null, lastDate: null,
    columns: Object.fromEntries(COUNT_FIELDS.map(field => [field, 0]))
  };
}

function addRow(summary, row) {
  summary.rows++;
  const winner = String(row.winner_id ?? ""), loser = String(row.loser_id ?? "");
  const standard = validDate(row.tourney_date) && /^\d+$/.test(winner) &&
    /^\d+$/.test(loser) && winner !== loser &&
    !/\b(?:W\/O|RET|ABD|DEF|DEFAULT)\b/i.test(String(row.score ?? ""));
  if (!standard) { summary.excludedRows++; return; }
  summary.validMatches++;
  const date = String(row.tourney_date);
  if (!summary.firstDate || date < summary.firstDate) summary.firstDate = date;
  if (!summary.lastDate || date > summary.lastDate) summary.lastDate = date;
  if (SURFACES.has(row.surface)) summary.surfaceKnown++;
  if (Number.isFinite(number(row.minutes)) && number(row.minutes) >= 1 && number(row.minutes) <= 600) summary.durationKnown++;
  if (validPositive(row.winner_rank) && validPositive(row.loser_rank)) summary.rankBoth++;
  if (validAge(row.winner_age) && validAge(row.loser_age)) summary.ageBoth++;
  if (["R","L"].includes(row.winner_hand) && ["R","L"].includes(row.loser_hand)) summary.handBoth++;
  const winnerStats = validSide("w", row), loserStats = validSide("l", row);
  if (winnerStats && loserStats) summary.statsCoreBothSides++;
  const fullStats = winnerStats && loserStats && [
    "w_ace","w_df","w_SvGms","w_bpSaved","w_bpFaced",
    "l_ace","l_df","l_SvGms","l_bpSaved","l_bpFaced"
  ].every(field => validCount(row[field])) &&
    ["w","l"].every(prefix => {
      const svpt=number(row[prefix+"_svpt"]);
      const ace=number(row[prefix+"_ace"]),df=number(row[prefix+"_df"]);
      const bpSaved=number(row[prefix+"_bpSaved"]),bpFaced=number(row[prefix+"_bpFaced"]);
      // Aces and double faults are distinct service points; break points faced
      // are a subset of service points. Reject impossible denominators.
      return ace+df<=svpt && bpSaved<=bpFaced && bpFaced<=svpt;
    });
  if (fullStats) summary.statsBothSides++;
  for (const field of COUNT_FIELDS) if (validCount(row[field])) summary.columns[field]++;
}

function pct(count, total) { return total ? Number((100 * count / total).toFixed(2)) : null; }
function format(summary) {
  const { columns, ...counts } = summary;
  const n = counts.validMatches;
  return {
    ...counts,
    coveragePct: {
      servePointsAnd1st2ndWonBothPlayers: pct(counts.statsCoreBothSides,n),
      fullServeAndBreakPointStatsBothPlayers: pct(counts.statsBothSides,n),
      rankingBothPlayers: pct(counts.rankBoth,n),
      ageBothPlayers: pct(counts.ageBoth,n),
      handednessBothPlayers: pct(counts.handBoth,n),
      knownSurface: pct(counts.surfaceKnown,n),
      knownDuration: pct(counts.durationKnown,n)
    },
    columnCoveragePct: Object.fromEntries(Object.entries(columns).map(([field,count]) => [field,pct(count,n)]))
  };
}

export function auditSackmannFiles(files) {
  const byTourYear = new Map(), byTourSurface = new Map(), totals = new Map();
  const fileSummaries = [];
  for (const file of files) {
    const match = String(file.filename).match(/(?:^|\/)(atp|wta)_matches_(\d{4})\.csv$/i);
    if (!match) throw new Error("Unrecognized Sackmann match filename: " + file.filename);
    const tour = match[1].toUpperCase(), year = match[2];
    const rows = parseCsv(file.content);
    const summary = blankCounts();
    const surfaces = new Map();
    const levels = new Map();
    for (const row of rows) {
      addRow(summary,row);
      const surface = SURFACES.has(row.surface) ? row.surface : "Unknown";
      if (!surfaces.has(surface)) surfaces.set(surface,blankCounts());
      addRow(surfaces.get(surface),row);
      const level = String(row.tourney_level || "Unknown");
      if (!levels.has(level)) levels.set(level,blankCounts());
      addRow(levels.get(level),row);
    }
    const key = tour + ":" + year;
    byTourYear.set(key,{tour,year,...format(summary)});
    if (!totals.has(tour)) totals.set(tour,blankCounts());
    // Aggregate raw counters, not percentages.
    const total = totals.get(tour);
    for (const field of ["rows","validMatches","excludedRows","statsBothSides","statsCoreBothSides","rankBoth","ageBoth","handBoth","surfaceKnown","durationKnown"]) total[field]+=summary[field];
    for (const field of COUNT_FIELDS) total.columns[field]+=summary.columns[field];
    if (summary.firstDate && (!total.firstDate || summary.firstDate < total.firstDate)) total.firstDate=summary.firstDate;
    if (summary.lastDate && (!total.lastDate || summary.lastDate > total.lastDate)) total.lastDate=summary.lastDate;
    for (const [surface,part] of surfaces) {
      const surfaceKey=tour+":"+surface;
      if(!byTourSurface.has(surfaceKey))byTourSurface.set(surfaceKey,{tour,surface,counts:blankCounts()});
      const target=byTourSurface.get(surfaceKey).counts;
      for(const field of ["rows","validMatches","excludedRows","statsBothSides","statsCoreBothSides","rankBoth","ageBoth","handBoth","surfaceKnown","durationKnown"])target[field]+=part[field];
      for(const field of COUNT_FIELDS)target.columns[field]+=part.columns[field];
    }
    fileSummaries.push({tour,year,filename:String(file.filename).split("/").at(-1),...format(summary),
      tournamentLevels:Object.fromEntries([...levels.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([level,value])=>[level,format(value)]))});
  }
  const tourTotals=Object.fromEntries([...totals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([tour,value])=>[tour,format(value)]));
  return {
    schemaVersion:1,
    source:"Jeff Sackmann / Tennis Abstract ATP and WTA match datasets",
    sourceRepositories:["https://github.com/JeffSackmann/tennis_atp","https://github.com/JeffSackmann/tennis_wta"],
    archiveMirror:"https://github.com/Aneeshers/tennis-sackmann-archive",
    dataLicense:"Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)",
    reportLicense:"CC BY-NC-SA 4.0",
    attribution:"Data compiled by Jeff Sackmann / Tennis Abstract. This audit uses an archival mirror; no raw match rows or player-level records are included in the report.",
    filesProcessed:files.length,
    tours:Object.keys(tourTotals),
    totals:tourTotals,
    byTourYear:fileSummaries.sort((a,b)=>a.tour.localeCompare(b.tour)||a.year.localeCompare(b.year)),
    byTourSurface:[...byTourSurface.values()].sort((a,b)=>a.tour.localeCompare(b.tour)||a.surface.localeCompare(b.surface)).map(item=>({tour:item.tour,surface:item.surface,...format(item.counts)})),
    limitations:[
      "Match statistics are not complete for every match or tour; coverage is measured rather than assumed.",
      "WTA serve/return statistics may be absent even when match results, rankings and ages are present.",
      "Serve and return statistics describe completed matches. Any later predictive feature must use only statistics from matches completed before the prediction date.",
      "The source is non-commercial (CC BY-NC-SA 4.0). This research workflow is not production integration and must not be used commercially without separate permission."
    ]
  };
}

async function main() {
  const args=process.argv.slice(2),files=[];
  let output="sackmann-data-audit.json";
  for(let i=0;i<args.length;i++){
    if(args[i]==="--out"){if(!args[i+1])throw new Error("Missing output path");output=args[++i];}
    else if(args[i].startsWith("--"))throw new Error("Unknown option: "+args[i]);
    else files.push(args[i]);
  }
  if(!files.length)throw new Error("Usage: node scripts/sackmann-data-audit.mjs [--out report.json] atp_matches_YYYY.csv wta_matches_YYYY.csv ...");
  const inputs=[];
  for(const filename of files){inputs.push({filename,content:await readFile(filename,"utf8")});console.error("Loaded "+filename);}
  const report=auditSackmannFiles(inputs);
  await writeFile(output,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  console.error("Audit only: no match-level data is written to the report; no production model is changed.");
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1]))await main();
