import vm from "node:vm";

const APP_URL = process.env.APP_URL || "https://fascinating-paprenjak-1aa9b3.netlify.app";
const API_URL = process.env.API_URL || "https://tennis-value-api.fonds-enfiedjian.workers.dev";
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
if (!htmlResponse.ok) throw new Error(`Production app returned HTTP ${htmlResponse.status}`);
const html = await htmlResponse.text();

const scheduleStart = html.indexOf("function extractMatches(payload)");
const scheduleEnd = html.indexOf("function archiveMatchDate(m)", scheduleStart);
const oddsStart = html.indexOf("function normalizePlayer(s)");
const oddsEnd = html.indexOf("function normalizeTour(value)", oddsStart);
if ([scheduleStart, scheduleEnd, oddsStart, oddsEnd].some(index => index < 0)) {
  throw new Error("Could not locate the production app's schedule/odds matching functions");
}

const sandbox = { cachedOdds: oddsResponse.data.items, Date, Set, Map, Number, String, Math, Object, Array, RegExp, JSON };
const source = html.slice(scheduleStart, scheduleEnd) + "\n" + html.slice(oddsStart, oddsEnd) +
  "\nglobalThis.checkFns = { extractMatches, playerName, getPlayerId, matchDate, oddsForMatch, oddsSideForPlayer };";
vm.runInNewContext(source, sandbox);

const matches = sandbox.checkFns.extractMatches(matchesResponse.data);
if (!Array.isArray(matches)) throw new Error("Live schedule payload is not recognized by the production app");
const odds = oddsResponse.data.items;
if (!Array.isArray(odds)) throw new Error("Winamax odds payload is not an array");

const matched = [];
const unmatchedWithReason = [];
for (const match of matches) {
  const selected = sandbox.checkFns.oddsForMatch(match);
  const players = match.players || {};
  const playerA = sandbox.checkFns.playerName(players.p1 || match.player1);
  const playerB = sandbox.checkFns.playerName(players.p2 || match.player2);
  if (selected.length >= 2) {
    const sideA = selected.filter(quote => sandbox.checkFns.oddsSideForPlayer(quote, playerA) === "1");
    const sideB = selected.filter(quote => sandbox.checkFns.oddsSideForPlayer(quote, playerA) === "2");
    matched.push({
      match: playerA + " — " + playerB,
      tournament: match.tournament_name || match.tournament || match.event_name || match.competition || "",
      quoteCount: selected.length,
      side1: sideA[0]?.oddsDecimal ?? null,
      side2: sideB[0]?.oddsDecimal ?? null,
      bookmaker: selected[0]?.bookmaker || "",
      playerIdA: sandbox.checkFns.getPlayerId(players.p1 || match.player1),
      playerIdB: sandbox.checkFns.getPlayerId(players.p2 || match.player2),
      surface: match.surface || match.court || match.court_name || (/finals/i.test(match.tournament_name || match.tournament || "") && /turin/i.test(match.tournament_name || match.tournament || "") ? "hard" : ""),
      playerA,
      playerB
    });
  } else {
    unmatchedWithReason.push({ match: playerA + " — " + playerB, tournament: match.tournament_name || match.tournament || "" });
  }
}

const diagnostics = oddsResponse.data.diagnostics || {};
console.log("Schedule:", matches.length, "matches; cache:", matchesResponse.cache);
console.log("Winamax:", odds.length, "rows;", diagnostics.freshScrapedAt ?? "?", "fresh scrape timestamps; cache:", oddsResponse.cache);
console.log("Matched complete markets:", matched.length, "matches /", matched.reduce((sum, row) => sum + row.quoteCount, 0), "quotes");
for (const row of matched) console.log("MATCHED", JSON.stringify(row));
console.log("Unmatched schedule sample:", JSON.stringify(unmatchedWithReason.slice(0, 8)));

