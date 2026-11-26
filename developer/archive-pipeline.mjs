import { openArchiveDB, request, sha256, transaction } from "./archive-db.mjs";
import { archiveSchema, csvRecords, normalizeArchiveRecord } from "./archive-csv.mjs";
import { MAX_ARCHIVE_BYTES, readZipEntry, zipDirectory } from "./archive-zip.mjs";

import { acesRecords } from "./archive-acesapi.mjs";

const BATCH_SIZE = 250;
function auxiliaryKind(fields) {
  const keys = new Set(fields.map(v => v.trim().toLowerCase().replace(/[\s-]+/g, "_")));
  const has = (...names) => names.every(k => keys.has(k));
  if (has("ranking_date","rank","player")) return "historical_ranking";
  if (has("tour","id","elo","glicko")) return "rating_snapshot";
  if (has("circuit","metric","window_start","window_end")) return "performance_snapshot";
  if (has("match_id","pointnumber","pointwinner") || has("match_id","pt","ptwinner")) return "point_detail";
  if (has("match_id","player1","player2","slam") || has("match_id","player_1","player_2","charted_by")) return "match_metadata";
  if (has("match_id","player","row") || has("match_id","player","set") || has("match_id","server","returner","row")) return "charting_statistics";
  if (has("id","player","birthdate")) return "player_profile";
  return null;
}
function auxiliaryRow(archive, member, fileIndex, row, kind, sourceRecord, issues = []) {
  return {id: archive.id+":"+fileIndex+":"+row, archiveId:archive.id, member,fileIndex,row,kind,sourceRecord,issues,reviewStatus:"local_research_only"};
}
async function* jsonRecords(blob, archive, member, index) {
  const data = JSON.parse(await blob.text());
  if (Array.isArray(data?.items) && data.items.every(v => v && typeof v === "object" && "id" in v && "year" in v && "start_date" in v && "tour" in v)) {
    for (const [i, item] of data.items.entries()) yield auxiliaryRow(archive,member,index,i+1,"tournament_calendar",item);
    return;
  }
  yield* acesRecords(blob,archive,member,index);
}
export const newJob = id => ({
  id, state: "queued", stage: "integrity", fileIndex: 0, cursor: 0, files: null,
  rows: 0, issues: {}, scores: {}, duplicates: 0, missingScores: 0, suspectRows: 0,
  samples: [], checked: false
});
const get = (db, store, id) => transaction(db, [store], "readonly", tx => request(tx.objectStore(store).get(id)));

async function updateJob(db, id, update) {
  return transaction(db, ["archiveJobs"], "readwrite", async tx => {
    const store = tx.objectStore("archiveJobs");
    const job = await request(store.get(id));
    if (job) {
      update(job);
      store.put(job);
    }
    return job;
  });
}

export async function controlJob(db, id, action) {
  return updateJob(db, id, job => {
    if (action === "pause" && ["running", "queued"].includes(job.state)) job.state = "paused";
    if (action === "resume" && ["paused", "failed"].includes(job.state)) {
      job.state = "queued";
      delete job.error;
    }
  });
}

export async function importArchive(db, file, sourceHint) {
  const extension = /\.(csv|zip|json)$/i.exec(file.name)?.[1].toLowerCase();
  if (!extension || !file.size || file.size > MAX_ARCHIVE_BYTES) throw Error("Выберите CSV, JSON или ZIP размером от 1 байта до 100 МБ.");
  const hash = await sha256(file);
  return transaction(db, ["archives", "archiveJobs", "operations"], "readwrite", async tx => {
    const originals = tx.objectStore("archives");
    const existing = await request(originals.index("sha256").getKey(hash));
    if (existing !== undefined) return { id: existing, duplicate: true };
    const id = crypto.randomUUID();
    const importedAt = new Date().toISOString();
    originals.add({ id, name: file.name, sourceHint, format: extension, size: file.size, sha256: hash,
      importedAt, status: "original_stored_unclassified", mimeType: file.type, original: file });
    tx.objectStore("archiveJobs").add(newJob(id));
    tx.objectStore("operations").add({ id: crypto.randomUUID(), action: "Импорт", status: file.name, createdAt: importedAt });
    return { id, duplicate: false };
  });
}

export async function registerExisting(db) {
  return transaction(db, ["archives", "archiveJobs"], "readwrite", async tx => {
    const jobs = tx.objectStore("archiveJobs");
    const [ids, jobIds] = await Promise.all([
      request(tx.objectStore("archives").getAllKeys()), request(jobs.getAllKeys())
    ]);
    const registered = new Set(jobIds);
    for (const id of ids) if (!registered.has(id)) jobs.add(newJob(id));
  });
}

function evidence(row) {
  const { id, archiveId, member, row: number, matchId, date, tournament, tournamentId, category, round,
    surface, player1Name, player2Name, player1Id, player2Id, winnerId, winnerName, score, openOdds, closeOdds } = row;
  return { id, archiveId, member, row: number, matchId, date, tournament, tournamentId, category, round,
    surface, player1Name, player2Name, player1Id, player2Id, winnerId, winnerName, score, openOdds, closeOdds };
}

const bump = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };

