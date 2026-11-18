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
        endpoints: ["/health", "/matches?status=upcoming", "/matches?status=live", "/odds", "/predict"]
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
        return response({
          source: "Apify Winamax dataset",
          datasetId: APIFY_DATASET_ID,
          count: Array.isArray(items) ? items.length : 0,
          items
        });
      } catch (error) {
        return response({ error: "Could not retrieve odds from Apify" }, 502);
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
        return response(body, upstream.status);
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

        const a = Number(body.ratingA);
        const b = Number(body.ratingB);

        if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
          return response({ error: "Invalid ratings" }, 400);
        }

        const pA = eloProbability(a, b);
        const pB = 1 - pA;

        return response({
          playerA: body.playerA || "Player A",
          playerB: body.playerB || "Player B",
          ratingA: a,
          ratingB: b,
          probabilityA: Number((pA * 100).toFixed(2)),
          probabilityB: Number((pB * 100).toFixed(2)),
          fairOddsA: Number((1 / pA).toFixed(3)),
          fairOddsB: Number((1 / pB).toFixed(3)),
          method: "Elo",
          note: "Test calculation only. Historical ratings are not connected yet."
        });
      } catch (error) {
        return response({ error: "Invalid request" }, 400);
      }
    }

    return response({
      service: "tennis-value-api",
      endpoints: ["/health", "/matches", "/odds", "/predict"]
    });
  }
};
