#!/usr/bin/env node
/**
 * Discover diverse Live Tennis API matches whose point tape is genuinely observed
 * from the opening point. Uses only the isolated diagnostics preview Worker.
 */
import { extractObservedMatchMetadata } from "./observed-match-metadata.mjs";\n\nconst BASE = (process.env.DIAGNOSTICS_BASE || "https://tennis-value-api-diagnostics-preview.fonds-enfiedjian.workers.dev").replace(/\/$/, "");
const SEEDS = {
  atp: ["Novak Djokovic", "Carlos Alcaraz", "Jannik Sinner"],
  wta: ["Iga Swiatek", "Coco Gauff", "Aryna Sabalenka"],
  challenger: ["Luca Nardi", "Arthur Cazaux", "Zizou Bergs", "Nishesh Basavareddy", "Federico Cina"],
  itf: ["Rei Sakamoto", "Federico Cina", "Yibing Wu", "Sara Saito", "Alina Korneeva", "Brenda Fruhvirtova", "Tyra Caterina Grant"],
  juniors: ["Yaroslav Demin", "Laura Samson", "Hannah Klugman", "Tyra Caterina Grant", "Joao Fonseca", "Mirra Andreeva"]
};
const PER_TOUR_TARGET = Number(process.env.PER_TOUR_TARGET || 4);
const MAX_TAPE_CHECKS_PER_TOUR = Number(process.env.MAX_TAPE_CHECKS_PER_TOUR || 24);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function get(path) {
  const response = await fetch(BASE + path, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`Invalid JSON from ${path} (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${path}: ${body.error || body.accessStatus || "unknown"}`);
  return body;
}
const enc = value => encodeURIComponent(String(value));
const first = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};
const matchId = match => {
  const value = first(match, ["id", "match_id", "matchId", "matchID"]);
  return /^\d{1,15}$/.test(String(value ?? "")) && Number(value) > 0 ? String(value) : null;
};
const playerId = player => {
  const value = first(player, ["id", "player_id", "playerId"]);
  return /^\d{1,15}$/.test(String(value ?? "")) && Number(value) > 0 ? String(value) : null;
};
const normalized = value => String(value || "").toLowerCase().replace(/[^a-z ]/g, "").trim();

async function main() {
  const selected = [];
  const report = [];
  const globalIds = new Set();
  for (const [tour, names] of Object.entries(SEEDS)) {
    const bySeed = [];
    for (const name of names) {
      const search = await get("/players/search?search=" + enc(name) + "&limit=8");
      const players = Array.isArray(search.players) ? search.players : [];
      const player = players.find(p => normalized(p.name) === normalized(name))
        || (players.length === 1 ? players[0] : null);
      const id = player && playerId(player);
      if (!id) {
        bySeed.push({ seed: name, playerFound: false, candidateMatches: 0, candidates: [], checks: 0, accepted: 0 });
        continue;
      }
      const history = await get("/player-history?id=" + id + "&limit=50&offset=0&tour=" + tour);
      const matches = Array.isArray(history.data) ? history.data : [];
      const candidates = matches.map(match => ({ id: matchId(match), tour, seed: name, player_id: id, match }))
        .filter(x => x.id && !globalIds.has(x.id));
      bySeed.push({ seed: name, playerFound: true, playerId: id, candidateMatches: candidates.length, historyFields: matches[0] ? Object.keys(matches[0]).sort() : [], historySample: matches[0] || null, candidates, checks: 0, accepted: 0 });
      await sleep(150);
    }

    // Round-robin across seeds prevents one player's recent history from consuming the whole budget.
    const candidateQueue = [];
    let cursor = 0;
    while (bySeed.some(x => x.candidates?.length)) {
      for (const seed of bySeed) {
        if (seed.candidates?.length) candidateQueue.push(seed.candidates.shift());
      }
      cursor++;
      if (cursor > 50) break;
    }
    const candidateCount = candidateQueue.length;
    let checks = 0, accepted = 0;
    for (const candidate of candidateQueue) {
      if (accepted >= PER_TOUR_TARGET || checks >= MAX_TAPE_CHECKS_PER_TOUR) break;
      checks++;
      const seedReport = bySeed.find(x => x.seed === candidate.seed);
      if (seedReport) seedReport.checks++;
      let raw;
      try { raw = await get("/match-tape?id=" + candidate.id + "&points=default&sequence=raw"); }
      catch { continue; }
      if (raw.accessStatus !== "available" || raw.meta?.point_source !== "observed" ||
          raw.meta?.coverage !== "from_start" || !Array.isArray(raw.tape) || raw.tape.length < 2) continue;
      let clean;
      try { clean = await get("/match-tape?id=" + candidate.id + "&points=default&sequence=clean"); }
      catch { continue; }
      if (clean.accessStatus !== "available" || clean.meta?.point_source !== "observed" ||
          clean.meta?.coverage !== "from_start" || !Array.isArray(clean.tape) || clean.tape.length < 2) continue;
      const m = candidate.match;
      const record = {
        match_id: candidate.id,
        tour,
        seed_player: candidate.seed,
        seed_player_id: candidate.player_id,
        ...extractObservedMatchMetadata(m),
        raw_rows: raw.tape.length,
        clean_rows: clean.tape.length,
        point_source: raw.meta.point_source,
        coverage: raw.meta.coverage
      };
      selected.push(record);
      globalIds.add(candidate.id);
      accepted++;
      if (seedReport) seedReport.accepted++;
      await sleep(150);
    }
    report.push({
      tour,
      seedPlayers: names.length,
      candidateMatches: candidateCount,
      tapeChecks: checks,
      accepted,
      seeds: bySeed.map(({ candidates, ...summary }) => summary)
    });
  }
  const result = {
    schema: "tennis-value-scanner.observed-tape-discovery.v2",
    discovered_at: new Date().toISOString(),
    source: "Live Tennis API PRO via diagnostics preview Worker",
    target_per_tour: PER_TOUR_TARGET,
    max_tape_checks_per_tour: MAX_TAPE_CHECKS_PER_TOUR,
    total: selected.length,
    tours: report,
    matches: selected
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (selected.length < 1) process.exitCode = 2;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
