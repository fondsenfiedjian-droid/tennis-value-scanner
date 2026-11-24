import { readFile } from "node:fs/promises";

function countValues(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row?.[key];
    if (value === undefined || value === null || value === "") continue;
    const label = String(value);
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}

function summarizeSequence(rows, sequence) {
  const fields = ["timestamp", "server", "serve", "winner", "point_winner", "outcome", "danger",
    "win_probability_p1", "win_probability_p1_model", "is_tiebreak"];
  const availability = {};
  for (const key of fields) {
    const present = rows.filter(row => row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "").length;
    availability[key] = { present, missing: rows.length - present };
  }
  return {
    sequence,
    rows: rows.length,
    availability,
    server_values: countValues(rows, "server"),
    serve_values: countValues(rows, "serve"),
    winner_values: countValues(rows, "winner"),
    point_winner_values: countValues(rows, "point_winner"),
    outcome_values: countValues(rows, "outcome"),
    tiebreak_rows: rows.filter(row => row?.is_tiebreak === true).length
  };
}

export function summarizeObservedTapeFeatures(record) {
  if (record?.metadata?.point_source !== "observed" || record?.metadata?.coverage !== "from_start") {
    throw new Error("Refusing non-observed or non-from_start record " + record?.match_id);
  }
  const rawRows = Array.isArray(record.tape) ? record.tape : [];
  const raw = summarizeSequence(rawRows, "raw");
  const cleanRows = Array.isArray(record.clean_tape) ? record.clean_tape : null;
  const clean = cleanRows ? summarizeSequence(cleanRows, "clean") : null;
  return {
    match_id: String(record.match_id),
    points_complete_raw: record?.quality?.completenessFlag ?? null,
    points_complete_clean: record?.clean_quality?.completenessFlag ?? null,
    raw,
    clean,
    rows: raw.rows,
    availability: raw.availability,
    server_values: raw.server_values,
    serve_values: raw.serve_values,
    winner_values: raw.winner_values,
    outcome_values: raw.outcome_values,
    tiebreak_rows: raw.tiebreak_rows
  };
}

async function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--input");
  if (index < 0 || !args[index + 1]) {
    throw new Error("Usage: node scripts/summarize-observed-tape-features.mjs --input path/to/tapes.jsonl");
  }
  const lines = (await readFile(args[index + 1], "utf8")).split(/\r?\n/).filter(Boolean);
  const summaries = lines.map(line => summarizeObservedTapeFeatures(JSON.parse(line)));
  for (const summary of summaries) console.log(JSON.stringify(summary));
  const totals = { raw: {}, clean: {} };
  for (const summary of summaries) {
    for (const sequence of ["raw", "clean"]) {
      const block = summary[sequence];
      if (!block) continue;
      for (const [field, counts] of Object.entries(block.availability)) {
        totals[sequence][field] ??= { present: 0, missing: 0 };
        totals[sequence][field].present += counts.present;
        totals[sequence][field].missing += counts.missing;
      }
    }
  }
  console.log(JSON.stringify({ matches: summaries.length, totals }));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
