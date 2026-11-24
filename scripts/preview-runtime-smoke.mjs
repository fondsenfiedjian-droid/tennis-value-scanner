import { readFileSync } from "node:fs";
import vm from "node:vm";

const base = (process.env.PREVIEW_WORKER_URL || "https://tennis-value-api-preview.fonds-enfiedjian.workers.dev").replace(/\/+$/, "");
const getJson = async path => {
  const response = await fetch(base + path, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(25000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = payload?.error || "invalid or empty response";
    throw new Error(path + " returned HTTP " + response.status + ": " + reason);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(path + " returned an unexpected JSON shape");
  }
  return payload;
};

const health = await getJson("/health");
if (health.status !== "ok") throw new Error("Preview Worker health check did not return status=ok");
if (!health.liveTennisApiConfigured) throw new Error("Preview Worker is missing LIVE_TENNIS_API_KEY");
if (!health.apifyTokenConfigured) throw new Error("Preview Worker is missing APIFY_TOKEN; Winamax feed cannot be verified");

const now = new Date();
const from = new Date(now);
from.setHours(0, 0, 0, 0);
const to = new Date(from);
to.setDate(to.getDate() + 7);
to.setMilliseconds(-1);
const rows = [];
let offset = 0;
let pagesLoaded = 0;
let total = null;
let hasMore = false;
for (let page = 0; page < 4; page++) {
  const params = new URLSearchParams({
    status: "upcoming",
    draw: "singles",
    limit: "200",
    from: from.toISOString(),
    to: to.toISOString(),
    offset: String(offset)
  });
  const payload = await getJson("/matches?" + params.toString());
  const pageRows = Array.isArray(payload.data) ? payload.data : [];
  rows.push(...pageRows);
  pagesLoaded++;
  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  if (meta.total !== null && meta.total !== undefined && Number.isFinite(Number(meta.total))) total = Number(meta.total);
  hasMore = meta.has_more === true;
  if (!hasMore) break;
  const count = Number(meta.count);
  if (!Number.isInteger(count) || count <= 0 || pageRows.length === 0) {
    throw new Error("Schedule pagination metadata is inconsistent");
  }
  const currentOffset = Number.isInteger(Number(meta.offset)) ? Number(meta.offset) : offset;
  offset = currentOffset + count;
}
const seen = new Set();
const matches = rows.filter(match => {
  const id = String(match?.id ?? match?.matchId ?? "");
  if (!id || seen.has(id)) return false;
  seen.add(id);
  return true;
});
const odds = await getJson("/odds");
const items = Array.isArray(odds.items) ? odds.items : [];
if (!Array.isArray(odds.items)) throw new Error("/odds response does not contain an items array");

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function normalizePlayer(s)");
const end = html.indexOf("function normalizeTour(value)", start);
if (start < 0 || end <= start) throw new Error("Could not load the TVS odds-matching functions");

const playerName = value => typeof value === "string" ? value
  : String(value?.name || value?.player_name || value?.full_name || "");
const matchDate = match => {
  const raw = match?.startTime || match?.scheduled_time || match?.date || match?.start_time || match?.datetime;
  return raw ? new Date(raw) : null;
};
const sandbox = {
  Date, Map, Number, String, Math, Object, Array,
  cachedOdds: items,
  ODDS_FRESHNESS_MAX_AGE_MS: 6 * 60 * 60 * 1000,
  playerName,
  matchDate
};
vm.runInNewContext(
  html.slice(start, end) + "\nglobalThis.audit = { oddsForMatch, oddsMatchDiagnostic };",
  sandbox
);

const reasons = {};
let completePairs = 0;
for (const match of matches) {
  const pair = sandbox.audit.oddsForMatch(match);
  if (pair.length >= 2) {
    completePairs++;
  } else {
    const diagnostic = sandbox.audit.oddsMatchDiagnostic(match);
    reasons[diagnostic.code] = (reasons[diagnostic.code] || 0) + 1;
  }
}
const bookmakers = {};
for (const item of items) {
  const name = String(item?.bookmaker || "unknown").trim().toLowerCase();
  bookmakers[name] = (bookmakers[name] || 0) + 1;
}
const report = {
  previewWorkerBuild: health.buildId || null,
  upcomingMatches: matches.length,
  schedulePagesLoaded: pagesLoaded,
  scheduleTotalReported: total,
  scheduleTruncated: hasMore,
  oddsRecords: items.length,
  recordsByBookmaker: bookmakers,
  completeFreshWinamaxPairs: completePairs,
  missingPairReasons: reasons,
  latestApifyTaskRun: odds.taskRun ? {
    status: odds.taskRun.status || null,
    finishedAt: odds.taskRun.finishedAt || null,
    origin: odds.taskRun.origin || null,
    scheduled: Boolean(odds.taskRun.scheduled)
  } : null,
  taskRunMetadataStatus: odds.taskRunDiagnostic || null
};
console.log(JSON.stringify(report, null, 2));