if (matched.length === 0 && odds.length > 0) {
  throw new Error("Production app matching logic paired zero Winamax markets with the live schedule");
}
if (matched.some(row => row.side1 === null || row.side2 === null)) {
  throw new Error("A matched event did not map both prices to the correct player sides");
}
const predictionCandidates = matched.filter(row =>
  row.playerIdA && row.playerIdB &&
  [Number(row.side1), Number(row.side2)].some(value => Number.isFinite(value) && value >= 1.9)
).slice(0, 3);
let successfulPredictions = 0;
let unavailableRatings = 0;
if (predictionCandidates.length) {
  for (const candidate of predictionCandidates) {
    const predictionResponse = await fetch(API_URL + "/predict", {
      method: "POST",
      signal: timeout,
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        playerIdA: candidate.playerIdA,
        playerIdB: candidate.playerIdB,
        playerA: candidate.playerA,
        playerB: candidate.playerB,
        surface: candidate.surface,
        oddsA: Number(candidate.side1),
        oddsB: Number(candidate.side2)
      })
    });
    const prediction = await predictionResponse.json();
    if (!predictionResponse.ok) {
      if (predictionResponse.status === 422 && String(prediction.error || "").includes("Elo rating is unavailable")) {
        unavailableRatings++;
        console.log("LIVE ELO UNAVAILABLE", JSON.stringify({
          match: candidate.match,
          error: prediction.error,
          ratings: [prediction.ratingA ?? null, prediction.ratingB ?? null],
          ratingTypes: [prediction.ratingTypeA ?? null, prediction.ratingTypeB ?? null]
        }));
        continue;
      }
      throw new Error("Live Elo prediction failed for " + candidate.match + ": " + (prediction.error || predictionResponse.status));
    }
    const pA = Number(prediction.probabilityExactA);
    const pB = Number(prediction.probabilityExactB);
    if (!Number.isFinite(pA) || !Number.isFinite(pB) || Math.abs(pA + pB - 1) > 1e-10) {
      throw new Error("Live Elo prediction returned invalid complementary probabilities for " + candidate.match);
    }
    const expectedEvA = (pA * Number(candidate.side1) - 1) * 100;
    const expectedEvB = (pB * Number(candidate.side2) - 1) * 100;
    if (Math.abs(expectedEvA - Number(prediction.evA)) > 0.02 ||
        Math.abs(expectedEvB - Number(prediction.evB)) > 0.02) {
      throw new Error("Live EV does not match the probability × odds formula for " + candidate.match);
    }
    successfulPredictions++;
    console.log("LIVE ELO + EV", JSON.stringify({
      match: candidate.match,
      source: prediction.source,
      ratings: [prediction.ratingA, prediction.ratingB],
      probabilities: [prediction.probabilityA, prediction.probabilityB],
      odds: [candidate.side1, candidate.side2],
      ev: [prediction.evA, prediction.evB],
      ratingsAsOf: [prediction.ratingsAsOfA || null, prediction.ratingsAsOfB || null],
      ratingFreshness: [prediction.ratingFreshnessA?.status || "unknown", prediction.ratingFreshnessB?.status || "unknown"],
      ratingQuality: [prediction.ratingQualityA?.status || "unknown", prediction.ratingQualityB?.status || "unknown"],
      marketNoVigProbability: (() => {
        const impliedA = 1 / Number(candidate.side1), impliedB = 1 / Number(candidate.side2);
        const total = impliedA + impliedB;
        return [Number((impliedA / total * 100).toFixed(2)), Number((impliedB / total * 100).toFixed(2))];
      })(),
      surface: prediction.surface || candidate.surface || null
    }));
  }
  console.log("Prediction coverage:", successfulPredictions, "calculated;", unavailableRatings, "without usable Elo ratings.");
  if (successfulPredictions === 0) {
    throw new Error("No live Elo prediction could be calculated for the selected matched markets");
  }
} else {
  console.log("Live Elo/EV not requested: no matched event had two player IDs and an odds candidate at or above 1.90.");
}
console.log("Production odds matching check passed.");
