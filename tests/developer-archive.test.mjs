import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, crc32 } from "node:zlib";
import { readFile } from "node:fs/promises";
import { archiveSchema, csvRecords, normalizeArchiveRecord } from "../developer/archive-csv.mjs";
import { readZipEntry, zipDirectory } from "../developer/archive-zip.mjs";
import { sha256 } from "../developer/archive-db.mjs";

const fr = "match_id;date;tournoi_id;tournoi;joueur1;joueur1_id;joueur2;joueur2_id;vainqueur_id;score;statut;surface;cote1_ouverture;cote2_ouverture;categorie;tour";
async function normalize(text, sourceHint = "valuebetennis") {
  let schema;
  const rows = [];
  for await (const { fields, record } of csvRecords(new Blob([text]))) {
    if (!schema) schema = archiveSchema(fields);
    else rows.push(normalizeArchiveRecord(fields, record, schema, { id: "archive", sourceHint }, "matches.csv", 0));
  }
  return rows;
}
test("CSV preserves quoted separators, newlines, decimal commas and evidence-based score status", async () => {
  const [first, second, third] = await normalize("\ufeff" + fr + "\r\n" +
    'm1;20251126;t1;"Tennis; ""Club""\r\nParis";A;1;B;2;1;;forfait;dur intérieur;1,60;2,40;ATP;QF\r\n' +
    'm2;2025-11-26;t1;Paris;B;2;A;1;1;;;dur;;;ATP;SF\r\n' +
    'm3;2025-02-31;t1;Paris;A;1;B;2;3;abc;;dur;0;2;ATP;F');
  assert.equal(first.tournament, 'Tennis; "Club"\r\nParis');
  assert.deepEqual(first.openOdds, [1.6, 2.4]);
  assert.equal(first.scoreClass, "walkover");
  assert.equal(first.indoor, true);
  assert.equal(second.scoreClass, "unknown");
  assert.equal(second.winnerSide, 2);
  assert.deepEqual(first.naturalKey, second.naturalKey);
  assert.notDeepEqual(first.sourceKey, second.sourceKey);
  assert.equal(third.date, null);
  assert.equal(third.winnerSide, null);
  assert.deepEqual(third.issues, ["winner_unknown", "date_unknown", "score_format", "odds_format"]);
});

test("invalid row width is retained and excluded from duplicate matching; other CSV schema is supported", async () => {
  const [short] = await normalize(fr + "\nm1;20251126;t1;Paris;A;1;B;2;1;6-3");
  assert.ok(short.issues.includes("field_count"));
  assert.equal(short.naturalKey, undefined);
  const [standard] = await normalize('tourney_date,winner_name,loser_name,score,surface\n20251126,A,B,6-2 6-1,Clay');
  assert.equal(standard.winnerSide, 1);
  assert.equal(standard.surface, "clay");
  assert.equal(standard.scoreClass, "score_present");
  await assert.rejects(normalize(fr + '\n"unterminated'), /кавычка/);
  await assert.rejects(normalize("x,y\nzz,aa"), /Схема CSV/);
});

function zipFixture(method, data, corrupt = false) {
  const name = Buffer.from("season/a.csv");
  const raw = Buffer.from(data);
  const payload = method === 8 ? deflateRawSync(raw) : raw;
  const crc = crc32(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(corrupt ? 0 : crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + payload.length, 16);
  return new Blob([local, name, payload, central, name, end]);
}

test("ZIP stored and deflated members round trip and CRC corruption stays detectable", async () => {
  for (const method of [0, 8]) {
    const original = zipFixture(method, fr + "\nm1");
    const hash = await sha256(original);
    const [entry] = await zipDirectory(original);
    assert.equal(entry.name, "season/a.csv");
    assert.equal(await (await readZipEntry(original, entry)).text(), fr + "\nm1");
    assert.equal(await sha256(original), hash);
  }
  const corrupt = zipFixture(8, fr, true);
  const [entry] = await zipDirectory(corrupt);
  await assert.rejects(readZipEntry(corrupt, entry), /CRC/);
  await assert.rejects(zipDirectory(new Blob(["not a zip"])), /ZIP/);
});

test("Developer PWA precaches all archive modules without loading them in the root app", async () => {
  const root = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const worker = await readFile(new URL("../developer/sw.js", import.meta.url), "utf8");
  assert.doesNotMatch(root, /archive-pipeline|historical-archive\.js/);
  for (const file of ["historical-archive.js", "archive-db.mjs", "archive-csv.mjs", "archive-zip.mjs", "archive-pipeline.mjs", "archive-worker.mjs"]) {
    assert.ok(worker.includes("./" + file), file);
  }
});
