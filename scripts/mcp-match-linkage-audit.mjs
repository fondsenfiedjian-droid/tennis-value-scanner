#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCsv } from "./backtest.mjs";

export const MCP_SOURCE_COMMIT = "1813a1309b7ed7ebf1c7e884b32bf675d00e4edf";
export const SACKMANN_SOURCE_COMMIT = "83733587353df8a41f2fd4f516147d5aa83f5a8d";
const text = value => String(value ?? "").trim();
const token = value => text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const player = value => text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const alias = value => {
  const parts = player(value).split(" ").filter(Boolean);
  return parts.length >= 2 ? parts[0][0] + parts.at(-1) : "";
};
const pair = (a, b) => a < b ? a + "|" + b : b + "|" + a;
const validDate = value => {
  const s = text(value);
  if (!/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4)), m = Number(s.slice(4, 6)), d = Number(s.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? s : null;
};
const day = value => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8))) / 86400000;
const rounds = new Set(["R128", "R64", "R32", "R16", "QF", "SF", "F", "RR", "BR", "Q1", "Q2", "Q3", "PO", "PQ"]);
const roundAliases = { ROUND128:"R128", ROUND64:"R64", ROUND32:"R32", ROUND16:"R16", QUARTERFINAL:"QF", QUARTERFINALS:"QF", SEMIFINAL:"SF", SEMIFINALS:"SF", FINAL:"F", ROUNDROBIN:"RR", QUALIFYING1:"Q1", QUALIFYING2:"Q2", QUALIFYING3:"Q3" };
const normalizeRound = value => {
  const raw = token(value).toUpperCase();
  const round = roundAliases[raw] || raw;
  return rounds.has(round) ? round : null;
};

function eventKeys(name, year) {
  const base = token(name);
  if (!base) return [];
  const keys = new Set([base]);
  if (base.endsWith("masters") && base.length > 7) keys.add(base.slice(0, -7));
  if (base === "canadamasters") ["canada", "toronto", "montreal"].forEach(x => keys.add(x));
  if (base === "wtachampionships" || base === "tourchampionships") ["wtatourchampionships", "wtachampionships"].forEach(x => keys.add(x));
  if (base === "olympics") {
    const host = {1988:"seoul",1992:"barcelona",1996:"atlanta",2000:"sydney",2004:"athens",2008:"beijing",2012:"london",2016:"riodejaneiro",2021:"tokyo",2024:"paris"}[year];
    if (host) keys.add(host);
  }
  if (base === "parisolympics") keys.add("paris");
  if (base === "tokyoolympics") keys.add("tokyo");
  if (base === "daviscupqualifiers") keys.add("daviscupqls");
  return [...keys];
}
function matchingEvents(name, year, eventSet) {
  const keys = eventKeys(name, year);
  const matched = new Set();
  for (const event of eventSet) {
    if (keys.includes(event)) matched.add(event);
    else if (keys.some(key => ["daviscup", "fedcup", "bjkcup"].some(prefix => key.startsWith(prefix) && event.startsWith(key)))) matched.add(event);
  }
  return [...matched];
}
function add(map, key, row) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
}
function collect(map, year, events, round, pairKey) {
  const found = new Map();
  for (const event of events) {
    const key = round ? [year,event,round,pairKey].join("|") : [year,event,pairKey].join("|");
    for (const row of map.get(key) || []) found.set(row.rowKey, row);
  }
  return [...found.values()];
}
function withinDateWindow(rows, matchDate, windowDays) {
  const target = day(matchDate);
  const eligible = rows.filter(row => {
    const delta = target - day(row.date);
    return delta >= 0 && delta <= windowDays;
  });
  return { eligible, conflicts: rows.length - eligible.length };
}

