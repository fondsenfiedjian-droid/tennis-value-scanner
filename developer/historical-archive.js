import { openArchiveDB, request, transaction } from "./archive-db.mjs";
import { controlJob, importArchive, registerExisting } from "./archive-pipeline.mjs";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const states = { queued: "В очереди", running: "В работе", paused: "На паузе", failed: "Ошибка", completed: "Завершено" };
const labels = {
  field_count: "Число полей", invalid_players: "Данные игроков", winner_unknown: "Победитель не определён",
  date_unknown: "Дата не распознана", category_unknown: "Категория не указана", surface_unknown: "Покрытие не распознано",
  missing_score: "Нет счёта", score_format: "Формат счёта", odds_format: "Формат коэффициентов",
  score_present: "Счёт указан", unknown: "Исход по счёту неизвестен", retirement: "Отказ игрока",
  walkover: "Неявка или снятие", default: "Дисквалификация", interrupted: "Прерван или отменён"
};
const PAGE_SIZE = 20;
let db, worker, dispatching = false, blocked = false, selected, page = 0, revision = 0;

function notify(message) {
  $("historicalArchiveStatus").textContent = message;
}

function readArchiveSummaries() {
  return transaction(db, ["archives", "archiveJobs", "operations"], "readonly", async tx => {
    const originals = tx.objectStore("archives").index("importedAt");
    const files = [];
    const readFiles = cursorList(originals.openCursor(null, "prev"), value => {
      const { original, ...metadata } = value;
      files.push(metadata);
    });
    const log = [];
    const readLog = cursorList(tx.objectStore("operations").index("createdAt").openCursor(null, "prev"), value => {
      log.push(value);
      return log.length < 20;
    });
    const [jobs] = await Promise.all([request(tx.objectStore("archiveJobs").getAll()), readFiles, readLog]);
    return { files, jobs: new Map(jobs.map(job => [job.id, job])), log };
  });
}

function cursorList(req, visit) {
  return new Promise((resolve, reject) => {
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || visit(cursor.value) === false) resolve();
      else cursor.continue();
    };
  });
}

function readPairs(id) {
  return transaction(db, ["duplicateRegistry"], "readonly", async tx => {
    const entries = [];
    let skipped = 0;
    const query = tx.objectStore("duplicateRegistry").index("archiveId").openCursor(IDBKeyRange.only(id));
    await cursorList(query, entry => {
      if (!entry.id.startsWith("pair:") || skipped++ < page * PAGE_SIZE) return;
      entries.push(entry);
      return entries.length <= PAGE_SIZE;
    });
    return entries;
  });
}

const button = (id, action, text) =>
  '<button type="button" class="secondary-btn" data-archive-id="' + esc(id) + '" data-action="' + action + '">' + text + '</button>';
const counts = data => Object.entries(data).map(([name, count]) => '<li>' + esc(labels[name] ?? name) + ' · ' + count + '</li>').join("");
function pairRow(row) {
  return '<div>' + esc(row.member) + ' · запись ' + row.row + ' · ' +
    esc([row.date, row.tournament, row.category, row.round, row.surface].filter(Boolean).join(" / ")) +
    '</div><div>' + esc(row.player1Name) + ' — ' + esc(row.player2Name) + ' · ' +
    esc(row.winnerName || "победитель неизвестен") + ' · ' + esc(row.score || "счёта нет") +
    ' · открытие ' + esc(row.openOdds.map(v => v ?? "—").join("/")) +
    ' · закрытие ' + esc(row.closeOdds.map(v => v ?? "—").join("/")) + '</div>';
}

