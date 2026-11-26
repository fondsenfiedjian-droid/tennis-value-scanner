#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, existsSync, realpathSync, readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { openCanonicalArchive } from "./archive-canonical.mjs";
import { adaptLocalRow, discoverSQLite, inferEntries, localRows, safeInput, sqliteSchema } from "./archive-local-input.mjs";

const [command = "run", ...args] = process.argv.slice(2);
const rootDefault = "/sdcard/Download/TennisCleanArchive";
const json = value => JSON.stringify(value, null, 2);
const output = value => console.log(json(value));

async function revisionOf(file, entry) {
  const hash = createHash("sha256").update(JSON.stringify(entry));
  const before = statSync(file);
  if (existsSync(file + "-wal") && statSync(file + "-wal").size) throw Error("Close the writer and checkpoint the input SQLite database: " + file);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  checkUnchanged(file, before);
  return { digest: hash.digest("hex"), before };
}

function checkUnchanged(file, before) {
  const after = statSync(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
      before.ino !== after.ino || (existsSync(file + "-wal") && statSync(file + "-wal").size)) {
    throw Error("Input changed during import: " + file);
  }
}

function openOutput(file, inputs = []) {
  const target = join(realpathSync(dirname(resolve(file))), basename(file));
  if (existsSync(target)) {
    const info = statSync(target);
    if (realpathSync(target) !== target || inputs.some(input => {
      const original = statSync(input);
      return info.ino === original.ino && info.dev === original.dev;
    })) throw Error("Output refers to an input or symbolic link");
  }
  if (/^(matches|players|match-index|supplemental)\.sqlite$/i.test(basename(target))) throw Error("Use a distinct canonical database filename");
  return openCanonicalArchive(target);
}

async function run() {
  const [rootArgument = rootDefault, destination = "./tennis-canonical.sqlite", manifest] = args;
  const root = realpathSync(rootArgument);
  const discovered = discoverSQLite(root);
  const inferred = inferEntries(root, discovered);
  const config = manifest ? JSON.parse(readFileSync(manifest, "utf8")) : { inputs: inferred.entries };
  if (!Array.isArray(config.inputs) || !config.inputs.length) {
    output({ pending: inferred.pending, schemas: discovered.map(file => ({ file: relative(root, file), tables: sqliteSchema(file) })) });
    throw Error("No recognized match input. Use inspect and supply a matching manifest.");
  }
  const inputs = config.inputs.map(entry => ({ entry, file: safeInput(root, entry.file) }));
  const inputTables = inputs.map(({ entry, file }) => JSON.stringify([file.name, entry.table ?? entry.member ?? null]));
  if (new Set(inputTables).size !== inputTables.length) throw Error("Duplicate input path and table in manifest");
  const archive = openOutput(destination, [...discovered, ...inputs.map(({file}) => file.absolute)]);
  const pending = discovered.flatMap(file => sqliteSchema(file).map(table => ({ file: relative(root,file), table: table.name })))
    .filter(item => !inputs.some(({entry}) => entry.file === item.file && entry.table === item.table));
  try {
    for (const link of config.links ?? []) archive.confirmLink(link);
    for (const [{ entry, file }, input] of inputs.map((value, index) => [value, inputTables[index]])) {
      const { digest, before } = await revisionOf(file.absolute, entry);
      const previous = archive.checkpoint(input);
      if (previous?.revision && previous.revision !== digest) throw Error("Input changed since checkpoint: " + input);
      if (previous?.complete) continue;
      let position = previous?.position ?? 0;
      let batch = [];
      for await (const row of localRows(file, entry, position)) {
        batch.push({ position: row.position, record: adaptLocalRow(row.raw, file.name, entry),
          locator: { file: file.name, table: entry.table ?? null, member: entry.member ?? null, row: row.position,
            sourceFile: row.raw.source_file ?? row.raw.source ?? row.raw.member ?? null,
            sourceRow: row.raw.source_row ?? row.raw.row ?? null, sha256Revision: digest } });
        if (batch.length < 500) continue;
        checkUnchanged(file.absolute, before);
        position = archive.ingestBatch(input, digest, batch, { expectedPosition: position });
        if (position % 25000 < 500) console.error(file.name + " · " + position);
        batch = [];
      }
      checkUnchanged(file.absolute, before);
      position = archive.ingestBatch(input, digest, batch, { complete: true, expectedPosition: position });
      console.error(file.name + " · " + position + " · complete");
    }
    const report = { reportType: "developer-canonical-archive", ...archive.report(), pendingTables: pending, auditedInputs: inputTables };
    const reportFile = resolve(destination) + ".report.json";
    const temporary = reportFile + "." + process.pid + ".tmp";
    writeFileSync(temporary, json(report) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temporary, reportFile);
    output(report);
  } finally { archive.close(); }
}

try {
  if (command === "run") await run();
  else if (command === "inspect") {
    const root = realpathSync(args[0] ?? rootDefault);
    const files = discoverSQLite(root);
    output({ databases: files.map(file => ({ file: relative(root, file), tables: sqliteSchema(file) })),
      ...inferEntries(root, files) });
  } else if (["report", "fields", "unlink"].includes(command)) {
    if (!args[0] || !existsSync(args[0])) throw Error("Specify an existing canonical archive");
    const archive = openOutput(args[0]);
    try {
      if (command === "report") output(archive.report());
      else if (command === "fields") {
        if (!args[1]) throw Error("Specify a canonical match ID");
        output(archive.fields(args[1], args[2]));
      } else archive.unlink(args[1], args[2]);
    } finally { archive.close(); }
  } else throw Error("Commands: run, inspect, report, fields, unlink");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
