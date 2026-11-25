import { readFile } from "node:fs/promises";

const regularPoint = value => {
  const key = String(value);
  return ({ "0": 0, "15": 1, "30": 2, "40": 3, AD: 4 })[key];
};

function scoreAdvance(before, after) {
  const a = regularPoint(before);
  const b = regularPoint(after);
  if (a !== undefined && b !== undefined) {
    if (b > a) return 1;
    if (a === 4 && b === 3) return -1;
    return 0;
  }
  const na = Number(before), nb = Number(after);
  if (String(before).trim() !== "" && String(after).trim() !== "" &&
      Number.isFinite(na) && Number.isFinite(nb)) {
    return Math.sign(nb - na);
  }
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function inferPointWinner(previous, current) {
  // A set-score increment is the clearest signal for a completed-set transition.
  // Count it separately before examining ordinary game/point score changes.
  if (Array.isArray(previous?.sets) && Array.isArray(current?.sets) &&
      previous.sets.length === 2 && current.sets.length === 2 &&
      !same(previous.sets, current.sets)) {
    const d0 = Number(current.sets[0]) - Number(previous.sets[0]);
    const d1 = Number(current.sets[1]) - Number(previous.sets[1]);
    if (d0 === 1 && d1 === 0) return 1;
    if (d1 === 1 && d0 === 0) return 2;
    return null;
  }

  if (same(previous?.sets, current?.sets) && same(previous?.games, current?.games)) {
    const a = previous?.points, b = current?.points;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 2 || b.length !== 2) return null;
    const changes = [scoreAdvance(a[0], b[0]), scoreAdvance(a[1], b[1])];
    if (changes[0] === 1 && changes[1] === 0) return 1;
    if (changes[1] === 1 && changes[0] === 0) return 2;
    if (changes[0] === -1 && changes[1] === 0) return 2;
    if (changes[1] === -1 && changes[0] === 0) return 1;
    return null;
  }

  if (!same(previous?.sets, current?.sets) || !Array.isArray(previous?.games) ||
      !Array.isArray(current?.games) || previous.games.length !== 2 ||
      current.games.length !== 2 || !Array.isArray(previous.games[0]) ||
      !Array.isArray(previous.games[1]) || !Array.isArray(current.games[0]) ||
      !Array.isArray(current.games[1]) || previous.games[0].length !== current.games[0].length ||
      previous.games[1].length !== current.games[1].length ||
      !same(current?.points, ["0", "0"])) return null;

  const d0 = current.games[0].at(-1) - previous.games[0].at(-1);
  const d1 = current.games[1].at(-1) - previous.games[1].at(-1);
  if (d0 === 1 && d1 === 0) return 1;
  if (d1 === 1 && d0 === 0) return 2;
  return null;
}

export function auditObservedWinnerTransitions(tape) {
  const rows = Array.isArray(tape) ? tape : [];
  const result = {
    adjacentRows: Math.max(0, rows.length - 1),
    comparableTransitions: 0,
    agreements: 0,
    disagreements: 0,
    missingWinner: 0,
    unclassifiedTransitions: 0,
    sequenceGaps: 0,
    mismatches: []
  };

  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1], current = rows[i];
    if (Number.isFinite(previous?.sequence) && Number.isFinite(current?.sequence) &&
        current.sequence - previous.sequence !== 1) {
      result.sequenceGaps++;
      continue;
    }
    const inferred = inferPointWinner(previous, current);
    if (inferred === null) {
      result.unclassifiedTransitions++;
      continue;
    }
    if (current?.winner !== 1 && current?.winner !== 2) {
      result.missingWinner++;
      continue;
    }
    result.comparableTransitions++;
    if (current.winner === inferred) result.agreements++;
    else {
      result.disagreements++;
      if (result.mismatches.length < 10) {
        result.mismatches.push({
          previousSequence: previous?.sequence ?? null,
          sequence: current?.sequence ?? null,
          expectedWinner: inferred,
          actualWinner: current.winner,
          previousPoints: previous?.points ?? null,
          points: current?.points ?? null,
          previousGames: previous?.games ?? null,
          games: current?.games ?? null
        });
      }
    }
  }

  result.agreementRate = result.comparableTransitions
    ? result.agreements / result.comparableTransitions
    : null;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  if (inputIndex < 0 || !args[inputIndex + 1]) {
    throw new Error("Usage: node scripts/audit-observed-point-winners.mjs --input path/to/tapes.jsonl");
  }
  const lines = (await readFile(args[inputIndex + 1], "utf8")).split(/\r?\n/).filter(Boolean);
  let totalComparable = 0, totalAgreements = 0, totalDisagreements = 0;
  for (const line of lines) {
    const record = JSON.parse(line);
    if (record?.metadata?.point_source !== "observed" || record?.metadata?.coverage !== "from_start") {
      throw new Error("Refusing non-observed or non-from_start record " + record?.match_id);
    }
    const audit = auditObservedWinnerTransitions(record.tape);
    totalComparable += audit.comparableTransitions;
    totalAgreements += audit.agreements;
    totalDisagreements += audit.disagreements;
    console.log(JSON.stringify({
      match_id: record.match_id,
      points_complete: record.quality?.completenessFlag ?? null,
      ...audit
    }));
  }
  console.log(JSON.stringify({
    matches: lines.length,
    comparableTransitions: totalComparable,
    agreements: totalAgreements,
    disagreements: totalDisagreements,
    agreementRate: totalComparable ? totalAgreements / totalComparable : null
  }));
  if (totalDisagreements > 0) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
