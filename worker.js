const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const APIFY_DATASET_ID = "ZBWihC1oYU8Pq9uBo";

function response(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8"
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

async function getPlayerProfile(playerId, apiKey) {
  // Elo profiles are effectively static for this model; cache them for seven days.
  const cache = caches.default;
  const cacheKey = new Request("https://tennis-value-api.fonds-enfiedjian.workers.dev/__player-profile/" + encodeURIComponent(playerId));
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const res = await fetch("https://api.livetennisapi.com/api/public/v1/players/" + encodeURIComponent(playerId), {
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
        endpoints: ["/health", "/usage", "/matches?status=upcoming", "/matches?status=live", "/odds", "/predict"]
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
        const payload = {
          source: "Apify Winamax dataset",
          datasetId: APIFY_DATASET_ID,
          count: Array.isArray(items) ? items.length : 0,
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
        return response(payload);
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

      const params = new URLSearchParams({ status });
      for (const key of ["limit", "offset", "tour", "draw", "from", "to", "player", "country", "has_market", "has_analysis"]) {
        const value = url.searchParams.get(key);
        if (value !== null) params.set(key, value);
      }

      try {
        // Cache identical match queries for fifteen minutes to protect the free API quota.
        const cache = caches.default;
        const cacheUrl = new URL(request.url);
        const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
        const cached = await cache.match(cacheKey);
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
      try {
        let body = {};
        if (request.method === "POST") {
          body = await request.json();
        } else if (request.method === "GET") {
          body = {
            playerA: url.searchParams.get("playerA") || "Player A",
            playerB: url.searchParams.get("playerB") || "Player B",
            ratingA: url.searchParams.get("ratingA") || "1800",
            ratingB: url.searchParams.get("ratingB") || "1600"
          };
        } else {
          return response({ error: "Method not allowed" }, 405);
        }

        let profileA = null;
        let profileB = null;
        let a;
        let b;
        let source = "manual-test";

        if (body.playerIdA && body.playerIdB) {
          if (!env.LIVE_TENNIS_API_KEY) {
            return response({ error: "LIVE_TENNIS_API_KEY secret is not configured" }, 500);
          }
          [profileA, profileB] = await Promise.all([
            getPlayerProfile(body.playerIdA, env.LIVE_TENNIS_API_KEY),
            getPlayerProfile(body.playerIdB, env.LIVE_TENNIS_API_KEY)
          ]);
          a = findElo(profileA);
          b = findElo(profileB);
          source = "Live Tennis API player profiles";
          if (a === null || b === null) {
            return response({
              error: "Elo rating is unavailable for one or both players",
              playerA: body.playerA || profileA.name || "Player A",
              playerB: body.playerB || profileB.name || "Player B",
              ratingA: a,
              ratingB: b,
              source
            }, 422);
          }
        } else {
          a = Number(body.ratingA);
          b = Number(body.ratingB);
          if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
            return response({ error: "Provide both player IDs or two positive ratings" }, 400);
          }
        }

        const pA = eloProbability(a, b);
        const pB = 1 - pA;
        const oddsA = Number(body.oddsA);
        const oddsB = Number(body.oddsB);
        const validOddsA = Number.isFinite(oddsA) && oddsA > 1;
        const validOddsB = Number.isFinite(oddsB) && oddsB > 1;

        return response({
          playerA: body.playerA || profileA?.name || "Player A",
          playerB: body.playerB || profileB?.name || "Player B",
          ratingA: a,
          ratingB: b,
          probabilityA: Number((pA * 100).toFixed(2)),
          probabilityB: Number((pB * 100).toFixed(2)),
          fairOddsA: Number((1 / pA).toFixed(3)),
          fairOddsB: Number((1 / pB).toFixed(3)),
          oddsA: validOddsA ? oddsA : null,
          oddsB: validOddsB ? oddsB : null,
          evA: validOddsA ? Number(((pA * oddsA - 1) * 100).toFixed(2)) : null,
          evB: validOddsB ? Number(((pB * oddsB - 1) * 100).toFixed(2)) : null,
          method: "Elo",
          source,
          ratingsAsOfA: profileA?.stats?.ratings_as_of || profileA?.ratings_as_of || null,
          ratingsAsOfB: profileB?.stats?.ratings_as_of || profileB?.ratings_as_of || null,
          note: source === "manual-test" ? "Manual test ratings; not player data." : "Probabilities derived from player Elo ratings. Model does not account for surface, injuries, or recent form."
        });
      } catch (error) {
        return response({ error: error.message || "Prediction request failed" }, 502);
      }
    }

    return response({
      service: "tennis-value-api",
      endpoints: ["/health", "/matches", "/odds", "/predict"]
    });
  }
};
