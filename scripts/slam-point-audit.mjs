#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const PINNED_COMMIT = "83733587353df8a41f2fd4f516147d5aa83f5a8d";
const MATCH_FILE = /^(\d{4})-(ausopen|frenchopen|wimbledon|usopen)-matches\.csv$/i;
const POINT_FILE = /^(\d{4})-(ausopen|frenchopen|wimbledon|usopen)-points\.csv$/i;
const CANDIDATE_FIELD = /(serve|speed|rally|distance|depth|return|winner|ace|double|fault|error|shot|point)/i;

function summarizeEvent(matchRows, pointRows, year, slam) {
  const matchIds = new Set();
  let matchRowsWithoutId = 0;
  const matchMeta = {};
  const metaFields = ["player1","player2","winner","status","event_name","round","court_name","court_id","player1id","player2id"];
  for (const field of metaFields) matchMeta[field] = 0;
  for (const row of matchRows) {
    const id = String(row.match_id ?? "").trim();
    if (id) matchIds.add(id); else matchRowsWithoutId++;
    for (const field of metaFields) if (String(row[field] ?? "").trim()) matchMeta[field]++;
  }

  const pointMatchCounts = new Map();
  const fieldStats = new Map();
  let pointRowsWithoutId = 0;
  for (const row of pointRows) {
    const id = String(row.match_id ?? "").trim();
    if (!id) pointRowsWithoutId++;
    else pointMatchCounts.set(id, (pointMatchCounts.get(id) || 0) + 1);
    for (const [field, value] of Object.entries(row)) {
      if (!CANDIDATE_FIELD.test(field)) continue;
      if (!fieldStats.has(field)) fieldStats.set(field, { nonEmpty: 0, numeric: 0, zeros: 0 });
      const stat = fieldStats.get(field);
      const v = String(value ?? "").trim();
      if (!v) continue;
      stat.nonEmpty++;
      const n = Number(v);
      if (Number.isFinite(n)) {
        stat.numeric++;
        if (n === 0) stat.zeros++;
      }
    }
  }
  const pointIds = new Set(pointMatchCounts.keys());
  const matchedIds = [...pointIds].filter(id => matchIds.has(id)).length;
  const matchIdsWithoutPoints = [...matchIds].filter(id => !pointIds.has(id)).length;
  const totalPointsForMatched = [...pointMatchCounts].filter(([id]) => matchIds.has(id)).reduce((sum, [, count]) => sum + count, 0);
  const fields = Object.fromEntries([...fieldStats.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([field,s]) => [
    field, {
      nonEmpty: s.nonEmpty,
      nonEmptyPct: pointRows.length ? Number((100*s.nonEmpty/pointRows.length).toFixed(2)) : null,
      numericValues: s.numeric,
      zeroValues: s.zeros,
      zeroPctOfNumeric: s.numeric ? Number((100*s.zeros/s.numeric).toFixed(2)) : null
    }
  ]));
  return {
    year, slam, matchRows: matchRows.length, uniqueMatchIds: matchIds.size, matchRowsWithoutId,
    matchMetadataCompletenessPct: Object.fromEntries(metaFields.map(field => [field, matchRows.length ? Number((100*matchMeta[field]/matchRows.length).toFixed(2)) : null])),
    pointRows: pointRows.length, pointRowsWithoutId, uniquePointMatchIds: pointIds.size,
    pointMatchIdsLinkedToMetadata: matchedIds, orphanPointMatchIds: pointIds.size - matchedIds,
    metadataMatchIdsWithoutPoints: matchIdsWithoutPoints,
    meanPointsPerLinkedMatch: matchedIds ? Number((totalPointsForMatched/matchedIds).toFixed(1)) : null,
    candidateFields: fields
  };
}

