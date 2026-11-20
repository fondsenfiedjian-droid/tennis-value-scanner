#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const FILES = [
  "matches",
  "stats-Overview",
  "stats-Rally",
  "stats-ServeBasics",
  "stats-ReturnDepth",
  "stats-ReturnOutcomes",
  "stats-ShotTypes",
  "stats-ShotDirection",
  "stats-ServeDirection",
  "stats-ServeInfluence",
  "stats-NetPoints"
];
const TOURS = ["m", "w"];
const text = value => String(value ?? "").trim();
const validDate = value => /^\d{8}$/.test(text(value)) &&
  Number(text(value).slice(0,4)) >= 1900 &&
  Number(text(value).slice(4,6)) >= 1 && Number(text(value).slice(4,6)) <= 12 &&
  Number(text(value).slice(6,8)) >= 1 && Number(text(value).slice(6,8)) <= 31;


function parseChartingCsv(source) {
  source = source.replace(/^\\uFEFF/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); if (row.some(value => value !== "")) rows.push(row); row = []; };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"' && [",", "\\n", "\\r", undefined].includes(source[i + 1])) quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ",") pushField();
    else if (ch === "\\n") pushRow();
    else if (ch === "\\r" && source[i + 1] === "\\n") { /* CRLF */ }
    else if (ch === "\\r") field += ch;
    else field += ch;
  }
  if (quoted) throw new SyntaxError("Unterminated quoted field in Match Charting CSV");
  if (field !== "" || row.length) pushRow();
  if (!rows.length) return [];
  const rawHeaders = rows.shift();
  const headerCounts = new Map();
  const headers = rawHeaders.map((header, index) => {
    const base = header || `__unnamed_${index + 1}`;
    const count = (headerCounts.get(base) || 0) + 1;
    headerCounts.set(base, count);
    return count === 1 ? base : `${base}__duplicate_${count}`;
  });
  return rows.map((values, index) => {
    if (values.length > headers.length) throw new SyntaxError(`CSV row ${index + 2} has more fields than the header`);
    return Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ""]));
  });
}

function summarizeFile(path, rows, matchIds) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const ids = rows.map(row => text(row.match_id)).filter(Boolean);
  const idSet = new Set(ids);
  const duplicates = ids.length - idSet.size;
  const nonEmptyByColumn = Object.fromEntries(headers.map(header => [
    header, rows.reduce((count, row) => count + (text(row[header]) ? 1 : 0), 0)
  ]));
  return {
    file: basename(path),
    rows: rows.length,
    columns: headers.length,
    headers,
    matchIdRows: ids.length,
    uniqueMatchIds: idSet.size,
    duplicateMatchIdRows: duplicates,
    rowsWithoutMatchId: rows.length - ids.length,
    metadataMatchCoverage: matchIds ? {
      matchedUniqueIds: [...idSet].filter(id => matchIds.has(id)).length,
      unmatchedUniqueIds: [...idSet].filter(id => !matchIds.has(id)).length,
      metadataCoveragePct: idSet.size ? Number((100 * [...idSet].filter(id => matchIds.has(id)).length / idSet.size).toFixed(2)) : null
    } : null,
    nonEmptyByColumn
  };
}

export function auditMatchChartingFiles(filesByName) {
  const report = {
    schemaVersion: 1,
    source: "Jeff Sackmann Tennis Abstract Match Charting Project",
    sourceCommit: "1813a1309b7ed7ebf1c7e884b32bf675d00e4edf",
    license: "CC BY-NC-SA 4.0; attribution required; non-commercial only; share-alike",
    tours: {},
    warnings: [
      "Crowdsourced and selectively charted sample; not representative of the full ATP/WTA calendar.",
      "Match-level charting coverage is not proof that every point or every stat family is present.",
      "Research-only: do not activate player-style features in production from coverage counts alone."
    ]
  };
  for (const tour of TOURS) {
    const metadataName = `charting-${tour}-matches.csv`;
    const metadata = filesByName[metadataName];
    if (typeof metadata !== "string") throw new Error(`Missing required file: ${metadataName}`);
    const matchRows = parseChartingCsv(metadata);
    const ids = matchRows.map(row => text(row.match_id)).filter(Boolean);
    const matchIds = new Set(ids);
    const dates = matchRows.map(row => text(row.Date)).filter(validDate).sort();
    const surfaces = {};
    const hands = { player1: {}, player2: {} };
    for (const row of matchRows) {
      const surface = text(row.Surface) || "Unknown";
      surfaces[surface] = (surfaces[surface] || 0) + 1;
      const h1 = text(row["Pl 1 hand"]) || "Unknown";
      const h2 = text(row["Pl 2 hand"]) || "Unknown";
      hands.player1[h1] = (hands.player1[h1] || 0) + 1;
      hands.player2[h2] = (hands.player2[h2] || 0) + 1;
    }
    const files = [];
    for (const suffix of FILES.slice(1)) {
      const name = `charting-${tour}-${suffix}.csv`;
      if (typeof filesByName[name] !== "string") throw new Error(`Missing required file: ${name}`);
      files.push(summarizeFile(name, parseChartingCsv(filesByName[name]), matchIds));
    }
    const metadataDuplicates = ids.length - matchIds.size;
    report.tours[tour === "m" ? "ATP" : "WTA"] = {
      metadata: {
        rows: matchRows.length,
        uniqueMatchIds: matchIds.size,
        duplicateMatchIdRows: metadataDuplicates,
        validDateRows: dates.length,
        dateRange: dates.length ? { from: dates[0], to: dates.at(-1) } : null,
        surfaceCounts: surfaces,
        playerHandCounts: hands
      },
      statFiles: files
    };
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const output = outIndex >= 0 ? args[outIndex + 1] : "match-charting-audit.json";
  const paths = args.filter((arg, index) => arg !== "--out" && index !== outIndex + 1);
  if (!paths.length) throw new Error("Usage: node scripts/match-charting-audit.mjs --out report.json <csv files...>");
  const files = {};
  for (const path of paths) files[basename(path)] = await readFile(path, "utf8");
  const report = auditMatchChartingFiles(files);
  await writeFile(output, JSON.stringify(report, null, 2) + "\\n");
  for (const [tour, data] of Object.entries(report.tours)) {
    console.log(`${tour}: ${data.metadata.uniqueMatchIds} unique charted matches; ${data.metadata.dateRange?.from ?? "?"}–${data.metadata.dateRange?.to ?? "?"}`);
    for (const file of data.statFiles) console.log(`  ${file.file}: ${file.rows} rows, ${file.metadataMatchCoverage?.metadataCoveragePct ?? "n/a"}% metadata ID coverage`);
  }
  console.log(`Wrote aggregate audit: ${output}`);
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
