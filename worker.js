const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "Retry-After, X-Data-Cache"
};

const APIFY_TASK_ID = "s9Des4R3jhMfA8e3s";
const ODDS_FRESHNESS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const WORKER_BUILD_ID = "tvs2-live-tennis-markets-2026-11-23-1";

function diagnoseOddsItems(items, now = Date.now()) {
  const fields = [
    "bookmaker", "bookmakerCountry", "sport", "marketType", "line",
    "eventId", "outcome", "homeTeam", "awayTeam", "eventName",
    "competition", "startTime", "scrapedAt", "oddsDecimal"
  ];
  const present = Object.fromEntries(fields.map(field => [
    field,
    items.filter(item => item && typeof item === "object" && !Array.isArray(item)
      && item[field] !== undefined && item[field] !== null && item[field] !== "").length
  ]));
  const timestamps = items.map(item => Date.parse(item?.scrapedAt))
    .filter(value => Number.isFinite(value));
  const validOdds = items.filter(item => {
    const value = Number(item?.oddsDecimal);
    return Number.isFinite(value) && value > 1;
  }).length;
  const bookmakers = [...new Set(items.map(item => String(item?.bookmaker || "").trim()).filter(Boolean))];
  const outcomes = {
    home: items.filter(item => String(item?.outcome || "").toLowerCase() === "home").length,
    away: items.filter(item => String(item?.outcome || "").toLowerCase() === "away").length,
    other: items.filter(item => !["home", "away"].includes(String(item?.outcome || "").toLowerCase())).length
  };
  const freshTimestamps = timestamps.filter(value => value <= now + 5 * 60 * 1000 && now - value <= ODDS_FRESHNESS_MAX_AGE_MS).length;
  return {
    schemaVersion: 1,
    itemCount: items.length,
    objectItems: items.filter(item => item && typeof item === "object" && !Array.isArray(item)).length,
    bookmakers,
    outcomeCounts: outcomes,
    validDecimalOdds: validOdds,
    parseableScrapedAt: timestamps.length,
    freshScrapedAt: freshTimestamps,
    oldestScrapedAt: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
    newestScrapedAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    fieldCoverage: present
  };
}

function inspectHistoricalScore(score) {
  if (typeof score !== "string" || !score.trim()) return { parseable: false, incomplete: false };
  const sets = [...score.matchAll(/(?:^|\s)(\d{1,2})\s*[-:]\s*(\d{1,2})(?:\(\d{1,2}\))?(?=\s|$)/g)]
    .map(match => [Number(match[1]), Number(match[2])]);
  if (!sets.length) return { parseable: false, incomplete: false };
  const completed = sets.map(([a, b]) =>
    (Math.max(a, b) >= 6 && Math.abs(a - b) >= 2) ||
    (Math.max(a, b) === 7 && Math.min(a, b) === 6) ||
    (Math.max(a, b) >= 10 && Math.abs(a - b) >= 2)
  );
  const lastSetIncomplete = !completed[completed.length - 1];
  const setsWon = [0, 1].map(player =>
    sets.filter(([a, b], index) => completed[index] && (player === 0 ? a > b : b > a)).length
  );
  return {
    parseable: true,
    incomplete: lastSetIncomplete && Math.max(...setsWon) < 2,
    setsParsed: sets.length
  };
}

function diagnoseHistoricalItems(items) {
  const countBy = (field) => Object.fromEntries([...new Set(items.map(x => String(x?.[field] ?? "missing")))].sort().map(v => [v, items.filter(x => String(x?.[field] ?? "missing") === v).length]));
  const validOdds = (v) => Number.isFinite(Number(v)) && Number(v) > 1 && Number(v) <= 1000;
  const keys = items.map(x => [x?.date, x?.tour, x?.tournament, x?.player1, x?.player2].join("|"));
  const duplicates = keys.length - new Set(keys).size;
  let openingPairsChecked = 0;
  let suspiciousOpeningPairs = 0;
  let reliableOpeningPairs = 0;
  let player1Shortened = 0, player1Lengthened = 0;
  let player2Shortened = 0, player2Lengthened = 0;
  for (const match of items) {
    for (const quote of Array.isArray(match?.bookmakerOdds) ? match.bookmakerOdds : []) {
      const a = quote?.player1?.opening;
      const b = quote?.player2?.opening;
      if (!validOdds(a) || !validOdds(b)) continue;
      openingPairsChecked++;
      const margin = 1 / Number(a) + 1 / Number(b) - 1;
      if (margin < -0.05 || margin > 0.25) suspiciousOpeningPairs++;
      else reliableOpeningPairs++;
    }
    if (validOdds(match?.openingOddsPlayer1Avg) && validOdds(match?.currentOddsPlayer1Avg)) {
      if (Number(match.currentOddsPlayer1Avg) < Number(match.openingOddsPlayer1Avg) * 0.98) player1Shortened++;
      if (Number(match.currentOddsPlayer1Avg) > Number(match.openingOddsPlayer1Avg) * 1.02) player1Lengthened++;
    }
    if (validOdds(match?.openingOddsPlayer2Avg) && validOdds(match?.currentOddsPlayer2Avg)) {
      if (Number(match.currentOddsPlayer2Avg) < Number(match.openingOddsPlayer2Avg) * 0.98) player2Shortened++;
      if (Number(match.currentOddsPlayer2Avg) > Number(match.openingOddsPlayer2Avg) * 1.02) player2Lengthened++;
    }
  }
  const scoreAnomalies = items
    .filter(x => x?.finished === true && x?.retired !== true && x?.walkover !== true)
    .map(x => ({ match: x, scoreCheck: inspectHistoricalScore(x?.score) }))
    .filter(x => x.scoreCheck.incomplete);
  return {
    tourCounts: countBy("tour"),
    statusCounts: countBy("status"),
    finished: items.filter(x => x?.finished === true).length,
    unfinishedOrUnknown: items.filter(x => x?.finished !== true).length,
    retired: items.filter(x => x?.retired === true).length,
    walkovers: items.filter(x => x?.walkover === true).length,
    bothOddsValid: items.filter(x => validOdds(x?.oddsPlayer1) && validOdds(x?.oddsPlayer2)).length,
    missingOrInvalidOdds: items.filter(x => !validOdds(x?.oddsPlayer1) || !validOdds(x?.oddsPlayer2)).length,
    openingOddsPairsChecked: openingPairsChecked,
    reliableOpeningOddsPairs: reliableOpeningPairs,
    suspiciousOpeningOddsPairs: suspiciousOpeningPairs,
    movementBeyond2Percent: {
      player1Shortened, player1Lengthened, player2Shortened, player2Lengthened
    },
    surfaceCounts: countBy("surface"),
    missingPlayer1Rank: items.filter(x => x?.player1Rank == null).length,
    missingPlayer2Rank: items.filter(x => x?.player2Rank == null).length,
    missingWinner: items.filter(x => !x?.winner).length,
    missingScore: items.filter(x => !x?.score).length,
    possibleIncompleteScore: scoreAnomalies.length,
    possibleIncompleteScoreExamples: scoreAnomalies.slice(0, 10).map(({ match, scoreCheck }) => ({
      player1: match?.player1 ?? null,
      player2: match?.player2 ?? null,
      score: match?.score ?? null,
      date: match?.date ?? null,
      setsParsed: scoreCheck.setsParsed
    })),
    duplicateMatches: duplicates
  };
}

function internalCacheRequest(request, pathname) {
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = pathname;
  cacheUrl.search = "";
  cacheUrl.hash = "";
  return new Request(cacheUrl.toString(), { method: "GET" });
}

function response(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function eloProbability(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function findElo(profile) {
  if (!profile || typeof profile !== "object") return null;
  const seen = new Set();
  const nodes = [];
  function collect(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 8 || seen.has(obj)) return;
    seen.add(obj);
    nodes.push(obj);
    for (const value of Object.values(obj)) if (value && typeof value === "object") collect(value, depth + 1);
  }
  collect(profile);
  function valid(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
    const rating = Number(value);
    return Number.isFinite(rating) && rating > 0 && rating <= 5000 ? rating : null;
  }
  // Prefer an overall rating anywhere in the profile before surface-specific data.
  const overallKeys = ["overall_elo", "overallElo", "overall_elo_rating"];
  for (const obj of nodes) for (const key of overallKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const rating = valid(obj[key]);
      if (rating !== null) return rating;
    }
  }
  // Fall back only to unqualified Elo fields.
  const genericKeys = ["elo", "elo_rating", "eloRating", "rating_elo"];
  for (const obj of nodes) for (const key of genericKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const rating = valid(obj[key]);
      if (rating !== null) return rating;
    }
  }
  return null;
}