export function auditSlamPointFiles(files) {
  if (!Array.isArray(files) || !files.length) throw new Error("No Slam point-by-point files supplied");
  const grouped = new Map();
  for (const file of files) {
    const name = basename(file.filename);
    const match = name.match(MATCH_FILE);
    const point = name.match(POINT_FILE);
    if (!match && !point) throw new Error("Unexpected Slam point-by-point filename: " + name);
    const parsed = match || point;
    const key = parsed[1] + "-" + parsed[2].toLowerCase();
    if (!grouped.has(key)) grouped.set(key, { year: parsed[1], slam: parsed[2].toLowerCase(), matches: null, points: null });
    grouped.get(key)[match ? "matches" : "points"] = file.content;
  }
  const events = [];
  for (const [key, group] of [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b))) {
    if (typeof group.matches !== "string" || typeof group.points !== "string") throw new Error("Missing match or point file for event " + key);
    events.push(summarizeEvent(parseCsv(group.matches), parseCsv(group.points), group.year, group.slam));
  }
  const totals = events.reduce((sum,e)=>({
    events:sum.events+1, matchRows:sum.matchRows+e.matchRows, uniqueMatchIds:sum.uniqueMatchIds+e.uniqueMatchIds,
    pointRows:sum.pointRows+e.pointRows, pointMatchIdsLinkedToMetadata:sum.pointMatchIdsLinkedToMetadata+e.pointMatchIdsLinkedToMetadata,
    orphanPointMatchIds:sum.orphanPointMatchIds+e.orphanPointMatchIds, metadataMatchIdsWithoutPoints:sum.metadataMatchIdsWithoutPoints+e.metadataMatchIdsWithoutPoints
  }),{events:0,matchRows:0,uniqueMatchIds:0,pointRows:0,pointMatchIdsLinkedToMetadata:0,orphanPointMatchIds:0,metadataMatchIdsWithoutPoints:0});
  const fields = {};
  for (const event of events) for (const [field, stat] of Object.entries(event.candidateFields)) {
    if (!fields[field]) fields[field] = { eventsPresent:0, totalNonEmpty:0, totalPointRows:0, totalNumeric:0, totalZeros:0 };
    const f=fields[field]; f.eventsPresent++; f.totalNonEmpty+=stat.nonEmpty; f.totalPointRows+=event.pointRows; f.totalNumeric+=stat.numericValues; f.totalZeros+=stat.zeroValues;
  }
  for (const f of Object.values(fields)) {
    f.nonEmptyPct = f.totalPointRows ? Number((100*f.totalNonEmpty/f.totalPointRows).toFixed(2)) : null;
    f.zeroPctOfNumeric = f.totalNumeric ? Number((100*f.totalZeros/f.totalNumeric).toFixed(2)) : null;
  }
  return {
    schemaVersion:1,
    source:"Jeff Sackmann Grand Slam point-by-point archive",
    sourceCommit:PINNED_COMMIT,
    license:"CC BY-NC-SA 4.0; attribution required; non-commercial only; share-alike",
    scope:"Singles main-draw Slam match and point CSVs only; doubles and mixed doubles excluded",
    totals, fieldAvailability:fields, events,
    warnings:[
      "Coverage is selective: most missing matches are first-round matches or courts without tracking systems.",
      "Field availability and meaning vary by Slam and year; zero values can be sentinels, not measured zeros.",
      "Do not impute missing serve speed, rally length, distance or depth as player performance.",
      "Research-only: no production feature activation from this coverage audit."
    ]
  };
}

async function main() {
  const args=process.argv.slice(2); let dir="",out="slam-point-audit.json";
  for(let i=0;i<args.length;i++){if(args[i]==="--input-dir")dir=args[++i];else if(args[i]==="--out")out=args[++i];else throw new Error("Usage: node scripts/slam-point-audit.mjs --input-dir DIR --out report.json");}
  if(!dir)throw new Error("Missing --input-dir");
  const names=(await readdir(dir)).filter(n=>MATCH_FILE.test(n)||POINT_FILE.test(n)).sort();
  const files=[];
  for(const name of names) files.push({filename:name,content:await readFile(join(dir,name),"utf8")});
  const report=auditSlamPointFiles(files);
  await writeFile(out,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report.totals));
  console.log("Wrote aggregate-only Slam point audit: "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
