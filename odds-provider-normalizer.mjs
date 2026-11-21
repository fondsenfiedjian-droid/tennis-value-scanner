const BOOKMAKER_KEYS = Object.freeze({
  betclic_fr: "betclic",
  netbet_fr: "netbet",
  winamax_fr: "winamax"
});

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePlayerName(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function validDecimalOdds(value) {
  const odds = Number(value);
  return Number.isFinite(odds) && odds > 1 && odds <= 1000 ? odds : null;
}

function normalizeOutcome(name, homeTeam, awayTeam) {
  const candidate = normalizePlayerName(name);
  if (!candidate) return null;
  if (candidate === normalizePlayerName(homeTeam)) return "home";
  if (candidate === normalizePlayerName(awayTeam)) return "away";
  return null;
}

function normalizeOddsApiPayload(payload, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const allowedBookmakers = new Set(options.bookmakers || ["betclic_fr", "netbet_fr"]);
  const events = Array.isArray(payload) ? payload : [];
  const rows = [];

  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const homeTeam = cleanText(event.home_team);
    const awayTeam = cleanText(event.away_team);
    const startTime = cleanText(event.commence_time);
    if (!homeTeam || !awayTeam || !Number.isFinite(Date.parse(startTime))) continue;

    for (const bookmaker of Array.isArray(event.bookmakers) ? event.bookmakers : []) {
      const bookmakerKey = cleanText(bookmaker?.key);
      const bookmakerName = BOOKMAKER_KEYS[bookmakerKey];
      if (!bookmakerName || !allowedBookmakers.has(bookmakerKey)) continue;

      for (const market of Array.isArray(bookmaker.markets) ? bookmaker.markets : []) {
        if (market?.key !== "h2h") continue;
        const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
        const validOutcomes = outcomes.map(outcome => {
          const oddsDecimal = validDecimalOdds(outcome?.price);
          const side = normalizeOutcome(outcome?.name, homeTeam, awayTeam);
          if (oddsDecimal === null || !side) return null;
          return { side, outcomeName: cleanText(outcome.name), oddsDecimal };
        }).filter(Boolean);
        const uniqueSides = new Set(validOutcomes.map(outcome => outcome.side));
        const complete = uniqueSides.has("home") && uniqueSides.has("away");
        for (const outcome of validOutcomes) {
          rows.push({
            bookmaker: bookmakerName,
            bookmakerCountry: "FR",
            sport: "tennis",
            marketType: "match_winner",
            eventId: String(event.id || ""),
            sourceEventId: String(event.id || ""),
            eventName: homeTeam + " - " + awayTeam,
            homeTeam,
            awayTeam,
            startTime: new Date(startTime).toISOString(),
            outcome: outcome.side,
            outcomeName: outcome.outcomeName,
            oddsDecimal: outcome.oddsDecimal,
            marketComplete: complete,
            isLive: Date.parse(startTime) <= Date.parse(retrievedAt),
            scrapedAt: cleanText(market.last_update) || cleanText(bookmaker.last_update) || retrievedAt,
            source: "the-odds-api",
            sourceBookmakerKey: bookmakerKey
          });
        }
      }
    }
  }
  return rows;
}

function normalizeFlatBookmakerRows(items, bookmakerName, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const rows = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== "object") continue;
    const homeTeam = cleanText(item.homeTeam || item.player1);
    const awayTeam = cleanText(item.awayTeam || item.player2);
    const oddsDecimal = validDecimalOdds(item.oddsDecimal);
    const outcomeName = cleanText(item.outcomeName || item.outcome);
    const outcome = normalizeOutcome(outcomeName, homeTeam, awayTeam);
    const startTime = cleanText(item.startTime);
    if (!homeTeam || !awayTeam || !outcome || oddsDecimal === null || !Number.isFinite(Date.parse(startTime))) continue;
    rows.push({
      bookmaker: bookmakerName,
      bookmakerCountry: cleanText(item.bookmakerCountry) || "FR",
      sport: "tennis",
      marketType: "match_winner",
      eventId: String(item.eventId || ""),
      sourceEventId: String(item.eventId || ""),
      eventName: cleanText(item.eventName) || homeTeam + " - " + awayTeam,
      homeTeam,
      awayTeam,
      startTime: new Date(startTime).toISOString(),
      outcome,
      outcomeName,
      oddsDecimal,
      marketComplete: item.marketComplete === true,
      isLive: item.isLive === true,
      scrapedAt: cleanText(item.scrapedAt) || retrievedAt,
      source: cleanText(item.source) || "flat-bookmaker-feed",
      sourceUrl: cleanText(item.sourceUrl) || null
    });
  }
  return rows;
}

function oddsEventsMatch(a, b, toleranceMinutes = 180) {
  if (!a || !b) return false;
  const aHome = normalizePlayerName(a.homeTeam);
  const aAway = normalizePlayerName(a.awayTeam);
  const bHome = normalizePlayerName(b.homeTeam);
  const bAway = normalizePlayerName(b.awayTeam);
  if (!aHome || !aAway || !bHome || !bAway) return false;
  const samePlayers = (aHome === bHome && aAway === bAway) || (aHome === bAway && aAway === bHome);
  if (!samePlayers) return false;
  const aTime = Date.parse(a.startTime);
  const bTime = Date.parse(b.startTime);
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return false;
  return Math.abs(aTime - bTime) <= toleranceMinutes * 60 * 1000;
}

function calculateBookmakerEv(modelProbability, oddsDecimal) {
  const probability = Number(modelProbability);
  const odds = validDecimalOdds(oddsDecimal);
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1 || odds === null) return null;
  return (probability * odds - 1) * 100;
}

export {
  BOOKMAKER_KEYS,
  normalizePlayerName,
  validDecimalOdds,
  normalizeOddsApiPayload,
  normalizeFlatBookmakerRows,
  oddsEventsMatch,
  calculateBookmakerEv
};
