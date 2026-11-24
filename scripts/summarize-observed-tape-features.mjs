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

export function summarizeObservedTapeFeatures(record) {
  if (record?.metadata?.point_source !== "observed" || record?.metadata?.coverage !== "from_start") {
    throw new Error("Refusing non-observed or non-from_start record " + record?.match_id);
  }
  const rows = Array.isArray(record.tape) ? record.tape : [];
  const fields = ["timestamp", "server", "serve", "winner", "outcome", "danger",
    "win_probability_p1", "win_probability_p1_model", "is_tiebreak"];
  const availability = {};
  for (const key of fields) {
    const present = rows.filter(row => row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "").length;
    availability[key] = { present, missing: rows.length - present };
  }
  return {
    match_id: String(record.match_id),
    rows: rows.length,
    points_complete: record?.quality?.completenessFlag ?? null,
    availability,
    server_values: countValues(rows, "server"),
    serve_values: countValues(rows, "serve"),
    winner_values: countValues(rows, "winner"),
    outcome_values: countValues(rows, "outcome"),
    tiebreak_rows: rows.filter(row => row?.is_tiebreak === true).length
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
  const totals = {};
  for (const summary of summaries) {
    for (const [field, counts] of Object.entries(summary.availability)) {
      totals[field] ??= { present: 0, missing: 0 };
      totals[field].present += counts.present;
      totals[field].missing += counts.missing;
    }
  }
  console.log(JSON.stringify({ matches: summaries.length, totals }));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