function buildIndex(rows, tour) {
  const fullRound = new Map(), aliasRound = new Map(), fullEvent = new Map(), aliasEvent = new Map();
  const aliasRoster = new Map(), eventsByYear = new Map();
  let resultRows = 0, invalidResultDates = 0;
  const dates = [];
  for (const row of rows) {
    const date = validDate(row.tourney_date);
    const p1 = player(row.winner_name), p2 = player(row.loser_name), event = token(row.tourney_name);
    const round = normalizeRound(row.round);
    if (!date || !p1 || !p2 || !event) {
      if (!date) invalidResultDates++;
      continue;
    }
    const year = date.slice(0, 4);
    if (!eventsByYear.has(year)) eventsByYear.set(year, new Set());
    eventsByYear.get(year).add(event);
    dates.push(date); resultRows++;
    const fullPair = pair(p1, p2), a1 = alias(row.winner_name), a2 = alias(row.loser_name);
    const aliasPair = a1 && a2 ? pair(a1, a2) : "";
    const rowKey = [tour,year,date,text(row.tourney_id),text(row.match_num),fullPair,round || ""].join("|");
    const record = { rowKey, date, fullPair, aliasPair };
    add(fullEvent, [year,event,fullPair].join("|"), record);
    if (round) add(fullRound, [year,event,round,fullPair].join("|"), record);
    if (aliasPair) {
      add(aliasEvent, [year,event,aliasPair].join("|"), record);
      if (round) add(aliasRound, [year,event,round,aliasPair].join("|"), record);
      for (const [a,n] of [[a1,p1],[a2,p2]]) {
        const key = [year,event,a].join("|");
        if (!aliasRoster.has(key)) aliasRoster.set(key, new Set());
        aliasRoster.get(key).add(n);
      }
    }
  }
  return { fullRound, aliasRound, fullEvent, aliasEvent, aliasRoster, eventsByYear, resultRows, invalidResultDates, resultDateRange: dates.length ? {from:dates.sort()[0],to:dates.at(-1)} : null };
}