function extractRatingAsOf(profile) {
  if (!profile || typeof profile !== "object") return null;
  const candidates = [
    profile?.stats?.ratings_as_of, profile?.stats?.ratingsAsOf,
    profile?.ratings_as_of, profile?.ratingsAsOf,
    profile?.stats?.elo_updated_at, profile?.stats?.eloUpdatedAt,
    profile?.elo_updated_at, profile?.eloUpdatedAt
  ];
  for (const value of candidates) {
    if (typeof value === "string") {
      const clean = value.trim();
      if (!clean) continue;
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(clean);
      const isoLike = /^\d{4}-\d{2}-\d{2}T/.test(clean);
      if (!dateOnly && !isoLike) continue;
      const parsed = Date.parse(clean);
      if (Number.isFinite(parsed)) {
        const normalized = new Date(parsed).toISOString();
        if (normalized.slice(0, 10) !== clean.slice(0, 10)) continue;
        return normalized.slice(0, 10);
      }
    } else if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      const millis = value < 1e12 ? value * 1000 : value;
      if (millis <= 8640000000000000) return new Date(millis).toISOString().slice(0, 10);
    }
  }
  return null;
}

function extractOfficialPlayerProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return { ranking: null, tour: null, country: null, completeness: null };
  }
  const rankingValue = profile.ranking;
  const ranking = Number.isSafeInteger(rankingValue) && rankingValue > 0 && rankingValue <= 10000
    ? rankingValue : null;
  const tourValue = typeof profile.tour === "string" ? profile.tour.toLowerCase() : "";
  const tour = ["atp", "wta"].includes(tourValue) ? tourValue : null;
  const country = typeof profile.country === "string" && profile.country.trim()
    ? profile.country.trim().slice(0, 80) : null;
  const known = profile.data_completeness?.known;
  const of = profile.data_completeness?.of;
  const completeness = Number.isSafeInteger(known) && Number.isSafeInteger(of) && of > 0 && known >= 0 && known <= of
    ? { known, of, percent: Number((known / of * 100).toFixed(1)) } : null;
  return { ranking, tour, country, completeness };
}

function assessRatingFreshness(asOf, now = Date.now()) {
  if (!asOf) return { status: "unknown", ageDays: null };
  const timestamp = Date.parse(asOf);
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000) {
    return { status: "invalid", ageDays: null };
  }
  const ageDays = Math.max(0, Math.floor((now - timestamp) / 86400000));
  return {
    status: ageDays <= 14 ? "fresh" : ageDays <= 30 ? "recent" : "stale",
    ageDays
  };
}

function assessRatingPlausibility(rating) {
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0 || rating > 5000) {
    return { status: "invalid", reason: "Рейтинг вне допустимого технического диапазона" };
  }
  // Broad review band, not a hard rejection: rating systems and tours can differ.
  if (rating < 800 || rating > 3200) {
    return { status: "review", reason: "Необычное значение Elo; требуется проверка источника" };
  }
  return { status: "plausible", reason: null };
}

function normalizeSurface(value) {
  const surface = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (surface.includes("clay") || surface.includes("terre battue") || surface.includes("грунт")) return "clay";
  if (surface.includes("grass") || surface.includes("gazon") || surface.includes("трава")) return "grass";
  if (surface.includes("carpet") || surface.includes("moquette") || surface.includes("ковер")) return "carpet";
  if (surface.includes("hard") || surface.includes("dur") || surface.includes("бетон") || surface.includes("хард")) return "hard";
  return null;
}

function collectEloDiagnostics(profile) {
  const found = [];
  const seen = new Set();
  function walk(value, path = "$", depth = 0) {
    if (!value || typeof value !== "object" || depth > 8 || seen.has(value) || found.length >= 40) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const childPath = path + "." + key;
      if (/elo|rating/i.test(key) && (typeof child === "number" || typeof child === "string" || child === null)) {
        found.push({ path: childPath, value: child });
      }
      if (child && typeof child === "object") walk(child, childPath, depth + 1);
    }
  }
  walk(profile);
  return found;
}

function findEloForSurface(profile, requestedSurface) {
  const surface = normalizeSurface(requestedSurface);
  if (surface) {
    const seen = new Set();
    const nodes = [];
    function collect(obj, depth = 0) {
      if (!obj || typeof obj !== "object" || depth > 8 || seen.has(obj)) return;
      seen.add(obj); nodes.push(obj);
      for (const value of Object.values(obj)) if (value && typeof value === "object") collect(value, depth + 1);
    }
    collect(profile);
    const aliases = {
      clay: ["clay", "clay_elo", "clayElo", "elo_clay", "eloClay", "clay_elo_rating"],
      hard: ["hard", "hard_elo", "hardElo", "elo_hard", "eloHard", "hard_elo_rating"],
      grass: ["grass", "grass_elo", "grassElo", "elo_grass", "eloGrass", "grass_elo_rating"],
      carpet: ["carpet", "carpet_elo", "carpetElo", "elo_carpet", "eloCarpet", "carpet_elo_rating"]
    };
    const containers = ["surface_elo", "surfaceElo", "elo_by_surface", "eloBySurface", "surface_ratings", "surfaceRatings"];
    function valid(value) {
      if (typeof value !== "number" && typeof value !== "string") return null;
      if (typeof value === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
      const rating = Number(value);
      return Number.isFinite(rating) && rating > 0 && rating <= 5000 ? rating : null;
    }
    for (const obj of nodes) {
      for (const key of aliases[surface]) {
        const rating = valid(obj[key]);
        if (rating !== null) return { rating, type: "surface", surface };
      }
      for (const key of containers) {
        const group = obj[key];
        if (!group || typeof group !== "object" || Array.isArray(group)) continue;
        for (const alias of [surface, surface + "_elo", surface + "Elo"]) {
          const rating = valid(group[alias]);
          if (rating !== null) return { rating, type: "surface", surface };
        }
      }
    }
  }
  const overall = findElo(profile);
  return overall === null ? null : { rating: overall, type: "overall", surface };
}

function cacheKeyUrl(env, pathname) {
  const namespace = String(env?.CACHE_NAMESPACE || "tennis-value-api");
  const host = /^[a-z0-9-]{1,63}$/.test(namespace) ? namespace : "tennis-value-api";
  return "https://" + host + ".fonds-enfiedjian.workers.dev" + pathname;
}

async function fetchLiveTennis(url, options = {}, env = {}) {
  const cache = caches.default;
  const guardKey = new Request(cacheKeyUrl(env, "/__live-tennis-quota-guard/v2"), { method: "GET" });
  const guard = await cache.match(guardKey);
  if (guard) {
    const payload = await guard.json();
    return response(payload, 429, {
      "Retry-After": String(payload.retryAfterSeconds || 60),
      "X-Live-Tennis-Quota-Guard": "HIT"
    });
  }

  const upstream = await fetch(url, options);
  if (upstream.status === 429) {
    let body = {};
    try { body = await upstream.clone().json(); } catch {}
    const scope = String(body?.scope || body?.rate_limit?.scope || "unknown").toLowerCase();
    const resetsAt = body?.resets_at || body?.rate_limit?.resets_at || null;
    const retryAfterHeader = upstream.headers.get("Retry-After");
    const retryAfterDate = Date.parse(retryAfterHeader || "");
    let retrySeconds = /^\d+$/.test(String(retryAfterHeader || ""))
      ? Number(retryAfterHeader)
      : Number.isFinite(retryAfterDate) && retryAfterDate > Date.now()
        ? Math.ceil((retryAfterDate - Date.now()) / 1000)
        : 0;
    const resetTime = resetsAt ? Date.parse(resetsAt) : NaN;
    if (Number.isFinite(resetTime) && resetTime > Date.now()) {
      retrySeconds = Math.ceil((resetTime - Date.now()) / 1000);
    } else if (!retrySeconds) {
      retrySeconds = scope === "day" ? 6 * 60 * 60 : 60;
    }
    retrySeconds = Math.max(5, Math.min(24 * 60 * 60, retrySeconds));
    const payload = {
      error: "Live Tennis API quota is temporarily blocked; cached predictions and match data remain available where possible",
      accessStatus: "rate_limited",
      rateLimitScope: scope,
      resetsAt,
      retryAfterSeconds: retrySeconds
    };
    await cache.put(guardKey, new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=" + retrySeconds
      }
    }));
  }
  return upstream;
}

const playerProfileInflight = new Map();

