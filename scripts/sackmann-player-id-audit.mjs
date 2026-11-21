#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./backtest.mjs";

const positiveId = value => /^\\d+$/.test(String(value ?? "").trim()) && Number(value) > 0;
const normalizeName = value => String(value ?? "")
  .normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\\s+/g, " ");
const normalizeDate = value => {
  const digits = String(value ?? "").replace(/\\D/g, "");
  return digits.length === 8 ? digits : "";
};

export function auditSackmannPlayerIds(profiles, playerRows, tour) {
  if (!["atp", "wta"].includes(tour)) throw new RangeError("tour must be atp or wta");
  const players = new Map();
  const duplicateIds = new Set();
  for (const row of playerRows) {
    const id = String(row.player_id ?? "").trim();
    if (!positiveId(id)) continue;
    if (players.has(id)) duplicateIds.add(id);
    else players.set(id, row);
  }

  const results = profiles.map(profile => {
    const idValue = profile.archivePlayerId ?? profile.archive_player_id ?? null;
    const id = idValue == null ? "" : String(idValue).trim();
    const profileTour = String(profile.tour ?? tour).toLowerCase();
    const base = {
      tour,
      archivePlayerId: id || null,
      profileName: String(profile.name ?? "").trim(),
      status: "unmatched",
      sackmannName: null,
      countryMatch: null,
      birthdayMatch: null,
      reason: ""
    };
    if (profileTour !== tour) return { ...base, status: "wrong_tour", reason: "Profile tour does not match requested archive" };
    if (!positiveId(id)) return { ...base, status: "missing_archive_id", reason: "Live profile has no archive_player_id" };
    if (duplicateIds.has(id)) return { ...base, status: "duplicate_archive_id", reason: "Sackmann player_id is not unique in source file" };
    const player = players.get(id);
    if (!player) return { ...base, status: "not_found", reason: "archive_player_id not found in Sackmann player file" };

    const sackmannName = [player.name_first, player.name_last].filter(Boolean).join(" ").trim();
    const nameMatch = normalizeName(profile.name) === normalizeName(sackmannName);
    const profileCountry = String(profile.country ?? "").trim().toUpperCase();
    const sackmannCountry = String(player.ioc ?? "").trim().toUpperCase();
    const countryMatch = profileCountry && sackmannCountry ? profileCountry === sackmannCountry : null;
    const profileBirthday = normalizeDate(profile.birthday ?? profile.dob);
    const sackmannBirthday = normalizeDate(player.dob);
    const birthdayMatch = profileBirthday && sackmannBirthday ? profileBirthday === sackmannBirthday : null;
    const metadataConflict = countryMatch === false || birthdayMatch === false;
    const status = nameMatch && !metadataConflict ? "verified" : "review";
    const reason = !nameMatch ? "Name mismatch" : metadataConflict ? "Country or date-of-birth mismatch" : "Exact archive ID and name match";
    return { ...base, status, sackmannName, countryMatch, birthdayMatch, reason };
  });

  const counts = Object.fromEntries(["verified","review","missing_archive_id","not_found","wrong_tour","duplicate_archive_id"]
    .map(status => [status, results.filter(row => row.status === status).length]));
  return { tour, profileCount: profiles.length, uniqueSackmannPlayerIds: players.size, counts, results };
}

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!["--tour","--profiles","--players","--out"].includes(key) || !args[i+1]) {
      throw new Error("Usage: node scripts/sackmann-player-id-audit.mjs --tour atp|wta --profiles profiles.json --players atp_players.csv [--out report.json]");
    }
    options[key.slice(2)] = args[++i];
  }
  if (!options.tour || !options.profiles || !options.players) {
    throw new Error("Usage: node scripts/sackmann-player-id-audit.mjs --tour atp|wta --profiles profiles.json --players atp_players.csv [--out report.json]");
  }
  const profileText = await readFile(options.profiles, "utf8");
  let profiles;
  try { profiles = JSON.parse(profileText); }
  catch { profiles = profileText.split(/\\r?\\n/).filter(Boolean).map(line => JSON.parse(line)); }
  if (!Array.isArray(profiles)) profiles = profiles.profiles ?? profiles.results;
  if (!Array.isArray(profiles)) throw new TypeError("Profiles input must be a JSON array or an object containing profiles/results");
  const playerRows = parseCsv(await readFile(options.players, "utf8"));
  const report = auditSackmannPlayerIds(profiles, playerRows, options.tour);
  const json = JSON.stringify(report, null, 2) + "\\n";
  if (options.out) await writeFile(options.out, json, "utf8");
  console.log(json);
}
if (import.meta.url === "file://" + process.argv[1]) await main();
