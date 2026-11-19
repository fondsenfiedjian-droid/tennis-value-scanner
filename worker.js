const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "Retry-After, X-Data-Cache"
};

const APIFY_DATASET_ID = "ZBWihC1oYU8Pq9uBo";

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

const playerProfileInflight = new Map();

async function getPlayerProfile(playerId, apiKey) {
  // Share concurrent cache misses inside this Worker isolate to avoid duplicate quota use.
  const key = String(playerId);
  const pending = playerProfileInflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    // Elo profiles are effectively static for this model; cache them for seven days.
    const cache = caches.default;
    const cacheKey = new Request("https://tennis-value-api.fonds-enfiedjian.workers.dev/__player-profile/" + encodeURIComponent(key));
    const cached = await cache.match(cacheKey);
    if (cached) return cached.json();

    const res = await fetch("https://api.livetennisapi.com/api/public/v1/players/" + encodeURIComponent(key), {
      headers: { "X-API-Key": apiKey, "Accept": "application/json" }
    });
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
        liveTennisApiConfigured: Boolean(env.LIVE_TENNIS_API_KEY),
        apifyTokenConfigured: Boolean(env.APIFY_TOKEN),
        endpoints: ["/health", "/usage", "/matches?status=upcoming", "/matches?status=live", "/result?id=123", "/player-stats?id=123", "/odds", "/predict"]
      });
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

        const upstream = await fetch(
          `https://api.apify.com/v2/datasets/${APIFY_DATASET_ID}/items?clean=true&format=json&limit=1000`,
          {
            headers: {
              "Authorization": `Bearer ${env.APIFY_TOKEN}`,
              "Accept": "application/json"
            }
          }
        );

        if (!upstream.ok) {
          return response({
            error: "Apify request failed",
            upstreamStatus: upstream.status
          }, upstream.status);
        }

        const items = await upstream.json();
        if (!Array.isArray(items)) {
          return response({ error: "Apify dataset response was not an array" }, 502);
        }
        const payload = {
          source: "Apify Winamax dataset",
          datasetId: APIFY_DATASET_ID,
          retrievedAt: new Date().toISOString(),
          count: items.length,
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

    if (path === "/usage") {
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
      if (!env.LIVE_TENNIS_API_KEY) return response({ error: "LIVE_TENNIS_API_KEY secret is not configured" }, 500);
      try {
        // Live Tennis documents /usage as quota-exempt.
        const upstream = await fetch("https://api.livetennisapi.com/api/public/v1/usage", {
          headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" }
        });
        const body = await upstream.json();
        return response(body, upstream.status);
      } catch (error) {
        return response({ error: "Could not retrieve API usage" }, 502);
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
        const upstream = await fetch("https://api.livetennisapi.com/api/public/v1/players/" + encodeURIComponent(playerId) + "/stats", {
          headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" }
        });
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
        const upstream = await fetch("https://api.livetennisapi.com/api/public/v1/matches/" + id, {
          headers: { "X-API-Key": env.LIVE_TENNIS_API_KEY, "Accept": "application/json" }
        });
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

        const upstream = await fetch(
          `https://api.livetennisapi.com/api/public/v1/matches?${params.toString()}`,
          {
            headers: {
              "X-API-Key": env.LIVE_TENNIS_API_KEY,
              "Accept": "application/json"
            }
          }
        );

        const body = await upstream.json();
        const result = response(body, upstream.status);
        if (upstream.ok) {
          const cacheResponse = new Response(JSON.stringify(body), {
            status: 200,
            headers: {
              ...cors,
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "public, max-age=900",
              "X-Data-Cache": "MISS"
            }
          });
          await cache.put(cacheKey, cacheResponse);
        }
        return result;
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
            getPlayerProfile(playerIdA, env.LIVE_TENNIS_API_KEY),
            getPlayerProfile(playerIdB, env.LIVE_TENNIS_API_KEY)
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
            source
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
      endpoints: ["/health", "/matches", "/player-stats", "/odds", "/predict"]
    });
  }
};