async function commitBatch(db, id, fileIndex, batch) {
  return transaction(db, ["archiveJobs", "normalizedMatches", "duplicateRegistry", "archiveAuxiliary"], "readwrite", async tx => {
    const jobs = tx.objectStore("archiveJobs");
    const job = await request(jobs.get(id));
    if (job.state !== "running") return job;
    const matches = tx.objectStore("normalizedMatches");
    const duplicates = tx.objectStore("duplicateRegistry");
    for (const row of batch) {
      if (row.kind) {
        tx.objectStore("archiveAuxiliary").add(row);
        job.auxiliaryRows = (job.auxiliaryRows ?? 0) + 1;
        job.auxiliaryKinds ??= {};
        bump(job.auxiliaryKinds, row.kind);
        job.cursor = row.row;
        if (row.issues.length) job.suspectRows++;
        for (const issue of row.issues) bump(job.issues, issue);
        continue;
      }
      const links = new Map();
      for (const key of ["sourceKey", "naturalKey"]) {
        if (!row[key]) continue;
        const other = await request(matches.index(key).get(row[key]));
        if (other) links.set(other.id, { other, reasons: [...(links.get(other.id)?.reasons ?? []), key] });
      }
      for (const { other, reasons } of links.values()) {
        const pairId = "pair:" + JSON.stringify([other.id, row.id].sort());
        const current = await request(duplicates.get(pairId));
        let legacy;
        if (!current && fileIndex === 0 && other.fileIndex === 0 && other.archiveId === id &&
            other.matchId && row.matchId && other.matchId !== row.matchId) {
          legacy = await request(duplicates.get(id + ":" + other.matchId + ":" + row.matchId));
          // Legacy decisions can be linked only when the recorded match IDs and row positions agree.
          if (legacy?.first?.row !== other.row || legacy?.duplicate?.row !== row.row) legacy = undefined;
        }
        duplicates.put({ ...current, id: pairId, archiveId: id, first: evidence(other), duplicate: evidence(row),
          reasons, reviewStatus: current?.reviewStatus ?? legacy?.reviewStatus ?? "ожидает ручной проверки" });
        job.duplicates++;
      }
      matches.add(row);
      job.rows++;
      job.cursor = row.row;
      if (row.issues.length) job.suspectRows++;
      if (row.issues.includes("missing_score")) job.missingScores++;
      for (const issue of row.issues) bump(job.issues, issue);
      bump(job.scores, row.scoreClass);
      if (row.issues.length && job.samples.length < 12) {
        job.samples.push({ member: row.member, row: row.row, issues: row.issues, scoreClass: row.scoreClass });
      }
    }
    jobs.put(job);
    return job;
  });
}

export async function runArchive(id, progress) {
  if (!globalThis.navigator?.locks) throw Error("Браузер не поддерживает безопасную обработку архива между вкладками.");
  return navigator.locks.request("tvs-developer-archive-pipeline", async () => {
    const db = await openArchiveDB();
    let member;
    try {
      let job = await updateJob(db, id, item => {
        if (item.state === "queued") item.state = "running";
      });
      if (job?.state !== "running") return;
      const archive = await get(db, "archives", id);
      if (!archive?.original || archive.size !== archive.original.size) throw Error("Оригинал отсутствует или его размер изменился.");
      if (!job.checked && await sha256(archive.original) !== archive.sha256) throw Error("SHA-256 оригинала не совпадает.");
      const isZip = archive.format === "zip";
      const entries = isZip ? await zipDirectory(archive.original) : [{ name: archive.name }];
      job = await updateJob(db, id, item => {
        item.checked = true;
        item.stage = "records";
        item.files = entries.length;
      });
      progress(job);
      for (let index = job.fileIndex; index < entries.length && job.state === "running"; index++) {
        member = entries[index].name;
        const blob = isZip ? await readZipEntry(archive.original, entries[index]) : archive.original;
        let schema, auxiliary, headers, batch = [], total = 0;
        const json = /\.json$/i.test(member);
        const records = json ? jsonRecords(blob, archive, member, index) : csvRecords(blob);
        for await (const record of records) {
          if (!json && !schema && !auxiliary) {
            auxiliary = auxiliaryKind(record.fields);
            if (auxiliary) headers = record.fields;
            else schema = archiveSchema(record.fields);
            continue;
          }
          total++;
          if ((json ? record.row : record.record) <= job.cursor) {
            if (total % 2048 === 0 && (await get(db, "archiveJobs", id)).state !== "running") return;
            continue;
          }
          batch.push(json ? record : auxiliary ? auxiliaryRow(archive, member, index, record.record, auxiliary, {headers, fields: record.fields}, record.fields.length === headers.length ? [] : ["field_count"]) : normalizeArchiveRecord(record.fields, record.record, schema, archive, member, index));
          if (batch.length < BATCH_SIZE) continue;
          job = await commitBatch(db, id, index, batch);
          progress(job);
          if (job.state !== "running") return;
          batch = [];
        }
        if (!total) throw Error("В файле нет записей данных.");
        if (batch.length) job = await commitBatch(db, id, index, batch);
        job = await updateJob(db, id, item => {
          if (item.state !== "running") return;
          item.fileIndex = index + 1;
          item.cursor = 0;
          if (item.fileIndex === entries.length) {
            item.state = "completed";
            item.stage = "done";
            item.finishedAt = new Date().toISOString();
          }
        });
        progress(job);
      }
    } catch (error) {
      const message = error?.name === "QuotaExceededError" ? "Недостаточно места в хранилище устройства." : String(error?.message ?? error);
      const job = await updateJob(db, id, item => {
        if (item.state !== "running") return;
        item.state = "failed";
        item.error = { member, message };
      });
      progress(job);
    } finally {
      db.close();
    }
  });
}