async function getPlayerProfile(playerId, apiKey, env = {}) {
  // Share concurrent cache misses inside this Worker isolate to avoid duplicate quota use.
  const key = String(playerId);
  const pending = playerProfileInflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    // Elo profiles are effectively static for this model; cache them for seven days.
    const cache = caches.default;
    const cacheKey = new Request(cacheKeyUrl(env, "/__player-profile/" + encodeURIComponent(key)));
    const cached = await cache.match(cacheKey);
    if (cached) return cached.json();

    const res = await fetchLiveTennis("https://api.livetennisapi.com/api/public/v1/players/" + encodeURIComponent(key), {
      headers: { "X-API-Key": apiKey, "Accept": "application/json" }
    }, env);
    if (!res.ok) throw new Error("Player profile request failed (" + res.status + ")");
    const profile = await res.json();
    const cacheResponse = new Response(JSON.stringify(profile), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=604800" }
    });
    await cache.put(cacheKey, cacheResponse);
    return profile;
  })();

  playerProfileInflight.set(key, task);
  try {
    return await task;
  } finally {
    if (playerProfileInflight.get(key) === task) playerProfileInflight.delete(key);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (path === "/health") {
      return response({
        status: "ok",
        service: "tennis-value-api",
        buildId: WORKER_BUILD_ID,
        liveTennisApiConfigured: Boolean(env.LIVE_TENNIS_API_KEY),
        apifyTokenConfigured: Boolean(env.APIFY_TOKEN),
        apifyTaskConfigured: Boolean(APIFY_TASK_ID),
        oddsApiConfigured: Boolean(env.ODDS_API_KEY),
        endpoints: ["/health", "/usage", "/matches?status=upcoming", "/matches?status=live", "/matches?status=completed", "/history/packages?kind=tape", "/history/packages?kind=archive", "/history/packages/2026-11", "/result?id=123", "/player-stats?id=123", "/odds", "/odds-api/sports", "/odds-api/test?sport=tennis_atp_finals", "/odds-api/quotes?sport=tennis_atp_finals", "/historical", "/players/search?search=name", "/player-history?id=123", "/player-h2h?p1=name1&p2=name2", "/markets?match_id=123", "/markets/123/prices", "/matches/123/prices", "/predict"]
      });
    }

    if (path === "/historical") {
      if (request.method !== "GET") {
        return response({ error: "Method not allowed" }, 405);
      }
      if (!env.APIFY_TOKEN) {
        return response({ error: "APIFY_TOKEN secret is not configured" }, 500);
      }

      try {
        // This is a separate, fixed historical dataset; it does not affect the live Winamax /odds feed.
        const datasetId = url.searchParams.get("datasetId") || "1UFINeSkMhdbaTfPa";
        if (!/^[a-zA-Z0-9]{10,30}$/.test(datasetId)) {
          return response({ error: "Invalid Apify datasetId" }, 400);
        }
        const cache = caches.default;
        const cacheKey = new Request(cacheKeyUrl(env, "/__historical/v6/" + encodeURIComponent(datasetId)));
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }

        const upstream = await fetch(
          "https://api.apify.com/v2/datasets/" + datasetId + "/items?clean=true&format=json&limit=1000",
          {
            headers: {
              "Authorization": "Bearer " + env.APIFY_TOKEN,
              "Accept": "application/json"
            }
          }
        );

        if (!upstream.ok) {
          const retryAfter = upstream.headers.get("Retry-After");
          return response({
            error: "Apify historical dataset request failed",
            datasetId,
            upstreamStatus: upstream.status
          }, upstream.status, retryAfter ? { "Retry-After": retryAfter } : {});
        }

        let items;
        try {
          items = await upstream.json();
        } catch {
          return response({ error: "Apify historical dataset response was not valid JSON", datasetId }, 502);
        }
        if (!Array.isArray(items)) {
          return response({ error: "Apify historical dataset response was not an array", datasetId }, 502);
        }

        const payload = {
          source: "Apify tennis-results historical dataset",
          buildId: WORKER_BUILD_ID,
          datasetId,
          datasetName: datasetId === "1UFINeSkMhdbaTfPa" ? "tennis-results-history-2026-11-19" : null,
          retrievedAt: new Date().toISOString(),
          count: items.length,
          diagnostics: diagnoseHistoricalItems(items),
          items
        };
        const cacheResponse = new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            ...cors,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "X-Data-Cache": "MISS",
            "X-Worker-Build": WORKER_BUILD_ID
          }
        });
        await cache.put(cacheKey, cacheResponse);
        return response(payload, 200, {
          "Cache-Control": "public, max-age=3600",
          "X-Data-Cache": "MISS",
          "X-Worker-Build": WORKER_BUILD_ID
        });
      } catch {
        return response({ error: "Could not retrieve historical tennis data from Apify" }, 502);
      }
    }

    if (path === "/odds") {
      if (request.method !== "GET") {
        return response({ error: "Method not allowed" }, 405);
      }

      if (!env.APIFY_TOKEN) {
        return response({ error: "APIFY_TOKEN secret is not configured" }, 500);
      }

      try {
        // Cache Winamax odds for five minutes to avoid repeated Apify dataset reads.
        const cache = caches.default;
        const cacheKey = new Request(request.url, { method: "GET" });
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }

        // Resolve the most recent successful task run dataset dynamically.
        // This avoids pinning the feed to a dataset created by an earlier run.
        const upstream = await fetch(
          `https://api.apify.com/v2/actor-tasks/${APIFY_TASK_ID}/runs/last/dataset/items?status=SUCCEEDED&clean=true&format=json&limit=1000`,
          {
            headers: {
              "Authorization": `Bearer ${env.APIFY_TOKEN}`,
              "Accept": "application/json"
            }
          }
        );

        if (!upstream.ok) {
          const retryAfter = upstream.headers.get("Retry-After");
          return response({
            error: "Apify task dataset request failed",
            taskId: APIFY_TASK_ID,
            upstreamStatus: upstream.status
          }, upstream.status, retryAfter ? { "Retry-After": retryAfter } : {});
        }

        let items;
        try {
          items = await upstream.json();
        } catch {
          return response({ error: "Apify task dataset response was not valid JSON", taskId: APIFY_TASK_ID }, 502);
        }
        if (!Array.isArray(items)) {
          return response({ error: "Apify task dataset response was not an array", taskId: APIFY_TASK_ID }, 502);
        }
        // Best-effort metadata lookup: identify whether the latest successful
        // task run was started manually, by API, or by an Apify schedule.
        // A metadata failure must never take down an otherwise healthy odds feed.
        let taskRun = null;
        let taskRunDiagnostic = "not_checked";
        try {
          const runResponse = await fetch(
            `https://api.apify.com/v2/actor-tasks/${APIFY_TASK_ID}/runs/last?status=SUCCEEDED`,
            {
              headers: {
                "Authorization": `Bearer ${env.APIFY_TOKEN}`,
                "Accept": "application/json"
              }
            }
          );
          if (!runResponse.ok) {
            taskRunDiagnostic = "http_" + runResponse.status;
          } else {
            let runPayload;
            try {
              runPayload = await runResponse.json();
            } catch {
              taskRunDiagnostic = "invalid_json";
            }
            if (runPayload !== undefined) {
              const run = runPayload?.data || runPayload;
              if (run && typeof run === "object" && !Array.isArray(run)) {
                const origin = typeof run.meta?.origin === "string" ? run.meta.origin : null;
                taskRun = {
                  status: typeof run.status === "string" ? run.status : "SUCCEEDED",
                  startedAt: run.startedAt || null,
                  finishedAt: run.finishedAt || null,
                  origin,
                  scheduled: Boolean(run.meta?.scheduleId || run.meta?.scheduledActorTaskId || origin === "SCHEDULER")
                };
                taskRunDiagnostic = "ok";
              } else if (taskRunDiagnostic !== "invalid_json") {
                taskRunDiagnostic = "invalid_payload";
              }
            }
          }
        } catch {
          taskRunDiagnostic = "request_failed";
          // Keep feed availability independent from optional run metadata.
        }
        const payload = {
          source: "Apify Winamax task",
          taskId: APIFY_TASK_ID,
          retrievedAt: new Date().toISOString(),
          count: items.length,
          taskRun,
          taskRunDiagnostic,
          diagnostics: diagnoseOddsItems(items),
          items
        };
        const cacheResponse = new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            ...cors,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "X-Data-Cache": "MISS"
          }
        });
        await cache.put(cacheKey, cacheResponse);
        return response(payload, 200, {
          "Cache-Control": "public, max-age=300",
          "X-Data-Cache": "MISS"
        });
      } catch (error) {
        return response({ error: "Could not retrieve odds from Apify" }, 502);
      }
    }

    if (path === "/odds-api/sports") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.ODDS_API_KEY) return response({ error: "ODDS_API_KEY secret is not configured" }, 500);

      try {
        // The Odds API documents /v4/sports as quota-exempt. Use the key header
        // so the credential never appears in a URL, logs, or returned payload.
        const cache = caches.default;
        const forceRefresh = url.searchParams.get("fresh") === "true";
        const cacheKey = new Request(cacheKeyUrl(env, "/__odds-api-sports/v3-diagnostics"), { method: "GET" });
        const cached = forceRefresh ? null : await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }

        const upstream = await fetch("https://api.the-odds-api.com/v4/sports?all=true", {
          headers: { "x-api-key": env.ODDS_API_KEY, "Accept": "application/json" }
        });
        let body;
        try { body = await upstream.json(); } catch {
          return response({ error: "The Odds API returned invalid JSON", upstreamStatus: upstream.status }, 502);
        }
        if (!upstream.ok) {
          return response({
            error: "The Odds API sports discovery request failed",
            upstreamStatus: upstream.status,
            providerMessage: typeof body?.message === "string" ? body.message : null
          }, upstream.status);
        }
        if (!Array.isArray(body)) {
          return response({ error: "The Odds API returned an unexpected sports payload" }, 502);
        }

        const tennisSports = body.filter(sport =>
          String(sport?.key || "").startsWith("tennis_")
        );
        const tennisRelatedSports = body.filter(sport =>
          /tennis|atp|wta/i.test(String(sport?.key || "") + " " + String(sport?.title || ""))
        );
        const payload = {
          source: "The Odds API",
          retrievedAt: new Date().toISOString(),
          quotaCost: 0,
          totalSports: body.length,
          tennisSportsCount: tennisSports.length,
          tennisSports,
          tennisRelatedSports,
          sportsSample: body.slice(0, 20).map(sport => ({
            key: sport?.key ?? null,
            title: sport?.title ?? null,
            active: sport?.active ?? null,
            hasOutrights: sport?.has_outrights ?? null
          }))
        };
        const headers = {
          "Cache-Control": "public, max-age=900",
          "X-Data-Cache": "MISS"
        };
        for (const name of ["x-requests-remaining", "x-requests-used", "x-requests-last"]) {
          const value = upstream.headers.get(name);
          if (value !== null) headers[name] = value;
        }
        const cacheResponse = new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...headers }
        });
        await cache.put(cacheKey, cacheResponse);
        return response(payload, 200, headers);
      } catch {
        return response({ error: "Could not reach The Odds API" }, 502);
      }
    }

    if (path === "/odds-api/test") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.ODDS_API_KEY) return response({ error: "ODDS_API_KEY secret is not configured" }, 500);

      // Diagnostic only: compare the three French bookmakers on the same tennis event feed.
      const sportKey = (url.searchParams.get("sport") || "tennis_atp_finals").trim();
      if (!/^tennis_[a-z0-9_]{2,80}$/.test(sportKey)) {
        return response({ error: "sport must be a valid tennis sport key from /odds-api/sports" }, 400);
      }

      try {
        const cache = caches.default;
        const forceRefresh = url.searchParams.get("fresh") === "true";
        const cacheKey = new Request(
          cacheKeyUrl(env, "/__odds-api-test/v2-fr-bookmakers/" + encodeURIComponent(sportKey)),
          { method: "GET" }
        );
        const cached = forceRefresh ? null : await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }

        const requestedBookmakers = ["betclic_fr", "netbet_fr", "winamax_fr"];
        const upstream = await fetch(
          "https://api.the-odds-api.com/v4/sports/" + encodeURIComponent(sportKey) +
          "/odds/?" + new URLSearchParams({
            bookmakers: requestedBookmakers.join(","),
            markets: "h2h",
            oddsFormat: "decimal",
            dateFormat: "iso"
          }).toString(),
          { headers: { "x-api-key": env.ODDS_API_KEY, "Accept": "application/json" } }
        );
        let events;
        try { events = await upstream.json(); } catch {
          return response({ error: "The Odds API returned invalid JSON", upstreamStatus: upstream.status }, 502);
        }
        if (!upstream.ok) {
          return response({
            error: "The Odds API odds request failed",
            sportKey,
            upstreamStatus: upstream.status,
            providerMessage: typeof events?.message === "string" ? events.message : null
          }, upstream.status);
        }
        if (!Array.isArray(events)) {
          return response({ error: "The Odds API returned an unexpected odds payload", sportKey }, 502);
        }

        const bookmakerStats = Object.fromEntries(requestedBookmakers.map(key => [
          key,
          { key, events: 0, completeH2hMarkets: 0, outcomeQuotes: 0 }
        ]));
        const eventSummaries = events.map(event => {
          const present = [];
          for (const bookmaker of Array.isArray(event?.bookmakers) ? event.bookmakers : []) {
            const target = bookmakerStats[bookmaker?.key];
            if (!target) continue;
            present.push(bookmaker.key);
            target.events++;
            for (const market of Array.isArray(bookmaker.markets) ? bookmaker.markets : []) {
              if (market?.key !== "h2h") continue;
              const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
              target.outcomeQuotes += outcomes.length;
              const names = new Set(outcomes.map(outcome => String(outcome?.name || "").trim().toLowerCase()));
              if (names.has(String(event.home_team || "").trim().toLowerCase()) &&
                  names.has(String(event.away_team || "").trim().toLowerCase())) {
                target.completeH2hMarkets++;
              }
            }
          }
          return {
            eventId: event?.id || null,
            homeTeam: event?.home_team || null,
            awayTeam: event?.away_team || null,
            commenceTime: event?.commence_time || null,
            bookmakers: present
          };
        });
        const payload = {
          source: "The Odds API",
          sportKey,
          requestedBookmakers,
          market: "h2h",
          oddsFormat: "decimal",
          retrievedAt: new Date().toISOString(),
          eventCount: events.length,
          bookmakerStats,
          events: eventSummaries,
          quota: {
            requestsRemaining: upstream.headers.get("x-requests-remaining"),
            requestsUsed: upstream.headers.get("x-requests-used"),
            lastRequestCost: upstream.headers.get("x-requests-last")
          }
        };
        const headers = { "Cache-Control": "public, max-age=180", "X-Data-Cache": "MISS" };
        const cacheResponse = new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...headers }
        });
        await cache.put(cacheKey, cacheResponse);
        return response(payload, 200, headers);
      } catch {
        return response({ error: "Could not reach The Odds API" }, 502);
      }
    }

    if (path === "/odds-api/quotes") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.ODDS_API_KEY) return response({ error: "ODDS_API_KEY secret is not configured" }, 500);
      const sportKey = (url.searchParams.get("sport") || "tennis_atp_finals").trim();
      if (!/^tennis_[a-z0-9_]{2,80}$/.test(sportKey)) {
        return response({ error: "sport must be a valid tennis sport key from /odds-api/sports" }, 400);
      }
      try {
        const cache = caches.default;
        const cacheKey = new Request(cacheKeyUrl(env, "/__odds-api-quotes/v1/" + encodeURIComponent(sportKey)));
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }
        const params = new URLSearchParams({
          bookmakers: "betclic_fr,netbet_fr",
          markets: "h2h",
          oddsFormat: "decimal",
          dateFormat: "iso"
        });
        const upstream = await fetch(
          "https://api.the-odds-api.com/v4/sports/" + encodeURIComponent(sportKey) + "/odds/?" + params.toString(),
          { headers: { "x-api-key": env.ODDS_API_KEY, "Accept": "application/json" } }
        );
        let events;
        try { events = await upstream.json(); } catch {
          return response({ error: "The Odds API returned invalid JSON", upstreamStatus: upstream.status }, 502);
        }
        if (!upstream.ok) {
          return response({
            error: "The Odds API odds request failed",
            sportKey,
            upstreamStatus: upstream.status,
            providerMessage: typeof events?.message === "string" ? events.message : null
          }, upstream.status);
        }
        if (!Array.isArray(events)) return response({ error: "The Odds API returned an unexpected odds payload", sportKey }, 502);
        const retrievedAt = new Date().toISOString();
        const normalizeName = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
        const bookmakerNames = { betclic_fr: "betclic", netbet_fr: "netbet" };
        const items = [];
        for (const event of events) {
          const homeTeam = String(event?.home_team || "").trim();
          const awayTeam = String(event?.away_team || "").trim();
          const startTime = Date.parse(event?.commence_time || "");
          if (!homeTeam || !awayTeam || !Number.isFinite(startTime)) continue;
          for (const bookmaker of Array.isArray(event.bookmakers) ? event.bookmakers : []) {
            const bookmakerKey = String(bookmaker?.key || "");
            const provider = bookmakerNames[bookmakerKey];
            if (!provider) continue;
            for (const market of Array.isArray(bookmaker.markets) ? bookmaker.markets : []) {
              if (market?.key !== "h2h" || !Array.isArray(market.outcomes)) continue;
              const outcomes = market.outcomes.map(outcome => {
                const name = String(outcome?.name || "").trim();
                const price = Number(outcome?.price);
                const normalized = normalizeName(name);
                const side = normalized === normalizeName(homeTeam) ? "home" :
                  normalized === normalizeName(awayTeam) ? "away" : null;
                return side && Number.isFinite(price) && price > 1 && price <= 1000
                  ? { side, name, price } : null;
              }).filter(Boolean);
              const sides = new Set(outcomes.map(outcome => outcome.side));
              if (!sides.has("home") || !sides.has("away")) continue;
              for (const outcome of outcomes) items.push({
                bookmaker: provider,
                bookmakerCountry: "FR",
                sport: "tennis",
                marketType: "match_winner",
                line: null,
                eventId: String(event.id || ""),
                eventName: homeTeam + " - " + awayTeam,
                homeTeam,
                awayTeam,
                startTime: new Date(startTime).toISOString(),
                outcome: outcome.side,
                outcomeName: outcome.name,
                oddsDecimal: outcome.price,
                competition: String(event?.sport_title || ""),
                isLive: startTime <= Date.now(),
                scrapedAt: String(market.last_update || bookmaker.last_update || retrievedAt),
                source: "the-odds-api",
                sourceBookmakerKey: bookmakerKey
              });
            }
          }
        }
        const payload = {
          source: "The Odds API",
          sportKey,
          requestedBookmakers: ["betclic_fr", "netbet_fr"],
          retrievedAt,
          eventCount: events.length,
          quoteCount: items.length,
          items,
          quota: {
            requestsRemaining: upstream.headers.get("x-requests-remaining"),
            requestsUsed: upstream.headers.get("x-requests-used"),
            lastRequestCost: upstream.headers.get("x-requests-last")
          }
        };
        const headers = { "Cache-Control": "public, max-age=180", "X-Data-Cache": "MISS" };
        await cache.put(cacheKey, new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...headers }
        }));
        return response(payload, 200, headers);
      } catch {
        return response({ error: "Could not reach The Odds API" }, 502);
      }
    }

    // Live Tennis PRO bulk history packages: monthly point tapes and yearly archive results.
    // Package files are streamed unchanged; API keys remain server-side.
    const historyPackageMatch = path.match(/^\/history\/packages(?:\/(\d{4}(?:-\d{2})?))?$/);
    if (historyPackageMatch) {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.LIVE_TENNIS_API_KEY) {
        return response({ error: "LIVE_TENNIS_API_KEY secret is not configured", accessStatus: "api_key_missing" }, 500);
      }
      const period = historyPackageMatch[1] || null;
      const params = new URLSearchParams();
      const kind = (url.searchParams.get("kind") || "tape").trim().toLowerCase();
      const allowedKinds = ["tape", "rankings", "rally", "archive", "elo", "archive_tape"];
      if (!allowedKinds.includes(kind)) return response({ error: "Invalid history package kind", allowed: allowedKinds }, 400);
      if (period && ["rankings", "rally", "archive", "elo", "archive_tape"].includes(kind)) {
        if (!/^\d{4}$/.test(period)) return response({ error: "Yearly package period must be YYYY" }, 400);
      } else if (period && !/^\d{4}-\d{2}$/.test(period)) {
        return response({ error: "Monthly tape package period must be YYYY-MM" }, 400);
      }
      params.set("kind", kind);
      const year = url.searchParams.get("year");
      if (year !== null) {
        if (!/^\d{4}$/.test(year)) return response({ error: "year must be YYYY" }, 400);
        if (period) return response({ error: "year cannot be combined with a package period" }, 400);
        params.set("year", year);
      }
      const format = url.searchParams.get("format");
      if (format !== null) {
        if (!period) return response({ error: "format requires a package period" }, 400);
        if (!["jsonl", "csv", "corrections"].includes(format)) {
          return response({ error: "format must be jsonl, csv or corrections" }, 400);
        }
        params.set("format", format);
      }
      const upstreamPath = period
        ? "/history/packages/" + encodeURIComponent(period) + "?" + params.toString()
        : "/history/packages?" + params.toString();
      try {
        const cache = caches.default;
        const cacheKey = new Request(cacheKeyUrl(env, "/__history-packages/v1" + upstreamPath));
        const cacheable = format === null;
        const cached = cacheable ? await cache.match(cacheKey) : null;
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }
        const upstream = await fetchLiveTennis(
          "https://api.livetennisapi.com/api/public/v1" + upstreamPath,
          { headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" } }, env
        );
        const headers = new Headers(cors);
        for (const name of ["Content-Type", "Content-Disposition", "Content-Length", "Content-Encoding", "Cache-Control", "Retry-After"]) {
          const value = upstream.headers.get(name);
          if (value) headers.set(name, value);
        }
        if (format !== null && upstream.ok) {
          headers.set("Cache-Control", "private, no-store");
          return new Response(upstream.body, { status: upstream.status, headers });
        }
        let body;
        try { body = await upstream.json(); }
        catch { return response({ error: "Live Tennis history package returned invalid JSON" }, 502); }
        if (upstream.ok && cacheable) {
          headers.set("Content-Type", "application/json; charset=utf-8");
          headers.set("Cache-Control", "public, max-age=21600");
          headers.set("X-Data-Cache", "MISS");
          await cache.put(cacheKey, new Response(JSON.stringify(body), { status: 200, headers }));
        }
        return response(body, upstream.status, Object.fromEntries(headers.entries()));
      } catch {
        return response({ error: "Could not retrieve Live Tennis history packages", accessStatus: "unavailable" }, 502);
      }
    }

    if (path === "/usage") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.LIVE_TENNIS_API_KEY) return response({ error: "LIVE_TENNIS_API_KEY secret is not configured" }, 500);
      try {
        // Live Tennis documents /usage as quota-exempt.
        const upstream = await fetch("https://api.livetennisapi.com/api/public/v1/usage", {
          headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" }
        }, env);
        const body = await upstream.json();
        return response(body, upstream.status);
      } catch (error) {
        return response({ error: "Could not retrieve API usage" }, 502);
      }
    }

    // Live Tennis API PRO match-winner markets and price history.
    // Only match-winner prices are exposed; derivative markets are not supported by the provider.
    if (path === "/markets" || /^\/markets\/\d+\/prices$/.test(path) || /^\/matches\/\d+\/prices$/.test(path)) {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.LIVE_TENNIS_API_KEY) {
        return response({ error: "LIVE_TENNIS_API_KEY secret is not configured", accessStatus: "api_key_missing" }, 500);
      }

      let upstreamPath;
      let cacheTtl = 60;
      if (path === "/markets") {
        const rawMatchId = url.searchParams.get("match_id") || "";
        if (!/^\d{1,15}$/.test(rawMatchId) || !Number.isSafeInteger(Number(rawMatchId)) || Number(rawMatchId) <= 0) {
          return response({ error: "match_id must be a positive integer" }, 400);
        }
        upstreamPath = "/markets?match_id=" + encodeURIComponent(String(Number(rawMatchId)));
      } else {
        const match = path.match(/^\/(markets|matches)\/(\d+)\/prices$/);
        const rawMatchId = match?.[2] || "";
        if (!/^\d{1,15}$/.test(rawMatchId) || !Number.isSafeInteger(Number(rawMatchId)) || Number(rawMatchId) <= 0) {
          return response({ error: "match ID must be a positive integer" }, 400);
        }
        const isMarketRoute = match[1] === "markets";
        const params = new URLSearchParams();
        const rawLimit = url.searchParams.get("limit") || (isMarketRoute ? "50" : "100");
        const maxLimit = isMarketRoute ? 200 : 500;
        if (!/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > maxLimit) {
          return response({ error: "limit must be an integer from 1 to " + maxLimit }, 400);
        }
        params.set("limit", String(Number(rawLimit)));
        if (!isMarketRoute) {
          const minutes = url.searchParams.get("minutes");
          if (minutes !== null) {
            if (!/^\d{1,4}$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 1440) {
              return response({ error: "minutes must be an integer from 1 to 1440" }, 400);
            }
            params.set("minutes", String(Number(minutes)));
          }
          const cursor = url.searchParams.get("cursor");
          if (cursor !== null) {
            if (!cursor.trim() || cursor.length > 500) return response({ error: "cursor must contain 1 to 500 characters" }, 400);
            params.set("cursor", cursor);
          }
        }
        upstreamPath = isMarketRoute
          ? "/markets/" + String(Number(rawMatchId)) + "/prices?" + params.toString()
          : "/matches/" + String(Number(rawMatchId)) + "/prices?" + params.toString();
        cacheTtl = 20;
      }

      try {
        const cache = caches.default;
        const cacheKey = new Request(cacheKeyUrl(env, "/__live-tennis-markets/v1" + path + "?" + url.searchParams.toString()), { method: "GET" });
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }
        const upstream = await fetchLiveTennis("https://api.livetennisapi.com/api/public/v1" + upstreamPath, {
          headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" }
        }, env);
        let body;
        try { body = await upstream.json(); }
        catch { body = { error: "Live Tennis API returned a non-JSON response" }; }
        const retryAfter = upstream.headers.get("Retry-After");
        const headers = {};
        if (retryAfter) headers["Retry-After"] = retryAfter;
        if (upstream.ok) {
          headers["Cache-Control"] = "public, max-age=" + cacheTtl;
          headers["X-Data-Cache"] = "MISS";
          await cache.put(cacheKey, new Response(JSON.stringify(body), {
            status: 200,
            headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=" + cacheTtl }
          }));
        }
        return response(body, upstream.status, headers);
      } catch {
        return response({ error: "Could not retrieve Live Tennis market prices", accessStatus: "upstream_unavailable" }, 502);
      }
    }

    if (path === "/players/search") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.LIVE_TENNIS_API_KEY) {
        return response({ error: "LIVE_TENNIS_API_KEY secret is not configured", accessStatus: "api_key_missing" }, 500);
      }

      const query = (url.searchParams.get("search") || "").trim();
      if (query.length < 2 || query.length > 80) {
        return response({ error: "search must contain between 2 and 80 characters" }, 400);
      }
      const rawLimit = url.searchParams.get("limit") || "10";
      if (!/^\d{1,2}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 20) {
        return response({ error: "limit must be an integer from 1 to 20" }, 400);
      }
      const limit = Number(rawLimit);

      try {
        const cache = caches.default;
        const cacheKey = new Request(
          cacheKeyUrl(env, "/__player-search/v1/" +
          encodeURIComponent(query.toLocaleLowerCase()) + "/" + limit),
          { method: "GET" }
        );
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }

        const params = new URLSearchParams({ search: query, limit: String(limit) });
        const upstream = await fetchLiveTennis(
          "https://api.livetennisapi.com/api/public/v1/players?" + params.toString(),
          { headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" } }, env
        );
        let body;
        try { body = await upstream.json(); } catch {
          return response({ error: "Live Tennis player search returned invalid JSON" }, 502);
        }
        if (!upstream.ok) {
          const retryAfter = upstream.headers.get("Retry-After");
          return response({
            error: "Live Tennis player search failed",
            accessStatus: upstream.status === 429 ? "rate_limited" :
              upstream.status === 401 ? "unauthorized" : "upstream_error",
            upstreamStatus: upstream.status
          }, upstream.status, retryAfter ? { "Retry-After": retryAfter } : {});
        }
        if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.data)) {
          return response({ error: "Live Tennis player search returned an unexpected payload", accessStatus: "invalid_payload" }, 502);
        }

        const players = body.data.filter(player =>
          player && typeof player === "object" && !Array.isArray(player) &&
          Number.isSafeInteger(Number(player.id)) && Number(player.id) > 0 &&
          typeof player.name === "string" && player.name.trim()
        ).slice(0, limit);
        const payload = {
          source: "Live Tennis API /players",
          query,
          retrievedAt: new Date().toISOString(),
          count: players.length,
          players
        };
        const headers = { "Cache-Control": "public, max-age=900", "X-Data-Cache": "MISS" };
        await cache.put(cacheKey, new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...headers }
        }));
        return response(payload, 200, headers);
      } catch {
        return response({ error: "Could not search Live Tennis players", accessStatus: "unavailable" }, 502);
      }
    }

    if (path === "/player-history") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.LIVE_TENNIS_API_KEY) {
        return response({ error: "LIVE_TENNIS_API_KEY secret is not configured", accessStatus: "api_key_missing" }, 500);
      }
      const rawPlayerId = url.searchParams.get("id") || "";
      if (!/^\d{1,15}$/.test(rawPlayerId) || !Number.isSafeInteger(Number(rawPlayerId)) || Number(rawPlayerId) <= 0) {
        return response({ error: "id must be a positive integer player identifier" }, 400);
      }
      const playerId = String(Number(rawPlayerId));
      const rawLimit = url.searchParams.get("limit") || "20";
      if (!/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50) {
        return response({ error: "limit must be an integer from 1 to 50" }, 400);
      }
      const limit = Number(rawLimit);
      const tour = (url.searchParams.get("tour") || "").trim().toLowerCase();
      if (tour && !["atp", "wta", "challenger", "itf", "juniors"].includes(tour)) {
        return response({ error: "tour must be atp, wta, challenger, itf or juniors" }, 400);
      }
      try {
        const cache = caches.default;
        const cacheKey = internalCacheRequest(request,
          "/__player-history/v1/" + playerId + "/" + limit + "/" + (tour || "all"));
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }

        const params = new URLSearchParams({
          player: playerId,
          draw: "singles",
          limit: String(limit),
          offset: "0"
        });
        if (tour) params.set("tour", tour);
        const upstream = await fetchLiveTennis(
          "https://api.livetennisapi.com/api/public/v1/history/matches?" + params.toString(),
          { headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" } }, env
        );
        let body;
        try { body = await upstream.json(); } catch {
          return response({ error: "Live Tennis history returned invalid JSON", accessStatus: "invalid_payload" }, 502);
        }
        if (!upstream.ok) {
          const accessStatus = upstream.status === 403 ? "basic_history_not_entitled"
            : upstream.status === 401 ? "unauthorized"
            : upstream.status === 429 ? "rate_limited"
            : upstream.status === 400 ? "invalid_history_query"
            : "upstream_error";
          const retryAfter = upstream.headers.get("Retry-After");
          return response({
            error: "Live Tennis completed-match history request failed",
            playerId,
            accessStatus,
            upstreamStatus: upstream.status
          }, upstream.status, retryAfter ? { "Retry-After": retryAfter } : {});
        }
        if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.data)) {
          return response({ error: "Live Tennis history returned an unexpected payload", playerId, accessStatus: "invalid_payload" }, 502);
        }
        const payload = {
          playerId,
          source: "Live Tennis API /history/matches",
          period: "2023-present",
          draw: "singles",
          tour: tour || null,
          retrievedAt: new Date().toISOString(),
          count: body.data.length,
          data: body.data,
          meta: body.meta && typeof body.meta === "object" ? body.meta : null,
          accessStatus: "available"
        };
        const headers = { "Cache-Control": "public, max-age=21600", "X-Data-Cache": "MISS" };
        await cache.put(cacheKey, new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...headers }
        }));
        return response(payload, 200, headers);
      } catch {
        return response({ error: "Could not retrieve completed-match history", playerId, accessStatus: "unavailable" }, 502);
      }
    }

    if (path === "/player-h2h") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.LIVE_TENNIS_API_KEY) {
        return response({ error: "LIVE_TENNIS_API_KEY secret is not configured", accessStatus: "api_key_missing" }, 500);
      }
      const player1 = (url.searchParams.get("p1") || "").trim();
      const player2 = (url.searchParams.get("p2") || "").trim();
      if (player1.length < 3 || player1.length > 80 || player2.length < 3 || player2.length > 80) {
        return response({ error: "p1 and p2 must each contain between 3 and 80 characters" }, 400);
      }
      if (player1.toLocaleLowerCase() === player2.toLocaleLowerCase()) {
        return response({ error: "p1 and p2 must identify different players" }, 400);
      }
      try {
        const cache = caches.default;
        const cacheKey = internalCacheRequest(request,
          "/__player-h2h/v1/" + encodeURIComponent(player1.toLocaleLowerCase()) + "/" +
          encodeURIComponent(player2.toLocaleLowerCase()));
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }
        const params = new URLSearchParams({ p1: player1, p2: player2 });
        const upstream = await fetchLiveTennis(
          "https://api.livetennisapi.com/api/public/v1/h2h?" + params.toString(),
          { headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" } }, env
        );
        let body;
        try { body = await upstream.json(); } catch {
          return response({ error: "Live Tennis H2H returned invalid JSON", accessStatus: "invalid_payload" }, 502);
        }
        if (!upstream.ok) {
          const accessStatus = upstream.status === 403 ? "basic_h2h_not_entitled"
            : upstream.status === 401 ? "unauthorized"
            : upstream.status === 429 ? "rate_limited"
            : upstream.status === 400 ? "ambiguous_or_invalid_player_name"
            : "upstream_error";
          const retryAfter = upstream.headers.get("Retry-After");
          return response({
            error: "Live Tennis head-to-head request failed",
            accessStatus,
            upstreamStatus: upstream.status,
            ...(upstream.status === 400 && body && typeof body === "object" ? { detail: body } : {})
          }, upstream.status, retryAfter ? { "Retry-After": retryAfter } : {});
        }
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            !body.totals || typeof body.totals !== "object" || !Array.isArray(body.meetings)) {
          return response({ error: "Live Tennis H2H returned an unexpected payload", accessStatus: "invalid_payload" }, 502);
        }
        const payload = {
          source: "Live Tennis API /h2h",
          period: "1968-present",
          requested: { p1: player1, p2: player2 },
          retrievedAt: new Date().toISOString(),
          accessStatus: "available",
          ...body
        };
        const headers = { "Cache-Control": "public, max-age=86400", "X-Data-Cache": "MISS" };
        await cache.put(cacheKey, new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...headers }
        }));
        return response(payload, 200, headers);
      } catch {
        return response({ error: "Could not retrieve head-to-head history", accessStatus: "unavailable" }, 502);
      }
    }

    if (path === "/player-stats") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.LIVE_TENNIS_API_KEY) {
        return response({ error: "LIVE_TENNIS_API_KEY secret is not configured", accessStatus: "api_key_missing" }, 500);
      }
      const rawPlayerId = url.searchParams.get("id") || "";
      if (!/^\d{1,15}$/.test(rawPlayerId) || !Number.isSafeInteger(Number(rawPlayerId)) || Number(rawPlayerId) <= 0) {
        return response({ error: "id must be a positive integer player identifier" }, 400);
      }
      const playerId = String(Number(rawPlayerId));
      try {
        // Player statistics change more often than profile ratings; cache successful responses for one minute, matching the provider's cache window.
        const cache = caches.default;
        const cacheKey = internalCacheRequest(request, "/__player-stats/" + encodeURIComponent(playerId));
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }
        const upstream = await fetchLiveTennis("https://api.livetennisapi.com/api/public/v1/players/" + encodeURIComponent(playerId) + "/stats", {
          headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" }
        }, env);
        let stats;
        try { stats = await upstream.json(); }
        catch { stats = null; }
        if (!upstream.ok) {
          const accessStatus = upstream.status === 403 ? "forbidden_or_plan_restricted"
            : upstream.status === 401 ? "unauthorized"
            : upstream.status === 404 ? "stats_not_found"
            : upstream.status === 410 ? "player_merged"
            : upstream.status === 429 ? "rate_limited"
            : upstream.status === 400 ? "invalid_player_or_doubles"
            : "upstream_error";
          const retryAfter = upstream.headers.get("Retry-After");
          const rateLimit = upstream.status === 429 && stats && typeof stats === "object" && !Array.isArray(stats)
            ? {
                errorCode: typeof stats.error === "string" ? stats.error : null,
                scope: typeof stats.scope === "string" ? stats.scope : null,
                resetsAt: typeof stats.resets_at === "string" ? stats.resets_at : null,
                retryAtEpoch: Number.isSafeInteger(stats.retry_at_epoch) && stats.retry_at_epoch > 0 ? stats.retry_at_epoch : null,
                detail: typeof stats.detail === "string" ? stats.detail : null
              }
            : null;
          return response({
            error: "Live Tennis player statistics request failed",
            playerId,
            accessStatus,
            upstreamStatus: upstream.status,
            ...(rateLimit ? { rateLimit } : {})
          }, upstream.status, retryAfter ? { "Retry-After": retryAfter } : {});
        }
        if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
          return response({ error: "Live Tennis returned an invalid player statistics payload", playerId, accessStatus: "invalid_payload" }, 502);
        }
        const payload = { playerId, source: "Live Tennis API /players/{id}/stats", accessStatus: "available", stats };
        await cache.put(cacheKey, new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" }
        }));
        return response(payload, 200, {
          "Cache-Control": "public, max-age=60",
          "X-Data-Cache": "MISS"
        });
      } catch {
        return response({ error: "Could not retrieve player statistics", playerId, accessStatus: "unavailable" }, 502);
      }
    }

    if (path === "/result") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.LIVE_TENNIS_API_KEY) return response({ error: "LIVE_TENNIS_API_KEY secret is not configured" }, 500);
      const id = url.searchParams.get("id") || "";
      if (!/^\d{1,15}$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
        return response({ error: "id must be a positive integer" }, 400);
      }
      try {
        const cache = caches.default;
        const cacheKey = internalCacheRequest(request, "/__match-result/" + id);
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }
        const upstream = await fetchLiveTennis("https://api.livetennisapi.com/api/public/v1/matches/" + id, {
          headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" }
        }, env);
        const body = await upstream.json();
        const result = response(body, upstream.status);
        if (upstream.ok) {
          await cache.put(cacheKey, new Response(JSON.stringify(body), {
            status: 200,
            headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" }
          }));
        }
        return result;
      } catch (error) {
        return response({ error: "Could not retrieve match result" }, 502);
      }
    }

    if (path === "/matches") {
      if (request.method !== "GET") {
        return response({ error: "Method not allowed" }, 405);
      }

      if (!env.LIVE_TENNIS_API_KEY) {
        return response({ error: "LIVE_TENNIS_API_KEY secret is not configured" }, 500);
      }

      const status = url.searchParams.get("status") || "upcoming";
      if (!["live", "upcoming", "completed", "cancelled"].includes(status)) {
        return response({ error: "Invalid status. Use live, upcoming, completed, or cancelled." }, 400);
      }

      const freshParam = url.searchParams.get("fresh");
      if (freshParam !== null && !["true", "false"].includes(freshParam.toLowerCase())) {
        return response({ error: "fresh must be true or false" }, 400);
      }
      const forceRefresh = freshParam?.toLowerCase() === "true";
      const params = new URLSearchParams({ status });
      const allowedParams = ["limit", "offset", "tour", "draw", "from", "to", "player", "country", "has_market", "has_analysis"];
      for (const key of allowedParams) {
        const value = url.searchParams.get(key);
        if (value === null) continue;
        const clean = value.trim();
        if (!clean) return response({ error: "Parameter " + key + " must not be empty" }, 400);
        if (key === "limit") {
          const number = Number(clean);
          if (!Number.isInteger(number) || number < 1 || number > 200) {
            return response({ error: "limit must be an integer from 1 to 200" }, 400);
          }
        } else if (key === "offset") {
          const number = Number(clean);
          if (!Number.isInteger(number) || number < 0 || number > 100000) {
            return response({ error: "offset must be an integer from 0 to 100000" }, 400);
          }
        } else if (key === "tour") {
          if (!["atp", "wta", "challenger", "itf", "juniors"].includes(clean.toLowerCase())) {
            return response({ error: "Invalid tour filter" }, 400);
          }
        } else if (key === "draw") {
          if (!["singles", "doubles"].includes(clean.toLowerCase())) {
            return response({ error: "draw must be singles or doubles" }, 400);
          }
        } else if (key === "from" || key === "to") {
          if (Number.isNaN(Date.parse(clean))) {
            return response({ error: key + " must be a valid date" }, 400);
          }
        } else if (key === "has_market" || key === "has_analysis") {
          if (!["true", "false"].includes(clean.toLowerCase())) {
            return response({ error: key + " must be true or false" }, 400);
          }
        } else if (clean.length > 100) {
          return response({ error: key + " must not exceed 100 characters" }, 400);
        }
        params.set(key, clean);
      }
      const from = params.get("from");
      const to = params.get("to");
      if (from && to && Date.parse(from) > Date.parse(to)) {
        return response({ error: "from must not be later than to" }, 400);
      }

      try {
        // Cache identical match queries for fifteen minutes to protect the free API quota.
        const cache = caches.default;
        const cacheUrl = new URL(request.url);
        cacheUrl.searchParams.delete("fresh");
        const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
        const cached = forceRefresh ? null : await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set("X-Data-Cache", "HIT");
          return new Response(cached.body, { status: cached.status, headers });
        }

        const upstream = await fetchLiveTennis(
          `https://api.livetennisapi.com/api/public/v1/matches?${params.toString()}`,
          {
            headers: {
              "X-API-Key": env.LIVE_TENNIS_API_KEY,
              "Accept": "application/json"
            }
          },
          env
        );

        const body = await upstream.json();
        const responseHeaders = {};
        const retryAfter = upstream.headers.get("Retry-After");
        if (retryAfter) responseHeaders["Retry-After"] = retryAfter;
        if (upstream.ok) {
          const cacheTtl = status === "live" ? 20 : 900;
          responseHeaders["Cache-Control"] = `public, max-age=${cacheTtl}`;
          responseHeaders["X-Data-Cache"] = "MISS";
          const cacheResponse = new Response(JSON.stringify(body), {
            status: 200,
            headers: {
              ...cors,
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": `public, max-age=${cacheTtl}`,
              "X-Data-Cache": "MISS"
            }
          });
          await cache.put(cacheKey, cacheResponse);
        }
        return response(body, upstream.status, responseHeaders);
      } catch (error) {
        return response({ error: "Could not reach Live Tennis API" }, 502);
      }
    }

    if (path === "/predict") {
      if (!["GET", "POST"].includes(request.method)) {
        return response({ error: "Method not allowed" }, 405);
      }

      let body = {};
      if (request.method === "POST") {
        let rawBody = "";
        try {
          const reader = request.body?.getReader();
          if (reader) {
            const chunks = [];
            let totalBytes = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              totalBytes += value.byteLength;
              if (totalBytes > 16384) {
                await reader.cancel();
                return response({ error: "Request body is too large (maximum 16 KB)" }, 413);
              }
              chunks.push(value);
            }
            const bytes = new Uint8Array(totalBytes);
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.byteLength;
            }
            rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          }
        } catch {
          return response({ error: "Could not read a valid UTF-8 request body" }, 400);
        }
        try {
          body = JSON.parse(rawBody);
        } catch {
          return response({ error: "Invalid JSON body" }, 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return response({ error: "Request body must be a JSON object" }, 400);
        }
      } else {
        body = {
          playerA: url.searchParams.get("playerA") || "Player A",
          playerB: url.searchParams.get("playerB") || "Player B",
          ratingA: url.searchParams.get("ratingA") || "1800",
          ratingB: url.searchParams.get("ratingB") || "1600",
          oddsA: url.searchParams.get("oddsA"),
          oddsB: url.searchParams.get("oddsB")
        };
      }

      const hasIdA = body.playerIdA !== undefined && body.playerIdA !== null && String(body.playerIdA).trim() !== "";
      const hasIdB = body.playerIdB !== undefined && body.playerIdB !== null && String(body.playerIdB).trim() !== "";
      if (hasIdA !== hasIdB) {
        return response({ error: "Provide both player IDs, or neither" }, 400);
      }

      const parseDecimal = value => {
        if (typeof value !== "number" && typeof value !== "string") return null;
        if (typeof value === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      };
      const parseRating = value => {
        const number = parseDecimal(value);
        return number !== null && number > 0 && number <= 5000 ? number : null;
      };
      const parseOdds = value => {
        if (value === undefined || value === null || value === "") return { valid: true, value: null };
        const number = parseDecimal(value);
        return number !== null && number > 1 && number <= 1000
          ? { valid: true, value: number }
          : { valid: false, value: null };
      };
      const oddsAResult = parseOdds(body.oddsA);
      const oddsBResult = parseOdds(body.oddsB);
      if (!oddsAResult.valid || !oddsBResult.valid) {
        return response({ error: "Odds must be numbers greater than 1 and no greater than 1000" }, 400);
      }
      const oddsA = oddsAResult.value;
      const oddsB = oddsBResult.value;

      const cleanName = (value, fallback) =>
        typeof value === "string" && value.trim()
          ? value.trim().slice(0, 100)
          : fallback;

      let profileA = null;
      let profileB = null;
      let selectedA = null;
      let selectedB = null;
      let a;
      let b;
      let source = "manual-test";

      if (hasIdA && hasIdB) {
        const playerIdA = String(body.playerIdA).trim();
        const playerIdB = String(body.playerIdB).trim();
        if (playerIdA === playerIdB) {
          return response({ error: "Player IDs must identify two different players" }, 400);
        }
        if (playerIdA.length > 128 || playerIdB.length > 128) {
          return response({ error: "Player IDs must not exceed 128 characters" }, 400);
        }
        if (!env.LIVE_TENNIS_API_KEY) {
          return response({ error: "LIVE_TENNIS_API_KEY secret is not configured" }, 500);
        }
        try {
          [profileA, profileB] = await Promise.all([
            getPlayerProfile(playerIdA, env.LIVE_TENNIS_API_KEY, env),
            getPlayerProfile(playerIdB, env.LIVE_TENNIS_API_KEY, env)
          ]);
        } catch {
          return response({ error: "Could not retrieve one or both player profiles" }, 502);
        }
        const requestedSurface = normalizeSurface(body.surface);
        selectedA = findEloForSurface(profileA, requestedSurface);
        selectedB = findEloForSurface(profileB, requestedSurface);
        a = selectedA?.rating ?? null;
        b = selectedB?.rating ?? null;
        source = "Live Tennis API player profiles";
        if (a === null || b === null) {
          return response({
            error: "Elo rating is unavailable for one or both players",
            playerA: cleanName(body.playerA, cleanName(profileA?.name, "Player A")),
            playerB: cleanName(body.playerB, cleanName(profileB?.name, "Player B")),
            ratingA: a,
            ratingB: b,
            ratingTypeA: selectedA?.type || null,
            ratingTypeB: selectedB?.type || null,
            surface: requestedSurface,
            source,
            diagnostic: {
              profileKeysA: profileA && typeof profileA === "object" ? Object.keys(profileA) : [],
              profileKeysB: profileB && typeof profileB === "object" ? Object.keys(profileB) : [],
              profileIdentityA: profileA && typeof profileA === "object" ? {
                archivePlayerId: profileA.archive_player_id ?? null,
                name: profileA.name ?? null,
                tour: profileA.tour ?? null,
                ranking: profileA.ranking ?? null,
                itfRanking: profileA.itf_ranking ?? null,
                rankingPoints: profileA.ranking_points ?? null
              } : null,
              profileIdentityB: profileB && typeof profileB === "object" ? {
                archivePlayerId: profileB.archive_player_id ?? null,
                name: profileB.name ?? null,
                tour: profileB.tour ?? null,
                ranking: profileB.ranking ?? null,
                itfRanking: profileB.itf_ranking ?? null,
                rankingPoints: profileB.ranking_points ?? null
              } : null,
              eloFieldsA: collectEloDiagnostics(profileA),
              eloFieldsB: collectEloDiagnostics(profileB)
            }
          }, 422);
        }
      } else {
        a = parseRating(body.ratingA);
        b = parseRating(body.ratingB);
        if (a === null || b === null) {
          return response({ error: "Provide two ratings greater than 0 and no greater than 5000" }, 400);
        }
      }

      const pA = eloProbability(a, b);
      const pB = 1 - pA;
      const probabilityPercentA = Number((pA * 100).toFixed(2));
      const probabilityPercentB = Number((pB * 100).toFixed(2));
      return response({
        playerA: cleanName(body.playerA, cleanName(profileA?.name, "Player A")),
        playerB: cleanName(body.playerB, cleanName(profileB?.name, "Player B")),
        ratingA: a,
        ratingB: b,
        probabilityA: probabilityPercentA,
        probabilityB: probabilityPercentB,
        probabilityExactA: pA,
        probabilityExactB: pB,
        fairOddsA: Number((1 / pA).toFixed(3)),
        fairOddsB: Number((1 / pB).toFixed(3)),
        oddsA,
        oddsB,
        evA: oddsA !== null ? Number(((pA * oddsA - 1) * 100).toFixed(2)) : null,
        evB: oddsB !== null ? Number(((pB * oddsB - 1) * 100).toFixed(2)) : null,
        method: "Elo",
        officialProfileA: hasIdA ? extractOfficialPlayerProfile(profileA) : null,
        officialProfileB: hasIdB ? extractOfficialPlayerProfile(profileB) : null,
        ratingTypeA: hasIdA ? selectedA.type : "manual",
        ratingTypeB: hasIdB ? selectedB.type : "manual",
        surface: hasIdA ? (selectedA.surface || null) : null,
        source,
        ratingsAsOfA: extractRatingAsOf(profileA),
        ratingsAsOfB: extractRatingAsOf(profileB),
        ratingFreshnessA: assessRatingFreshness(extractRatingAsOf(profileA)),
        ratingFreshnessB: assessRatingFreshness(extractRatingAsOf(profileB)),
        ratingQualityA: assessRatingPlausibility(a),
        ratingQualityB: assessRatingPlausibility(b),
        ratingQualityGap: Math.abs(a - b) > 800 ? "review" : "normal",
        note: source === "manual-test" ? "Manual test ratings; not player data." : (selectedA.type === "surface" && selectedB.type === "surface" ? "Probabilities use surface-specific Elo ratings." : "At least one surface-specific rating is unavailable; overall Elo fallback used. Model does not account for injuries or recent form.")
      });
    }

    return response({
      service: "tennis-value-api",
      endpoints: ["/health", "/matches", "/player-history", "/player-h2h", "/player-stats", "/players/search", "/odds", "/historical", "/predict"]
    });
  }
};
