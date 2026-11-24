#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_BASE = "https://tennis-value-api-diagnostics-preview.fonds-enfiedjian.workers.dev";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function summarizeRawTape(tape) {
  const rows = Array.isArray(tape) ? tape : [];
  const count = predicate => rows.filter(predicate).length;
  const winnerValues = {};
  for (const row of rows) {
    if (row?.winner !== undefined && row?.winner !== null) {
      const key = String(row.winner);
      winnerValues[key] = (winnerValues[key] || 0) + 1;
    }
  }
  return {
    rows: rows.length,
    timestampRows: count(row => row?.timestamp !== undefined && row?.timestamp !== null && row?.timestamp !== ""),
    serverRows: count(row => row?.server !== undefined && row?.server !== null && row?.server !== ""),
    serveRows: count(row => row?.serve !== undefined && row?.serve !== null),
    winnerRows: count(row => row?.winner !== undefined && row?.winner !== null),
    winnerValues,
    pointWinnerRows: count(row => row?.point_winner !== undefined && row?.point_winner !== null)
  };
}

function validateObservedPayload(matchId, payload, sequence) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Tape payload must be an object for match " + matchId + " (" + sequence + ")");
  }
  if (payload.accessStatus !== "available") {
    throw new Error("Tape is not available for match " + matchId + " (" + sequence + "): " + String(payload.accessStatus ?? "unknown"));
  }
  if (!payload.meta || payload.meta.point_source !== "observed" || payload.meta.coverage !== "from_start") {
    throw new Error("Refusing non-observed or non-from_start " + sequence + " tape for match " + matchId);
  }
  if (!Array.isArray(payload.tape) || payload.tape.length < 2) {
    throw new Error("Observed " + sequence + " tape must contain at least two rows for match " + matchId);
  }
  return payload;
}

export function buildObservedTapeRecord(matchId, rawPayload, options = {}) {
  const id = String(matchId ?? "").trim();
  if (!/^\d{1,15}$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    throw new Error("matchId must be a positive integer");
  }
  const raw = validateObservedPayload(id, rawPayload, "raw");
  const stats = summarizeRawTape(raw.tape);
  if (stats.timestampRows !== stats.rows) {
    throw new Error("Observed raw tape has missing timestamps; quarantined");
  }

  let cleanTape = null;
  let cleanQuality = null;
  let cleanPoints = null;
  if (options.cleanPayload) {
    const clean = validateObservedPayload(id, options.cleanPayload, "clean");
    cleanTape = clean.tape;
    const cleanStats = summarizeRawTape(clean.tape);
    cleanQuality = {
      ...cleanStats,
      timestampsComplete: cleanStats.timestampRows === cleanStats.rows,
      pointsComplete: clean.meta.points?.complete === true,
      completenessFlag: typeof clean.meta.points?.complete === "boolean" ? clean.meta.points.complete : null
    };
    cleanPoints = clean.meta.points ?? null;
  }

  return {
    schema: "tennis-value-scanner.observed-point-tape.v1",
    match_id: id,
    source: "Live Tennis API PRO",
    request: { points: "default", sequence: "raw", clean_sequence: cleanTape ? "clean" : null },
    fetched_at: options.fetchedAt || new Date().toISOString(),
    metadata: {
      ...options.matchMetadata,
      coverage: raw.meta.coverage,
      point_source: raw.meta.point_source,
      points: raw.meta.points ?? null,
      clean_points: cleanPoints
    },
    quality: {
      ...stats,
      timestampsComplete: true,
      pointsComplete: raw.meta.points?.complete === true,
      completenessFlag: typeof raw.meta.points?.complete === "boolean" ? raw.meta.points.complete : null
    },
    clean_quality: cleanQuality,
    tape: raw.tape,
    clean_tape: cleanTape
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ids") args.ids = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--metadata") args.metadata = argv[++i];
    else if (argv[i] === "--base") args.base = argv[++i];
    else if (argv[i] === "--help") args.help = true;
    else throw new Error("Unknown argument: " + argv[i]);
  }
  return args;
}

export async function collectObservedTapes({ ids, output, base = DEFAULT_BASE, fetchImpl = fetch, delayMs = 350, matchMetadataById = {} }) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20) {
    throw new Error("Provide between 1 and 20 explicit match IDs");
  }
  const normalizedIds = [...new Set(ids.map(String))];
  if (normalizedIds.some(id => !/^\d{1,15}$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    throw new Error("Every match ID must be a positive integer");
  }
  const target = resolve(output);
  let existing = [];
  try {
    existing = (await readFile(target, "utf8")).split(/\r?
/).filter(Boolean).map(line => JSON.parse(line));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const records = new Map(existing.map(record => [String(record.match_id), record]));
  const results = [];
  for (const id of normalizedIds) {
    const requestTape = async sequence => {
      const url = new URL("/match-tape", base);
      url.search = new URLSearchParams({ id, points: "default", sequence }).toString();
      const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      let payload;
      try { payload = await response.json(); } catch { throw new Error("Invalid JSON for match " + id + " (" + sequence + ", HTTP " + response.status + ")"); }
      if (!response.ok) throw new Error("Match " + id + " (" + sequence + ") request failed: HTTP " + response.status + " " + String(payload.error ?? ""));
      return payload;
    };
    const rawPayload = await requestTape("raw");
    const cleanPayload = await requestTape("clean");
    const record = buildObservedTapeRecord(id, rawPayload, { cleanPayload, matchMetadata: matchMetadataById[id] || null });
    records.set(id, record);
    results.push({
      match_id: id,
      raw_rows: record.quality.rows,
      clean_rows: record.clean_quality.rows,
      raw_points_complete: record.quality.completenessFlag,
      clean_points_complete: record.clean_quality.completenessFlag
    });
    if (delayMs > 0) await sleep(delayMs);
  }
  await mkdir(dirname(target), { recursive: true });
  const content = [...records.values()].sort((a, b) => Number(a.match_id) - Number(b.match_id))
    .map(record => JSON.stringify(record)).join("\n") + "\n";
  await writeFile(target, content, "utf8");
  return { output: target, records: results, totalStored: records.size };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/collect-observed-point-tapes.mjs --ids 215017,212252 --metadata artifacts/discovered-observed-matches.json --out data/raw-observed-tapes.jsonl [--base URL]");
    return;
  }
  if (!args.ids || !args.out) throw new Error("--ids and --out are required");
  let matchMetadataById = {};
  if (args.metadata) {
    const discovery = JSON.parse(await readFile(resolve(args.metadata), "utf8"));
    if (!Array.isArray(discovery.matches)) throw new Error("--metadata file must contain a matches array");
    matchMetadataById = Object.fromEntries(discovery.matches.map(match => [String(match.match_id), match]));
  }
  const result = await collectObservedTapes({
    ids: args.ids.split(",").map(value => value.trim()).filter(Boolean),
    output: args.out,
    base: args.base || process.env.DIAGNOSTICS_BASE || DEFAULT_BASE,
    matchMetadataById
  });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
