import vm from "node:vm";

const APP_URL = process.env.APP_URL || "https://deploy-preview-167--fascinating-paprenjak-1aa9b3.netlify.app";
const API_URL = process.env.API_URL || "https://tennis-value-api-preview.fonds-enfiedjian.workers.dev";
const timeout = AbortSignal.timeout(20000);

async function getJson(url) {
  const response = await fetch(url, { signal: timeout, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return { data: await response.json(), cache: response.headers.get("X-Data-Cache") || "unknown" };
}

const [htmlResponse, matchesResponse, oddsResponse] = await Promise.all([
  fetch(APP_URL, { signal: timeout }),
  getJson(API_URL + "/matches?status=upcoming&draw=singles&limit=200"),
  getJson(API_URL + "/odds")
]);
if (!htmlResponse.ok) throw new Error(`Preview app returned HTTP ${htmlResponse.status}`);
const html = await htmlResponse.text();

const scheduleStart = html.indexOf("function extractMatches(payload)");
const scheduleEnd = html.indexOf("function archiveMatchDate(m)", scheduleStart);
const oddsStart = html.indexOf("function normalizePlayer(s)");
const oddsEnd = html.indexOf("function normalizeTour(value)", oddsStart);
if ([scheduleStart, scheduleEnd, oddsStart, oddsEnd].some(index => index < 0)) {
  throw new Error("Could not locate Preview schedule/odds matching functions");
}
const freshnessConstant = html.match(/const\s+ODDS_FRESHNESS_MAX_AGE_MS\s*=\s*([0-9][0-9\s*]*)\s*;/);
if (!freshnessConstant) throw new Error("Could not locate Preview odds freshness setting");
const freshnessMs = freshnessConstant[1].split("*").map(part => Number(part.trim())).reduce((total, value) => total * value, 1);
const sandbox = { cachedOdds: oddsResponse.data.items, ODDS_FRESHNESS_MAX_AGE_MS: freshnessMs,
  Date, Set, Map, Number, String, Math, Object, Array, RegExp, JSON };
const source = html.slice(scheduleStart, scheduleEnd) + "\n" + html.slice(oddsStart, oddsEnd) +
  "\nglobalThis.auditFns = { extractMatches, playerName, getPlayerId, matchDate, oddsForMatch, oddsSideForPlayer, playerNamesMatch, tournamentCompatible, normalizePlayer, oddsEventParticipants };";
vm.runInNewContext(source, sandbox);
const f = sandbox.auditFns;
const matches = f.extractMatches(matchesResponse.data);
const odds = oddsResponse.data.items;
if (!Array.isArray(matches) || !Array.isArray(odds)) throw new Error("Unexpected Preview API payload shape");

function date(v) { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }
function names(o) {
  const parts = f.oddsEventParticipants(o);
  return parts;
}
const linked = [];
for (const q of odds) {
  const { home, away } = names(q);
  const candidates = matches.filter(m => {
    const p = m.players || {};
    const a = f.normalizePlayer(f.playerName(p.p1 || m.player1));
    const b = f.normalizePlayer(f.playerName(p.p2 || m.player2));
    return (f.playerNamesMatch(home, a) && f.playerNamesMatch(away, b)) ||
      (f.playerNamesMatch(home, b) && f.playerNamesMatch(away, a));
  }).map(m => {
    const p = m.players || {};
    const a = f.playerName(p.p1 || m.player1);
    const b = f.playerName(p.p2 || m.player2);
    const start = f.matchDate(m);
    const qStart = new Date(q.startTime);
    const selected = f.oddsForMatch(m);
    return {
      match: a + " — " + b,
      tournament: m.tournament_name || m.tournament || m.event_name || m.competition || null,
      matchStart: start ? start.toISOString() : null,
      oddsStart: date(q.startTime),
      deltaHours: start && Number.isFinite(qStart.getTime()) ? Number(((qStart - start) / 3600000).toFixed(2)) : null,
      status: m.status || null,
      playerIds: [f.getPlayerId(p.p1 || m.player1), f.getPlayerId(p.p2 || m.player2)],
      tournamentCompatible: f.tournamentCompatible(m.tournament_name || m.tournament || m.event_name || m.competition || "", q.competition),
      selectedQuoteCount: selected.length
    };
  });
  linked.push({
    quote: {
      bookmaker: q.bookmaker, country: q.bookmakerCountry, sport: q.sport, marketType: q.marketType,
      outcome: q.outcome, oddsDecimal: q.oddsDecimal, homeTeam: q.homeTeam, awayTeam: q.awayTeam,
      eventName: q.eventName, competition: q.competition, eventId: q.eventId,
      startTime: date(q.startTime), scrapedAt: date(q.scrapedAt)
    },
    participantMatchesInSchedule: candidates
  });
}
const fullMarkets = matches.map(m => ({ m, selected: f.oddsForMatch(m) })).filter(x => x.selected.length >= 2);
console.log("PREVIEW URLS", JSON.stringify({ app: APP_URL, api: API_URL }));
console.log("SCHEDULE", JSON.stringify({ count: matches.length, cache: matchesResponse.cache,
  sample: matches.slice(0, 5).map(m => ({ players: [f.playerName((m.players||{}).p1||m.player1), f.playerName((m.players||{}).p2||m.player2)],
    start: date(f.matchDate(m)), ids: [f.getPlayerId((m.players||{}).p1||m.player1), f.getPlayerId((m.players||{}).p2||m.player2)] })) }));
console.log("ODDS META", JSON.stringify({ count: odds.length, cache: oddsResponse.cache,
  diagnostics: oddsResponse.data.diagnostics || null, retrievedAt: oddsResponse.data.retrievedAt || null }));
for (const row of linked) console.log("QUOTE AUDIT", JSON.stringify(row));
console.log("MATCHED COMPLETE MARKETS", JSON.stringify(fullMarkets.map(({m,selected}) => ({
  players: [f.playerName((m.players||{}).p1||m.player1), f.playerName((m.players||{}).p2||m.player2)],
  tournament: m.tournament_name || m.tournament || null,
  start: date(f.matchDate(m)), ids: [f.getPlayerId((m.players||{}).p1||m.player1), f.getPlayerId((m.players||{}).p2||m.player2)],
  quoteCount: selected.length, odds: selected.map(q => q.oddsDecimal)
}))));
if (!odds.length) throw new Error("Preview Winamax feed returned zero odds rows");
