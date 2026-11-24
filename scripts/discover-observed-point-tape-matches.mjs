#!/usr/bin/env node
/**
 * Discover diverse Live Tennis API matches whose point tape is genuinely observed
 * from the opening point. Uses only the isolated diagnostics preview Worker.
 */
const BASE = (process.env.DIAGNOSTICS_BASE || "https://tennis-value-api-diagnostics-preview.fonds-enfiedjian.workers.dev").replace(/\/$/, "");
const SEEDS = {
  atp: ["Novak Djokovic", "Carlos Alcaraz", "Jannik Sinner"],
  wta: ["Iga Swiatek", "Coco Gauff", "Aryna Sabalenka"],
  challenger: ["Luca Nardi", "Arthur Cazaux", "Zizou Bergs"],
  itf: ["Hugo Gaston", "Diane Parry", "Harriet Dart"],
  juniors: ["Joao Fonseca", "Mirra Andreeva"]
};
const PER_TOUR_TARGET = Number(process.env.PER_TOUR_TARGET || 4);
const MAX_TAPE_CHECKS_PER_TOUR = Number(process.env.MAX_TAPE_CHECKS_PER_TOUR || 12);
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
const matchId = match => {
  for (const key of ["id", "match_id", "matchId"]) {
    const value = match?.[key];
    if (/^\d{1,15}$/.test(String(value ?? "")) && Number(value) > 0) return String(value);
  }
  return null;
};
const playerId = player => {
  const value = player?.id ?? player?.player_id ?? player?.playerId;
  return /^\d{1,15}$/.test(String(value ?? "")) && Number(value) > 0 ? String(value) : null;
};

async function main() {
  const selected = [];
  const report = [];
  const globalIds = new Set();
  for (const [tour, names] of Object.entries(SEEDS)) {
    const candidates = [];
    const seen = new Set();
    for (const name of names) {
      const search = await get("/players/search?search=" + enc(name) + "&limit=8");
      const players = Array.isArray(search.players) ? search.players : [];
      const normalized = name.toLowerCase().replace(/[^a-z ]/g, "").trim();
      const player = players.find(p => String(p.name || "").toLowerCase().replace(/[^a-z ]/g, "").trim() === normalized)
        || (players.length === 1 ? players[0] : null);
      const id = player && playerId(player);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const history = await get("/player-history?id=" + id + "&limit=50&offset=0&tour=" + tour);
      for (const match of (Array.isArray(history.data) ? history.data : [])) {
        const id = matchId(match);
        if (!id || globalIds.has(id)) continue;
        candidates.push({ id, tour, seed: name, player_id: playerId(player), match });
      }
      await sleep(180);
    }
    candidates.sort((a,b) => String(b.match.date || b.match.start_time || "").localeCompare(String(a.match.date || a.match.start_time || "")));
    let checks = 0, accepted = 0;
    for (const candidate of candidates) {
      if (accepted >= PER_TOUR_TARGET || checks >= MAX_TAPE_CHECKS_PER_TOUR) break;
      checks++;
      let raw;
      try {
        raw = await get("/match-tape?id=" + candidate.id + "&points=default&sequence=raw");
      } catch { continue; }
      if (raw.accessStatus !== "available" || raw.meta?.point_source !== "observed" ||
          raw.meta?.coverage !== "from_start" || !Array.isArray(raw.tape) || raw.tape.length < 2) continue;
      let clean;
      try {
        clean = await get("/match-tape?id=" + candidate.id + "&points=default&sequence=clean");
      } catch { continue; }
      if (clean.accessStatus !== "available" || clean.meta?.point_source !== "observed" ||
          clean.meta?.coverage !== "from_start" || !Array.isArray(clean.tape) || clean.tape.length < 2) continue;
      const record = {
        match_id: candidate.id,
        tour,
        seed_player: candidate.seed,
        seed_player_id: candidate.player_id,
        player1: candidate.match.player1 ?? candidate.match.player_1 ?? null,
        player2: candidate.match.player2 ?? candidate.match.player_2 ?? null,
        date: candidate.match.date ?? candidate.match.start_time ?? null,
        surface: candidate.match.surface ?? null,
        raw_rows: raw.tape.length,
        clean_rows: clean.tape.length,
        point_source: raw.meta.point_source,
        coverage: raw.meta.coverage
      };
      selected.push(record);
      globalIds.add(candidate.id);
      accepted++;
      await sleep(180);
    }
    report.push({ tour, seedPlayers: names.length, candidateMatches: candidates.length, tapeChecks: checks, accepted });
  }
  const result = {
    schema: "tennis-value-scanner.observed-tape-discovery.v1",
    discovered_at: new Date().toISOString(),
    source: "Live Tennis API PRO via diagnostics preview Worker",
    target_per_tour: PER_TOUR_TARGET,
    total: selected.length,
    tours: report,
    matches: selected
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (selected.length < 1) process.exitCode = 2;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
