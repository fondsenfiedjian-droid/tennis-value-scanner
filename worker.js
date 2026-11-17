     
     const cors = {
       "Access-Control-Allow-Origin": "*",
         "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
           "Access-Control-Allow-Headers": "Content-Type"
           };

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
                                           async fetch(request) {
                                               const url = new URL(request.url);
                                                   const path = url.pathname.replace(/\/+$/, "");

                                                       if (request.method === "OPTIONS") {
                                                             return new Response(null, { headers: cors });
                                                                 }

                                                                     if (path === "/health") {
                                                                           return response({
                                                                                   status: "ok",
                                                                                           service: "tennis-model-api",
                                                                                                   version: "2.0"
                                                                                                         });
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
                                                                                                                                                                                                                                                                                                                                                                                                                                                                       service: "tennis-model-api",
                                                                                                                                                                                                                                                                                                                                                                                                                                                                             version: "2.0",
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   endpoints: ["/health", "/predict"]
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       });
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         };
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         
