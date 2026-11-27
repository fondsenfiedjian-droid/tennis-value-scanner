#!/usr/bin/env node
import { homedir } from "node:os";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, realpathSync, readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { openCanonicalArchive } from "./archive-canonical.mjs";
import { adaptLocalRow, countMatchDateSources, discoverSQLite, inferEntries, localRows, safeInput, sqliteSchema } from "./archive-local-input.mjs";

const [command = "run", ...args] = process.argv.slice(2);
const rootDefault = "/sdcard/Download/TennisCleanArchive";
const json = value => JSON.stringify(value, null, 2);
const output = value => console.log(json(value));

async function revisionOf(files, entry) {
  const hash = createHash("sha256").update(JSON.stringify(entry));
  const snapshots = [];
  for (const file of files) {
    const before = statSync(file);
    checkUnchanged(file, before);
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    checkUnchanged(file, before);
    hash.update(digest.digest());
    snapshots.push([file, before]);
  }
  return { digest: hash.digest("hex"), snapshots };
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

function preparedWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./archive-worker.mjs", import.meta.url), {
      workerData
    });
    worker.once("message", ({ result, error }) => error ? reject(Error(error)) : resolve(result));
    worker.once("error", reject);
    worker.once("exit", code => reject(Error("Archive worker exited before returning its report (" + code + ")")));
  });
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
  const inputs = config.inputs.map(entry => {
    const file = safeInput(root, entry.file);
    if (entry.preparedIndex) file.preparedIndex = safeInput(root, entry.preparedIndex).absolute;
    const { preparedPlayers, ...importEntry } = entry;
    return { entry: importEntry, file };
  });
  const inputTables = inputs.map(({ entry, file }) => JSON.stringify([file.name, entry.table ?? entry.member ?? null]));
  if (new Set(inputTables).size !== inputTables.length) throw Error("Duplicate input path and table in manifest");
  const archive = openOutput(destination, [...discovered, ...inputs.flatMap(({file}) => [file.absolute, file.preparedIndex].filter(Boolean))]);
  const pending = discovered.flatMap(file => sqliteSchema(file).map(table => ({ file: relative(root,file), table: table.name })))
    .filter(item => !inputs.some(({entry}) => (entry.file === item.file && entry.table === item.table) ||
      (entry.preparedIndex === item.file && item.table === "match_index")));
  try {
    if (config.links?.length) archive.confirmLinks(config.links);
    for (const [{ entry, file }, input] of inputs.map((value, index) => [value, inputTables[index]])) {
      const { digest, snapshots } = await revisionOf([file.absolute, file.preparedIndex].filter(Boolean), entry);
      const previous = archive.checkpoint(input);
      if (previous?.revision && previous.revision !== digest) throw Error("Input changed since checkpoint: " + input);
      if (previous?.complete) continue;
      let position = previous?.position ?? 0;
      let batch = [];
      for await (const row of localRows(file, entry, position)) {
        batch.push({ position: row.position, record: adaptLocalRow(row.raw, file.name, entry),
          locator: { file: file.name, table: entry.table ?? null, member: entry.member ?? null, row: row.position,
            sourceFile: row.raw.source_file ?? row.raw.source ?? row.raw.member ?? null,
            sourceRow: row.raw.source_row ?? row.raw.row ?? null, archive: row.raw.archive ?? null,
            archiveRow: row.raw.archive_row ?? null, sha256Revision: digest } });
        if (batch.length < 500) continue;
        snapshots.forEach(([path, before]) => checkUnchanged(path, before));
        position = archive.ingestBatch(input, digest, batch, { expectedPosition: position });
        if (position % 25000 < 500) console.error(file.name + " · " + position);
        batch = [];
      }
      snapshots.forEach(([path, before]) => checkUnchanged(path, before));
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
  else if (command === "date-sources") {
    const index = realpathSync(args[0] ?? join(rootDefault,"match-index.sqlite"));
    console.table(countMatchDateSources(index));
  }
  else if (command === "training-tennisdata-dates") {
    const [year = "2026"] = args;
    const archive = openCanonicalArchive(realpathSync(join(homedir(),"tennis-canonical.sqlite")),{readOnly:true});
    try { output(archive.trainingTennisDataDates(realpathSync(join(rootDefault,"match-index.sqlite")),Number(year))); }
    finally { archive.close(); }
  }
  else if (command === "training-tennisdata-funnel") {
    const [year = "2026"] = args;
    const archive = openCanonicalArchive(realpathSync(join(homedir(),"tennis-canonical.sqlite")),{readOnly:true});
    try { output(archive.trainingTennisDataDateFunnel(realpathSync(join(rootDefault,"match-index.sqlite")),Number(year))); }
    finally { archive.close(); }
  }
  else if (["training-overlap","training-aces-dates"].includes(command)) {
    const [database,index,from = "2021",to = "2026"] = args;
    if (!database || !index) throw Error(`Usage: ${command} EXISTING_DATABASE MATCH_INDEX [FIRST_YEAR] [LAST_YEAR]`);
    const archive = openCanonicalArchive(realpathSync(database),{readOnly:true});
    try {
      const args = [realpathSync(index),Number(from),Number(to)];
      output(command === "training-overlap" ? archive.trainingOverlap(...args) : archive.trainingAcesDates(...args));
    }
    finally { archive.close(); }
  }
  else if (command === "training-coverage") {
    const [database, from = "2021", to = "2026"] = args;
    if (!database) throw Error("Usage: training-coverage EXISTING_DATABASE [FIRST_YEAR] [LAST_YEAR]");
    const archive = openCanonicalArchive(realpathSync(database),{readOnly:true});
    try { output(archive.trainingCoverage(Number(from),Number(to))); }
    finally { archive.close(); }
  }
  else if (command === "attach-reviewed") {
    const [database, folder, flag] = args;
    if (!database || !folder || (flag !== undefined && flag !== "--apply")) {
      throw Error("Usage: attach-reviewed EXISTING_DATABASE UNPACKED_PACKAGE [--apply]");
    }
    const config = JSON.parse(readFileSync(join(folder,"manifest.json"),"utf8"));
    const input = config.inputs;
    if (!Array.isArray(config.links) || input?.length !== 1 || input[0].file !== "reviewed-matches.ndjson") {
      throw Error("Expected a reviewed Кортограф package");
    }
    const source = safeInput(realpathSync(folder),input[0].file);
    const groups = new Map();
    for await (const {raw} of localRows(source,input[0],0)) {
      const record = adaptLocalRow(raw,source.name,input[0]);
      if (!record.slot) throw Error("Missing reviewed group identifier");
      if (!groups.has(record.slot)) groups.set(record.slot,[]);
      groups.get(record.slot).push({record,locator:{sourceFile:raw.source,sourceRow:raw.source_row}});
    }
    const archive = openCanonicalArchive(realpathSync(database),{readOnly:flag !== "--apply"});
    try { output(archive.attachReviewed([...groups.values()],config.links,{apply:flag === "--apply"})); }
    finally { archive.close(); }
  }
  else if (["audit-prepared","review-prepared"].includes(command)) {
    const root = realpathSync(args[0] ?? rootDefault);
    const { entries } = inferEntries(root, discoverSQLite(root));
    output(await preparedWorker({ task: command, root, entry: entries.find(entry => entry.preparedIndex),
      cursor: args[1] === undefined ? undefined : Number(args[1]), limit: args[2] === undefined ? undefined : Number(args[2]) }));
  } else if (command === "inspect") {
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
  } else throw Error("Commands: run, inspect, audit-prepared, review-prepared, attach-reviewed, date-sources, training-coverage, training-overlap, training-aces-dates, training-tennisdata-dates, training-tennisdata-funnel, report, fields, unlink");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