function auditTour(metadataRows, resultRows, tour, options = {}) {
  const windowDays = Number.isInteger(options.dateWindowDays) ? options.dateWindowDays : 21;
  const index = buildIndex(resultRows, tour);
  const groups = new Map();
  let missingMatchIdRows = 0;
  for (const row of metadataRows) {
    const id = text(row.match_id);
    if (!id) { missingMatchIdRows++; continue; }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const duplicates = [...groups.values()].filter(group => group.length > 1);
  const uniqueRows = [...groups.values()].filter(group => group.length === 1).map(group => group[0]);
  const stats = {
    metadataRows: metadataRows.length, uniqueMetadataIds: groups.size, missingMatchIdRows,
    duplicateMetadataIds: duplicates.length, duplicateMetadataRowsExcluded: duplicates.reduce((n,g)=>n+g.length,0),
    resultRows: index.resultRows, invalidResultDateRows: index.invalidResultDates, resultDateRange: index.resultDateRange,
    validMetadataDateRows: 0, invalidMetadataDateRows: 0, missingMetadataDateRows: 0,
    missingPlayerNameRows: 0, missingTournamentRows: 0, missingRoundRows: 0, invalidRoundRows: 0,
    eventNotFound: 0, pairNotFound: 0, roundConflicts: 0, dateConflicts: 0, outsideResultDateCoverage: 0,
    ambiguousFullNamePairs: 0, ambiguousAliasPairs: 0, ambiguousAliasIdentities: 0, aliasUnavailable: 0,
    linked: 0, linkedByFullName: 0, linkedByInitialSurname: 0, linkedWithoutUsableRound: 0, linkedByEventAlias: 0,
    unmatched: 0, unmatchedTournamentCounts: {}, unmatchedRoundCounts: {}, byYear: {}
  };
  for (const row of uniqueRows) {
    const date = validDate(row.Date), rawDate = text(row.Date), tournament = text(row.Tournament);
    const round = normalizeRound(row.Round), rawRound = text(row.Round);
    const p1 = text(row["Player 1"]), p2 = text(row["Player 2"]);
    if (!rawDate) stats.missingMetadataDateRows++;
    else if (!date) stats.invalidMetadataDateRows++;
    else stats.validMetadataDateRows++;
    if (!tournament) stats.missingTournamentRows++;
    if (!rawRound) stats.missingRoundRows++;
    else if (!round) stats.invalidRoundRows++;
    if (!p1 || !p2) stats.missingPlayerNameRows++;
    if (!date || !tournament || !p1 || !p2) {
      stats.unmatched++;
      stats.unmatchedTournamentCounts[tournament || "Unknown"] = (stats.unmatchedTournamentCounts[tournament || "Unknown"] || 0) + 1;
      continue;
    }
    const year = date.slice(0, 4);
    if (index.resultDateRange && (date < index.resultDateRange.from || date > index.resultDateRange.to)) {
      stats.outsideResultDateCoverage++;
      stats.unmatched++;
      stats.unmatchedTournamentCounts[tournament] = (stats.unmatchedTournamentCounts[tournament] || 0) + 1;
      continue;
    }
    if (!stats.byYear[year]) stats.byYear[year] = {metadata:0,linked:0,fullName:0,alias:0,unmatched:0};
    const ys = stats.byYear[year]; ys.metadata++;
    const eventSet = index.eventsByYear.get(year) || new Set();
    const available = matchingEvents(tournament, year, eventSet);
    if (!available.length) {
      stats.eventNotFound++; stats.unmatched++; ys.unmatched++;
      stats.unmatchedTournamentCounts[tournament] = (stats.unmatchedTournamentCounts[tournament] || 0) + 1;
      continue;
    }
    const fullPair = pair(player(p1), player(p2));
    const fullExact = round ? collect(index.fullRound, year, available, round, fullPair) : [];
    const fullAny = collect(index.fullEvent, year, available, null, fullPair);
    let candidate = null, method = "", reason = "";
    const eventAlias = available.some(key => key !== token(tournament));
    if (fullExact.length) {
      const filtered = withinDateWindow(fullExact, date, windowDays).eligible;
      if (filtered.length === 1) { candidate = filtered[0]; method = "full"; }
      else if (filtered.length > 1) { stats.ambiguousFullNamePairs++; reason = "ambiguous-full"; }
      else { stats.dateConflicts++; reason = "date-conflict"; }
    } else if (!round && fullAny.length) {
      const filtered = withinDateWindow(fullAny, date, windowDays).eligible;
      if (filtered.length === 1) { candidate = filtered[0]; method = "full-no-round"; }
      else if (filtered.length > 1) { stats.ambiguousFullNamePairs++; reason = "ambiguous-full"; }
      else { stats.dateConflicts++; reason = "date-conflict"; }
    } else if (!fullExact.length) {
      const a1 = alias(p1), a2 = alias(p2);
      if (a1 && a2) {
        let collision = false;
        const aliasEvents = [];
        for (const event of available) {
          const r1 = index.aliasRoster.get([year,event,a1].join("|"));
          const r2 = index.aliasRoster.get([year,event,a2].join("|"));
          if ((r1 && r1.size > 1) || (r2 && r2.size > 1)) collision = true;
          else if (r1 && r1.size === 1 && r2 && r2.size === 1) aliasEvents.push(event);
        }
        if (!aliasEvents.length && collision) { stats.ambiguousAliasIdentities++; reason = "alias-identity-collision"; }
        else if (!aliasEvents.length) { stats.aliasUnavailable++; reason = "alias-unavailable"; }
        else {
          const aliasPair = pair(a1,a2);
          const aliasExact = round ? collect(index.aliasRound,year,aliasEvents,round,aliasPair) : [];
          const aliasAny = collect(index.aliasEvent,year,aliasEvents,null,aliasPair);
          const candidates = round ? aliasExact : aliasAny;
          const filtered = withinDateWindow(candidates,date,windowDays).eligible;
          if (filtered.length === 1) { candidate = filtered[0]; method = round ? "alias" : "alias-no-round"; }
          else if (filtered.length > 1) { stats.ambiguousAliasPairs++; reason = "ambiguous-alias"; }
          else if (candidates.length) { stats.dateConflicts++; reason = "date-conflict"; }
        }
      } else { stats.aliasUnavailable++; reason = "alias-unavailable"; }
    }
    if (!candidate && !reason && round) {
      if (withinDateWindow(fullAny,date,windowDays).eligible.length) {
        stats.roundConflicts++; reason = "round-conflict";
      } else {
        const a1 = alias(p1), a2 = alias(p2);
        if (a1 && a2 && withinDateWindow(collect(index.aliasEvent,year,available,null,pair(a1,a2)),date,windowDays).eligible.length) {
          stats.roundConflicts++; reason = "round-conflict";
        }
      }
    }
    if (candidate) {
      stats.linked++; ys.linked++;
      if (method.startsWith("full")) { stats.linkedByFullName++; ys.fullName++; }
      else { stats.linkedByInitialSurname++; ys.alias++; }
      if (method.endsWith("no-round")) stats.linkedWithoutUsableRound++;
      if (eventAlias) stats.linkedByEventAlias++;
    } else {
      stats.unmatched++; ys.unmatched++;
      stats.unmatchedTournamentCounts[tournament] = (stats.unmatchedTournamentCounts[tournament] || 0) + 1;
      if (round) stats.unmatchedRoundCounts[round] = (stats.unmatchedRoundCounts[round] || 0) + 1;
      if (!reason) stats.pairNotFound++;
    }
  }
  stats.linkagePct = Number((100 * stats.linked / Math.max(1, uniqueRows.length)).toFixed(2));
  stats.unmatchedTournamentCounts = Object.fromEntries(Object.entries(stats.unmatchedTournamentCounts).sort((a,b)=>b[1]-a[1]).slice(0,30));
  stats.unmatchedRoundCounts = Object.fromEntries(Object.entries(stats.unmatchedRoundCounts).sort((a,b)=>b[1]-a[1]));
  return stats;
}

export function auditMcpMatchLinkage(input, options = {}) {
  const tours = {};
  for (const tour of ["ATP","WTA"]) tours[tour] = auditTour(input.metadata?.[tour] || [], input.results?.[tour] || [], tour, options);
  return {
    schemaVersion: 1,
    sourceCommits: {matchChartingProject:MCP_SOURCE_COMMIT,sackmannArchive:SACKMANN_SOURCE_COMMIT},
    join: "tour + year + tournament alias + unordered player pair + round + event-date window",
    dateWindowDays: Number.isInteger(options.dateWindowDays) ? options.dateWindowDays : 21,
    tours
  };
}

async function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf("--input-dir"), oi = args.indexOf("--out");
  const dir = di >= 0 ? args[di+1] : "";
  const output = oi >= 0 ? args[oi+1] : "mcp-match-linkage-audit.json";
  if (!dir) throw new Error("Usage: node scripts/mcp-match-linkage-audit.mjs --input-dir DIR --out report.json");
  const files = await readdir(dir);
  const readCsv = async name => parseCsv(await readFile(join(dir,name),"utf8"));
  const metadata = {ATP:await readCsv("charting-m-matches.csv"),WTA:await readCsv("charting-w-matches.csv")};
  const results = {ATP:[],WTA:[]};
  for (const file of files) {
    const m = /^(atp|wta)_matches_(\d{4})\.csv$/.exec(file);
    if (!m) continue;
    results[m[1] === "atp" ? "ATP" : "WTA"].push(...await readCsv(file));
  }
  const report = auditMcpMatchLinkage({metadata,results});
  await writeFile(output,JSON.stringify(report,null,2) + "\n");
  for (const tour of ["ATP","WTA"]) {
    const x=report.tours[tour];
    console.log(tour + ": " + x.linked + "/" + x.uniqueMetadataIds + " linked (" + x.linkagePct + "%), full " + x.linkedByFullName + ", alias " + x.linkedByInitialSurname + ", unmatched " + x.unmatched);
  }
  console.log("Wrote aggregate-only Match Charting linkage audit: " + output);
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
