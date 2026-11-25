#!/usr/bin/env node
/**
 * Local JSON/JSONL importer for manually reviewed tournament-intent evidence.
 * No network access, scraping, secrets, or production writes.
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { importTournamentIntentEvidence } from "../tournament-intent-registry.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/import-tournament-intent-evidence.mjs --input <incoming.json|jsonl> --out <registry.json> [--dry-run]",
    "  Optional: --existing <registry.json>",
    "",
    "Input: JSON array/object with records[] or newline-delimited JSON objects.",
    "Output: normalized registry plus last-import accepted/rejected/duplicate counts."
  ].join("\n");
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!["--input", "--existing", "--out"].includes(arg) || !args[i + 1]) {
      throw new Error("Unknown option or missing value: " + arg);
    }
    options[arg.slice(2)] = args[++i];
  }
  return options;
}

async function readOptional(path) {
  if (!path) return [];
  try {
    const raw = await readFile(resolve(path), "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.records)) return parsed.records;
    throw new Error("Expected a JSON array or an object containing records[]: " + path);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readIncoming(path) {
  const raw = await readFile(resolve(path), "utf8");
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.records)) return parsed.records;
    return [parsed];
  } catch (jsonError) {
    const rows = [];
    for (const [lineIndex, line] of raw.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        throw new Error("Invalid JSON or JSONL at line " + (lineIndex + 1));
      }
    }
    return rows;
  }
}

export async function runImport(args) {
  const options = parseArgs(args);
  if (options.help) return { help: usage() };
  if (!options.input || (!options.out && !options.dryRun)) {
    throw new Error(usage());
  }
  const [existing, incoming] = await Promise.all([
    readOptional(options.existing),
    readIncoming(options.input)
  ]);
  const result = importTournamentIntentEvidence(existing, incoming);
  const output = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    records: result.records,
    lastImport: result.summary,
    rejected: result.rejected
  };
  if (!options.dryRun) {
    const destination = resolve(options.out);
    const temporary = destination + ".tmp";
    await writeFile(temporary, JSON.stringify(output, null, 2) + "\n", { flag: "w" });
    await rename(temporary, destination);
  }
  return {
    dryRun: Boolean(options.dryRun),
    outputPath: options.dryRun ? null : resolve(options.out),
    summary: result.summary,
    rejected: result.rejected,
    recordCount: result.records.length
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = await runImport(process.argv.slice(2));
    if (result.help) process.stdout.write(result.help + "\n");
    else process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    process.stderr.write(String(error.message || error) + "\n");
    process.exitCode = 1;
  }
}
