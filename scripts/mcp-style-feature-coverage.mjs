#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { auditMcpMatchLinkage, parseMcpCsv } from "./mcp-match-linkage-audit.mjs";

const FEATURES = [
  "fhWinnerShare", "unforcedPerPoint", "winnersPerPoint",
  "netPointRate", "deepReturnRate", "serveAndVolleyRate", "longRallyShare"
];
const MIN_PRIOR_DEFAULT = [3, 5, 10];
const SURFACES = new Set(["Hard", "Clay", "Grass"]);
const text = value => String(value ?? "").trim();
const normalize = value => text(value).normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const number = value => {
  const raw = text(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const ratio = (a, b) => a !== null && b !== null && b > 0 ? a / b : null;
const dateNumber = value => {
  const raw = text(value);
  if (!/^\d{8}$/.test(raw)) return null;
  const y = Number(raw.slice(0, 4)), m = Number(raw.slice(4, 6)), d = Number(raw.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? Date.UTC(y, m - 1, d) / 86400000 : null;
};
const sumField = (rows, key) => {
  const values = rows.map(row => number(row[key])).filter(value => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
};
const oneRow = (rows, field, value) => rows.find(row => text(row[field]) === value) || null;

function overviewTotals(rows) {
  const totals = rows.filter(row => text(row.set).toLowerCase() === "total");
  const selected = totals.length ? [totals[0]] : rows.filter(row => /^\d+$/.test(text(row.set)));
  if (!selected.length) return null;
  const keys = ["serve_pts", "return_pts", "winners", "winners_fh", "winners_bh", "unforced", "aces", "dfs"];
  return Object.fromEntries(keys.map(key => [key, sumField(selected, key)]));
}

function buildPlayerMatchFeatures(match, statRows) {
  const families = statRows[match.matchId] || {};
  const output = {};
  for (const side of ["player1", "player2"]) {
    const playerName = match[side + "Name"];
    const playerId = match[side + "Id"];
    const nameKey = normalize(playerName);
    const rowsFor = family => (families[family] || []).filter(row => normalize(row.player) === nameKey);
    const overview = overviewTotals(rowsFor("Overview"));
    const totalPoints = overview && overview.serve_pts !== null && overview.return_pts !== null
      ? overview.serve_pts + overview.return_pts : null;
    const playerFeatures = {
      fhWinnerShare: overview ? ratio(
        overview.winners_fh,
        overview.winners_fh !== null && overview.winners_bh !== null ? overview.winners_fh + overview.winners_bh : null
      ) : null,
      unforcedPerPoint: overview ? ratio(overview.unforced, totalPoints) : null,
      winnersPerPoint: overview ? ratio(overview.winners, totalPoints) : null,
      aceRate: overview ? ratio(overview.aces, overview.serve_pts) : null
    };

    const net = oneRow(rowsFor("NetPoints"), "row", "NetPoints");
    const netPoints = net ? number(net.net_pts) : null;
    playerFeatures.netPointRate = ratio(netPoints, totalPoints);

    const depth = oneRow(rowsFor("ReturnDepth"), "row", "Total");
    const returnable = depth ? number(depth.returnable) : null;
    const deep = depth ? number(depth.deep) : null;
    const veryDeep = depth ? number(depth.very_deep) : null;
    playerFeatures.deepReturnRate = ratio(
      deep !== null && veryDeep !== null ? deep + veryDeep : null,
      returnable
    );

    const snv = oneRow(rowsFor("SnV"), "row", "SnV");
    const nonSnv = oneRow(rowsFor("SnV"), "row", "nonSnV");
    const snvPoints = snv ? number(snv.snv_pts) : null;
    const nonSnvPoints = nonSnv ? number(nonSnv.snv_pts) : null;
    playerFeatures.serveAndVolleyRate = ratio(
      snvPoints,
      snvPoints !== null && nonSnvPoints !== null ? snvPoints + nonSnvPoints : null
    );

    const rallyRows = rowsFor("Rally");
    const rallyCounts = Object.fromEntries(["1-3", "4-6", "7-9", "10"].map(key => {
      const row = oneRow(rallyRows, "row", key);
      return [key, row ? number(row.pts) : null];
    }));
    const rallyTotal = Object.values(rallyCounts).every(value => value !== null)
      ? Object.values(rallyCounts).reduce((sum, value) => sum + value, 0) : null;
    playerFeatures.longRallyShare = ratio(rallyCounts["10"], rallyTotal);

    output[side] = { playerId, features: playerFeatures };
  }
  return output;
}

function indexStatRows(statFiles) {
  const byMatch = {};
  for (const file of statFiles) {
    const name = basename(file.filename);
    const match = name.match(/^charting-([mw])-stats-(.+)\.csv$/i);
    if (!match) continue;
    const tour = match[1].toLowerCase() === "m" ? "ATP" : "WTA";
    const family = match[2];
    for (const row of parseMcpCsv(file.content)) {
      const id = text(row.match_id);
      if (!id) continue;
      const key = tour + ":" + id;
      if (!byMatch[key]) byMatch[key] = {};
      if (!byMatch[key][family]) byMatch[key][family] = [];
      byMatch[key][family].push(row);
    }
  }
  return byMatch;
}

function newTourReport() {
  return {
    linkedMatches: 0, validChronologyMatches: 0, mainTourTargets: 0,
    targetsWithBothPlayersMatchedInOverview: 0,
    featureMatchCoverage: Object.fromEntries(FEATURES.map(feature => [feature, 0])),
    priorHistoryCoverage: Object.fromEntries(FEATURES.map(feature => [feature, {
      overall: Object.fromEntries(MIN_PRIOR_DEFAULT.map(n => [String(n), 0])),
      sameSurface: Object.fromEntries(MIN_PRIOR_DEFAULT.map(n => [String(n), 0]))
    }])),
    targetSurfaceCounts: { Hard: 0, Clay: 0, Grass: 0, unknown: 0 }
  };
}

export function auditMcpStyleFeatureCoverage(linkedRows, statFiles, {
  windowDays = 730,
  minPriorMatches = MIN_PRIOR_DEFAULT
} = {}) {
  if (!Array.isArray(linkedRows) || !Array.isArray(statFiles)) throw new Error("Linked rows and stat files are required");
  const statRows = indexStatRows(statFiles);
  const records = [];
  const tours = { ATP: newTourReport(), WTA: newTourReport() };
  const byId = new Set();
  for (const link of linkedRows) {
    const matchId = text(link.matchId), tour = text(link.tour);
    const day = dateNumber(link.date);
    if (!matchId || !["ATP", "WTA"].includes(tour) || byId.has(tour + ":" + matchId)) continue;
    byId.add(tour + ":" + matchId);
    const surface = text(link.surface);
    const datePlausible = link.dateOffsetDays === null || link.dateOffsetDays === undefined ||
      (Number(link.dateOffsetDays) >= -7 && Number(link.dateOffsetDays) <= 21);
    const idsValid = text(link.player1Id) && text(link.player2Id) && text(link.player1Id) !== text(link.player2Id);
    if (day === null || !datePlausible || !idsValid) continue;
    const features = buildPlayerMatchFeatures({ ...link, matchId }, statRows[tour + ":" + matchId] || {});
    const record = {
      matchId, tour, day, surface, sourceTier: text(link.sourceTier),
      player1Id: text(link.player1Id), player2Id: text(link.player2Id),
      player1Features: features.player1.features, player2Features: features.player2.features
    };
    records.push(record);
    const report = tours[tour];
    report.linkedMatches++;
    report.validChronologyMatches++;
    if (record.sourceTier === "main") {
      report.mainTourTargets++;
      if (FEATURES.every(feature => record.player1Features[feature] !== null && record.player2Features[feature] !== null)) {
        report.targetsWithBothPlayersMatchedInOverview++;
      }
      report.targetSurfaceCounts[SURFACES.has(surface) ? surface : "unknown"]++;
      for (const feature of FEATURES) {
        if (record.player1Features[feature] !== null && record.player2Features[feature] !== null) {
          report.featureMatchCoverage[feature]++;
        }
      }
    }
  }
  records.sort((a, b) => a.day - b.day || a.matchId.localeCompare(b.matchId));
  const histories = new Map();
  const historyKey = (tour, playerId) => tour + ":" + playerId;
  let cursor = 0;
  while (cursor < records.length) {
    const day = records[cursor].day;
    let end = cursor;
    while (end < records.length && records[end].day === day) end++;
    for (let i = cursor; i < end; i++) {
      const target = records[i];
      if (target.sourceTier !== "main") continue;
      const report = tours[target.tour];
      for (const feature of FEATURES) {
        for (const mode of ["overall", "sameSurface"]) {
          const getPrior = playerId => (histories.get(historyKey(target.tour, playerId)) || [])
            .filter(item => item.day < day && item.day >= day - windowDays &&
              item.features[feature] !== null &&
              (mode === "overall" || (SURFACES.has(target.surface) && item.surface === target.surface)));
          const p1 = getPrior(target.player1Id), p2 = getPrior(target.player2Id);
          for (const min of minPriorMatches) {
            if (p1.length >= min && p2.length >= min) {
              const bucket = report.priorHistoryCoverage[feature][mode][String(min)];
              bucket++;
              report.priorHistoryCoverage[feature][mode][String(min)] = bucket;
            }
          }
        }
      }
    }
    for (let i = cursor; i < end; i++) {
      const record = records[i];
      for (const side of ["player1", "player2"]) {
        const playerId = record[side + "Id"];
        const key = historyKey(record.tour, playerId);
        if (!histories.has(key)) histories.set(key, []);
        histories.get(key).push({
          day: record.day, surface: record.surface,
          features: record[side + "Features"]
        });
      }
    }
    cursor = end;
  }
  const report = {
    schemaVersion: 1,
    source: "Jeff Sackmann Match Charting Project; exact linked result metadata; aggregate coverage only",
    license: "CC BY-NC-SA 4.0; attribution required; non-commercial only; share-alike",
    featureWindowDays: windowDays,
    minimumPriorChartedMatches: minPriorMatches,
    sameDayHistoryExcluded: true,
    features: FEATURES,
    byTour: tours,
    warnings: [
      "This is a feature-history coverage audit only; no model is trained and no prediction quality is claimed.",
      "Only unique exact-linked MCP matches with valid match date, plausible event-week date offset and distinct Sackmann player IDs are considered.",
      "Same-day charted matches are excluded from pre-match history because within-day order is not reliable.",
      "Only Hard, Clay and Grass are used for same-surface history; other or malformed surface values are counted as unknown.",
      "Raw MCP CSVs, player names, match IDs and player-level feature histories are not written to the report or uploaded."
    ]
  };
  return report;
}

export async function auditMcpStyleFeatureCoverageDirectory(dir, options = {}) {
  const names = (await readdir(dir)).sort();
  const files = [];
  for (const name of names) {
    if (name.endsWith(".csv")) files.push({ filename: name, content: await readFile(join(dir, name), "utf8") });
  }
  const linkage = auditMcpMatchLinkage(files);
  const statFiles = files.filter(file => /^charting-[mw]-stats-/.test(basename(file.filename)));
  return auditMcpStyleFeatureCoverage(linkage.linkedRows || [], statFiles, options);
}

async function main() {
  const args = process.argv.slice(2);
  let dir = "", out = "mcp-style-feature-coverage.json";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input-dir") dir = args[++i];
    else if (args[i] === "--out") out = args[++i];
    else throw new Error("Usage: node scripts/mcp-style-feature-coverage.mjs --input-dir DIR --out report.json");
  }
  if (!dir) throw new Error("Missing --input-dir");
  const report = await auditMcpStyleFeatureCoverageDirectory(dir);
  await writeFile(out, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ schemaVersion: report.schemaVersion, byTour: report.byTour }) + "\n");
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
