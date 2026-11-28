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

 
// Exercise the same live API chain used by the independent player-comparison screen.
// These checks use only the isolated Preview Worker and public player names.
const comparisonStartedAt = new Date().toISOString();
const searchPlayer = async name => {
  const payload = await getJson("/players/search?" + new URLSearchParams({ search: name, limit: "8" }));
  const players = Array.isArray(payload.players) ? payload.players : [];
  const exact = players.find(player => String(player?.name || "").trim().toLocaleLowerCase() === name.toLocaleLowerCase());
  const selected = exact || players.find(player => Number.isSafeInteger(Number(player?.id)) && Number(player.id) > 0);
  if (!selected || !Number.isSafeInteger(Number(selected.id)) || Number(selected.id) <= 0 || !String(selected.name || "").trim()) {
    throw new Error("Player comparison smoke: /players/search did not return a selectable player for " + name);
  }
  return { id: Number(selected.id), name: String(selected.name) };
};
const comparisonPlayerA = await searchPlayer("Carlos Alcaraz");
const comparisonPlayerB = await searchPlayer("Jannik Sinner");
if (comparisonPlayerA.id === comparisonPlayerB.id) throw new Error("Player comparison smoke selected the same player ID twice");
const comparisonResponse = await fetch(base + "/predict", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    playerIdA: comparisonPlayerA.id,
    playerIdB: comparisonPlayerB.id,
    playerA: comparisonPlayerA.name,
    playerB: comparisonPlayerB.name,
    surface: ""
  }),
  signal: AbortSignal.timeout(30000)
});
const comparisonPrediction = await comparisonResponse.json().catch(() => null);
let comparisonMode = "numeric_elo";
let comparisonDiagnostic = null;
let probabilityA = null;
let probabilityB = null;
if (!comparisonResponse.ok) {
  if (comparisonResponse.status !== 422 ||
      comparisonPrediction?.error !== "Elo rating is unavailable for one or both players" ||
      !comparisonPrediction?.diagnostic?.profileIdentityA?.name ||
      !comparisonPrediction?.diagnostic?.profileIdentityB?.name) {
    throw new Error("Player comparison smoke: /predict returned HTTP " + comparisonResponse.status +
      " (" + String(comparisonPrediction?.error || comparisonPrediction?.accessStatus || "invalid response") + ")");
  }
  comparisonMode = "profile_fallback_numeric_elo_unavailable";
  comparisonDiagnostic = {
    playerA: comparisonPrediction.diagnostic.profileIdentityA,
    playerB: comparisonPrediction.diagnostic.profileIdentityB,
    eloFieldsA: comparisonPrediction.diagnostic.eloFieldsA || [],
    eloFieldsB: comparisonPrediction.diagnostic.eloFieldsB || []
  };
} else {
  probabilityA = Number(comparisonPrediction?.probabilityA);
  probabilityB = Number(comparisonPrediction?.probabilityB);
  if (!Number.isFinite(probabilityA) || !Number.isFinite(probabilityB) ||
      probabilityA <= 0 || probabilityA >= 100 || probabilityB <= 0 || probabilityB >= 100 ||
      Math.abs(probabilityA + probabilityB - 100) > 0.05 ||
      !Number.isFinite(Number(comparisonPrediction?.ratingA)) || Number(comparisonPrediction.ratingA) <= 0 ||
      !Number.isFinite(Number(comparisonPrediction?.ratingB)) || Number(comparisonPrediction.ratingB) <= 0) {
    throw new Error("Player comparison smoke: /predict returned invalid Elo ratings or probabilities");
  }
}
const optionalComparisonChecks = await Promise.all([
  ["historyA", "/player-history?" + new URLSearchParams({ id: String(comparisonPlayerA.id), limit: "5" })],
  ["historyB", "/player-history?" + new URLSearchParams({ id: String(comparisonPlayerB.id), limit: "5" })],
  ["h2h", "/player-h2h?" + new URLSearchParams({ p1: comparisonPlayerA.name, p2: comparisonPlayerB.name })]
].map(async ([name, path]) => {
  try {
    const payload = await getJson(path);
    return { name, ok: true, accessStatus: payload.accessStatus || "available",
      count: Number.isFinite(Number(payload.count)) ? Number(payload.count) :
        (Array.isArray(payload.data) ? payload.data.length : Array.isArray(payload.meetings) ? payload.meetings.length : null) };
  } catch (error) {
    return { name, ok: false, error: String(error.message || error).slice(0, 180) };
  }
}));
const comparisonReport = {
  checkedAt: comparisonStartedAt,
  search: "passed",
  profileLookup: "passed",
  numericElo: comparisonMode === "numeric_elo" ? "passed" : "unavailable",
  playerA: comparisonPlayerA.name,
  playerB: comparisonPlayerB.name,
  mode: comparisonMode,
  ratingA: comparisonMode === "numeric_elo" ? Number(comparisonPrediction.ratingA) : null,
  ratingB: comparisonMode === "numeric_elo" ? Number(comparisonPrediction.ratingB) : null,
  probabilityA,
  probabilityB,
  diagnostic: comparisonDiagnostic,
  source: comparisonPrediction.source || null,
  supplementary: optionalComparisonChecks
};

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

