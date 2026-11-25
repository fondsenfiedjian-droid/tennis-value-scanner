import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inferPointStateTransition } from "./point-state-transition-audit.mjs";

const side = value => value === 1 || value === "1" ? 1 : value === 2 || value === "2" ? 2 : null;
const numberOrNull = value => Number.isInteger(value) ? value : null;

function asPayloads(document) {
  let payloads;
  if (Array.isArray(document)) payloads = document;
  else if (Array.isArray(document?.matches)) payloads = document.matches;
  else if (Array.isArray(document?.data) && !Array.isArray(document?.tape)) payloads = document.data;
  else payloads = [document];

  return payloads.map(payload => {
    const metadata = payload?.metadata;
    const isCollectorSample = Array.isArray(payload?.clean_tape) &&
      metadata?.point_source === "observed" &&
      metadata?.coverage === "from_start" &&
      metadata?.clean_points?.basis === "clean";
    if (!isCollectorSample) return payload;

    return {
      match: { id: payload.match_id },
      meta: { match_id: payload.match_id, sequence: "clean" },
      tape: payload.clean_tape
    };
  });
}

function eligibleBasis(meta = {}) {
  const completePoints = meta.points?.available_complete === true &&
    meta.points?.complete === true;
  return meta.sequence === "clean" || completePoints;
}

function nativeRow(row, matchId) {
  const sets = Array.isArray(row?.sets) ? row.sets : [];
  const games = Array.isArray(row?.games) ? row.games : [];
  const points = Array.isArray(row?.points) ? row.points : [];
  return {
    match_id: String(matchId),
    sets_p1: numberOrNull(sets[0]),
    sets_p2: numberOrNull(sets[1]),
    games_p1: Array.isArray(games[0]) ? JSON.stringify(games[0]) : null,
    games_p2: Array.isArray(games[1]) ? JSON.stringify(games[1]) : null,
    points_p1: points[0] ?? null,
    points_p2: points[1] ?? null,
    server: row?.server ?? null,
    is_tiebreak: row?.is_tiebreak ?? row?.tiebreak ?? false
  };
}

function emptyCounts() {
  return {
    transitions: 0,
    providerWinnerPresent: 0,
    parserInferred: 0,
    comparable: 0,
    agree: 0,
    disagree: 0,
    providerOnly: 0,
    parserOnly: 0,
    bothUnknown: 0
  };
}

function addTransition(counts, inferred, providerWinner) {
  counts.transitions++;
  if (providerWinner !== null) counts.providerWinnerPresent++;
  if (inferred.status === "inferred") counts.parserInferred++;

  if (inferred.status === "inferred" && providerWinner !== null) {
    counts.comparable++;
    if (inferred.winner === providerWinner) counts.agree++;
    else counts.disagree++;
  } else if (inferred.status !== "inferred" && providerWinner !== null) {
    counts.providerOnly++;
  } else if (inferred.status === "inferred" && providerWinner === null) {
    counts.parserOnly++;
  } else {
    counts.bothUnknown++;
  }
}

export function auditHistoryTapeWinnerCrosscheck(documents) {
  const report = {
    scope: "aggregate-only; no match IDs, player names or raw rows",
    acceptedBasis: ["sequence=clean", "points=complete with available_complete=true and complete=true"],
    matchesSeen: 0,
    matchesAudited: 0,
    matchesSkipped: 0,
    rows: 0,
    overall: emptyCounts(),
    byOrigin: {},
    skippedReasons: {}
  };

  for (const payload of asPayloads(documents)) {
    report.matchesSeen++;
    const meta = payload?.meta && typeof payload.meta === "object" ? payload.meta : {};
    const tape = Array.isArray(payload?.tape) ? payload.tape : [];
    const matchId = meta.match_id ?? payload?.match?.id;
    if (!eligibleBasis(meta)) {
      report.matchesSkipped++;
      const reason = meta.sequence === "raw" ? "raw_sequence_not_point_order" : "basis_not_verified";
      report.skippedReasons[reason] = (report.skippedReasons[reason] || 0) + 1;
      continue;
    }
    if (matchId === null || matchId === undefined || tape.length < 2) {
      report.matchesSkipped++;
      const reason = matchId === null || matchId === undefined ? "missing_match_id" : "insufficient_rows";
      report.skippedReasons[reason] = (report.skippedReasons[reason] || 0) + 1;
      continue;
    }

    report.matchesAudited++;
    report.rows += tape.length;
    const local = emptyCounts();
    for (let i = 1; i < tape.length; i++) {
      const before = nativeRow(tape[i - 1], matchId);
      const after = nativeRow(tape[i], matchId);
      const inferred = inferPointStateTransition(before, after);
      const providerWinner = side(tape[i]?.winner);
      addTransition(local, inferred, providerWinner);

      const origin = ["observed", "reconstructed"].includes(tape[i]?.origin)
        ? tape[i].origin : "unknown";
      if (!report.byOrigin[origin]) report.byOrigin[origin] = emptyCounts();
      addTransition(report.byOrigin[origin], inferred, providerWinner);
    }
    for (const key of Object.keys(report.overall)) report.overall[key] += local[key];
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const outputIndex = args.indexOf("--out");
  if (inputIndex < 0 || !args[inputIndex + 1]) {
    throw new Error("Usage: node scripts/history-tape-winner-crosscheck.mjs --input FILE.json [--out report.json]");
  }
  const inputPath = resolve(args[inputIndex + 1]);
  const inputText = await readFile(inputPath, "utf8");
  let document;
  try {
    document = JSON.parse(inputText);
  } catch {
    document = inputText.split(/\\r?\\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  }
  const report = auditHistoryTapeWinnerCrosscheck(document);
  const json = JSON.stringify(report, null, 2) + "\n";
  if (outputIndex >= 0 && args[outputIndex + 1]) {
    await writeFile(resolve(args[outputIndex + 1]), json);
  } else {
    process.stdout.write(json);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