async function render() {
  const version = ++revision;
  const { files, jobs, log } = await readArchiveSummaries();
  const job = selected && jobs.get(selected);
  const pairs = job ? await readPairs(selected) : [];
  if (version !== revision) return;
  $("historicalArchiveCount").textContent = files.length;
  $("historicalArchiveList").innerHTML = files.map(file => {
    const item = jobs.get(file.id);
    const info = item ? [
      states[item.state], item.checked ? "SHA-256 проверен" : "проверка целостности",
      item.files ? "файлов обработано " + item.fileIndex + " из " + item.files : "",
      item.rows.toLocaleString("ru-RU") + " записей"
    ].filter(Boolean).join(" · ") : "Регистрация обработки";
    const control = item && (["running", "queued"].includes(item.state) ? button(file.id, "pause", "Пауза") :
      item.state === "paused" ? button(file.id, "resume", "Продолжить") :
      item.state === "failed" ? button(file.id, "resume", "Повторить") : "");
    return '<article class="archive-item"><b>' + esc(file.name) + '</b><div class="archive-meta">' +
      esc(info) + '</div><div class="archive-meta" style="overflow-wrap:anywhere">SHA-256 ' + esc(file.sha256) + '</div>' +
      (item?.error ? '<p>' + esc([item.error.member, item.error.message].filter(Boolean).join(" · ")) + '</p>' : "") +
      (control || "") + button(file.id, "details", "Результаты") + '</article>';
  }).join("") || "Исторических архивов пока нет.";
  $("historicalArchiveLog").innerHTML = log.map(o => '<div class="archive-item">' +
    esc(o.action) + ' · ' + esc(o.status) + ' · ' + esc(new Date(o.createdAt).toLocaleString("ru-RU")) + '</div>').join("") || "Операций пока нет.";
  if (!job) return;
  const details = $("historicalArchiveAnalysis");
  const visible = pairs.slice(0, PAGE_SIZE);
  details.hidden = false;
  details.innerHTML = '<h3>' + esc(files.find(file => file.id === selected)?.name) + '</h3><p>' +
    job.rows + ' записей · ' + job.suspectRows + ' с замечаниями · ' + job.missingScores + ' без счёта · ' +
    job.duplicates + ' пар для проверки</p><ul>' + counts(job.scores) + counts(job.issues) + '</ul>' +
    (job.samples.length ? '<h4>Примеры замечаний</h4><ul>' + job.samples.map(row => '<li>' + esc(row.member) +
      ' · запись ' + row.row + ' · ' + esc(row.issues.map(issue => labels[issue] ?? issue).join(", ")) + '</li>').join("") + '</ul>' : "") +
    (visible.length ? '<h4>Кандидаты на совпадение</h4>' + visible.map(pair =>
      '<article class="archive-item">' + pairRow(pair.first) + pairRow(pair.duplicate) + '<b>' +
      esc(pair.reviewStatus) + '</b><div>' +
      (pair.reasons.includes("sourceKey") ? "Совпадает ID матча. " : "") +
      (pair.reasons.includes("naturalKey") ? "Совпадают дата, турнир и ID игроков." : "") + '</div>' +
      button(pair.id, "same", "Одна встреча") + button(pair.id, "distinct", "Разные встречи") +
      button(pair.id, "pending", "На проверку") + '</article>').join("") : "") +
    (page ? button(selected, "prev", "Предыдущие пары") : "") +
    (pairs.length > PAGE_SIZE ? button(selected, "next", "Следующие пары") : "");
}

async function dispatch() {
  if (worker || dispatching || blocked) return;
  dispatching = true;
  try {
    const next = await transaction(db, ["archiveJobs"], "readonly", async tx =>
      (await request(tx.objectStore("archiveJobs").getAll())).find(job => ["queued", "running"].includes(job.state)));
    if (!next) return;
    worker = new Worker(new URL("./archive-worker.mjs", import.meta.url), { type: "module" });
    const finish = error => {
      worker.terminate();
      worker = undefined;
      if (error) {
        blocked = true;
        notify("Обработка остановлена: " + error + " Обновите центр архивов для повторной попытки.");
      }
      refresh().catch(handleError);
    };
    worker.onerror = event => finish(event.message || "Сбой фонового обработчика.");
    let renderedAt = 0;
    worker.onmessage = ({ data }) => {
      if (data.error || data.done) finish(data.error);
      else if (data.job && Date.now() - renderedAt >= 750) {
        renderedAt = Date.now();
        render().catch(handleError);
      }
    };
    worker.postMessage(next.id);
  } finally {
    dispatching = false;
  }
}

function handleError(error) {
  notify("Ошибка архива: " + (error?.message || error));
}
async function refresh() {
  await render();
  await dispatch();
}

async function review(id, decision) {
  await transaction(db, ["duplicateRegistry"], "readwrite", async tx => {
    const store = tx.objectStore("duplicateRegistry");
    const pair = await request(store.get(id));
    if (!pair) return;
    pair.reviewStatus = {
      same: "Подтверждено: одна встреча. Счёт и коэффициенты требуют отдельной проверки.",
      distinct: "Подтверждено: разные встречи.",
      pending: "ожидает ручной проверки"
    }[decision];
    pair.updatedAt = new Date().toISOString();
    store.put(pair);
  });
}

async function init() {
  db = await openArchiveDB();
  await registerExisting(db);
  $("historicalArchiveImport").addEventListener("click", async event => {
    const file = $("historicalArchiveFile").files[0];
    if (!file) return notify("Выберите CSV, JSON или ZIP.");
    const submit = event.currentTarget;
    submit.disabled = true;
    notify("Вычисляется SHA-256 и сохраняется оригинал…");
    try {
      const result = await importArchive(db, file, $("historicalArchiveSource").value);
      selected = result.id;
      page = 0;
      $("historicalArchiveFile").value = "";
      notify(result.duplicate ? "Этот оригинал уже в архиве." : "Оригинал сохранён. Обработка поставлена в очередь.");
      await refresh();
    } catch (error) { handleError(error); }
    finally { submit.disabled = false; }
  });
  $("historicalArchiveRefresh").addEventListener("click", () => {
    blocked = false;
    notify("Обновление центра архивов.");
    refresh().catch(handleError);
  });
  $("historicalArchivePanel").addEventListener("click", async event => {
    const target = event.target.closest("[data-action][data-archive-id]");
    if (!target) return;
    const { action, archiveId } = target.dataset;
    try {
      if (action === "details") { selected = archiveId; page = 0; }
      if (action === "prev") page = Math.max(0, page - 1);
      if (action === "next") page++;
      if (action === "pause" || action === "resume") await controlJob(db, archiveId, action);
      if (["same", "distinct", "pending"].includes(action)) await review(archiveId, action);
      await refresh();
    } catch (error) { handleError(error); }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh().catch(handleError);
  });
  notify("Автоматическая обработка включена.");
  await refresh();
}

if ($("historicalArchivePanel")) init().catch(handleError);