const developerHtml = readFileSync(new URL("../developer/index.html", import.meta.url), "utf8");
const developerComparisonChecks = {
  fallbackRenderer: developerHtml.includes("function renderCompareUnavailableElo("),
  handlesMissingElo422: developerHtml.includes("response.status===422&&payload?.error==='Elo rating is unavailable for one or both players'"),
  keepsHistoryAndH2H: developerHtml.includes("loadCompareSupplementary(requestId,idA,idB,exactNameA,exactNameB).catch"),
  doesNotTreatEloRankAsRating: developerHtml.includes("Место в Elo-рейтинге не является рейтингом Elo")
};
if (Object.values(developerComparisonChecks).some(value => value !== true)) {
  throw new Error("Developer comparison fallback is missing or incomplete: " + JSON.stringify(developerComparisonChecks));
}

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
const oddsEvents = new Map();
for (const item of items) {
  const key = [item?.bookmaker, item?.eventId || item?.eventName, item?.startTime].join("|");
  if (!oddsEvents.has(key)) {
    oddsEvents.set(key, {
      event: item?.eventName || null,
      home: item?.homeTeam || null,
      away: item?.awayTeam || null,
      sport: item?.sport || null,
      marketType: item?.marketType || null,
      competition: item?.competition || null,
      eventType: /doubles/i.test(String(item?.competition || "")) || /\//.test(String(item?.homeTeam || "") + String(item?.awayTeam || "")) ? "doubles"
        : /davis cup|coupe davis|billie jean king cup|united cup/i.test(String(item?.competition || "")) ? "team_tie"
        : "singles_or_unknown",
      bookmakerCountry: item?.bookmakerCountry || null,
      startTime: item?.startTime || null,
      scrapedAt: item?.scrapedAt || null,
      outcomes: []
    });
  }
  oddsEvents.get(key).outcomes.push(String(item?.outcome || "unknown"));
}
const notPrematchSamples = matches.filter(match => sandbox.audit.oddsMatchDiagnostic(match).code === "not_prematch")
  .slice(0, 8)
  .map(match => ({
    matchId: match?.id ?? match?.matchId ?? null,
    player1: playerName(match?.players?.p1 || match?.player1),
    player2: playerName(match?.players?.p2 || match?.player2),
    scheduledTime: match?.startTime || match?.scheduled_time || match?.date || match?.start_time || null,
    status: match?.status || match?.event_status || null
  }));
const sportMarkets = {};
for (const item of items) {
  const key = String(item?.sport || "unknown") + "|" + String(item?.marketType || "unknown");
  sportMarkets[key] = (sportMarkets[key] || 0) + 1;
}
const eventTypeCounts = {};
for (const event of oddsEvents.values()) {
  eventTypeCounts[event.eventType] = (eventTypeCounts[event.eventType] || 0) + 1;
}
const report = {
  checkedAt: new Date().toISOString(),
  previewWorkerBuild: health.buildId || null,
  playerComparison: comparisonReport,
  developerComparisonUi: developerComparisonChecks,
  upcomingMatches: matches.length,
  schedulePagesLoaded: pagesLoaded,
  scheduleTotalReported: total,
  scheduleTruncated: hasMore,
  oddsRecords: items.length,
  recordsByBookmaker: bookmakers,
  recordsBySportAndMarket: sportMarkets,
  eventTypeCounts,
  completeFreshWinamaxPairs: completePairs,
  missingPairReasons: reasons,
  oddsEventSamples: [...oddsEvents.values()].slice(0, 8),
  notPrematchSamples,
  latestApifyTaskRun: odds.taskRun ? {
    status: odds.taskRun.status || null,
    finishedAt: odds.taskRun.finishedAt || null,
    origin: odds.taskRun.origin || null,
    scheduled: Boolean(odds.taskRun.scheduled)
  } : null,
  taskRunMetadataStatus: odds.taskRunDiagnostic || null
};
console.log(JSON.stringify(report, null, 2));
