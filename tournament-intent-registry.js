/**
 * Point-in-time registry for sourced tournament-intent evidence.
 * This is a review/import layer; it does not crawl sites or alter predictions.
 */
import { assessTournamentIntent } from "./tournament-intent.js";

const TYPES = new Set([
  "explicit_preparation", "explicit_next_event_priority",
  "official_return_cautious", "recent_injury_return",
  "major_event_soon", "schedule_bridge",
  "explicit_title_focus", "home_event_commitment"
]);

function date(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clean(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stableKey(item) {
  return [
    item.playerId ?? item.playerName.toLowerCase(),
    item.eventId ?? item.tournament.toLowerCase(),
    item.targetMatchId ?? "",
    item.type,
    item.publishedAt,
    item.sourceUrl
  ].join("|").toLowerCase();
}

/**
 * Validate a manually reviewed public-source record.
 * Required: player identity, event, target match, type, source URL/name,
 * publication and capture timestamps, reviewer verification.
 */
export function validateTournamentIntentRecord(input, options = {}) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["record_not_object"], record: null };
  }
  const playerId = input.playerId == null ? null : String(input.playerId).trim();
  const playerName = clean(input.playerName, 120);
  const eventId = input.eventId == null ? null : String(input.eventId).trim();
  const tournament = clean(input.tournament, 160);
  const targetMatchId = clean(input.targetMatchId, 120);
  const type = clean(input.type, 80);
  const sourceName = clean(input.sourceName, 160);
  const sourceUrl = clean(input.sourceUrl, 1000);
  const published = date(input.publishedAt);
  const captured = date(input.capturedAt);
  const target = date(options.targetMatchStart ?? input.targetMatchStart);
  const detail = clean(input.detail, 500);
  const quote = clean(input.quote, 280);

  if (!playerId && !playerName) errors.push("missing_player_identity");
  if (!eventId && !tournament) errors.push("missing_event_identity");
  if (!targetMatchId) errors.push("missing_target_match_id");
  if (!TYPES.has(type)) errors.push("unknown_evidence_type");
  if (!sourceName) errors.push("missing_source_name");
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:") errors.push("source_url_must_be_https");
  } catch { errors.push("invalid_source_url"); }
  if (published === null) errors.push("invalid_published_at");
  if (captured === null) errors.push("invalid_captured_at");
  if (target === null) errors.push("invalid_target_match_start");
  if (input.verified !== true) errors.push("record_not_verified");
  if (!clean(input.reviewedBy, 120)) errors.push("missing_reviewer");

  if (published !== null && captured !== null && published > captured) {
    errors.push("captured_before_publication");
  }
  if (target !== null && published !== null && published > target) {
    errors.push("publication_after_target_match_start");
  }
  if (target !== null && captured !== null && captured > target) {
    errors.push("capture_after_target_match_start");
  }
  const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : 45;
  if (captured !== null && target !== null && (target - captured) / 86400000 > maxAgeDays) {
    errors.push("evidence_too_old_for_target_match");
  }

  if (errors.length) return { valid: false, errors, record: null };
  const record = {
    schemaVersion: 1,
    playerId,
    playerName: playerName || null,
    eventId,
    tournament: tournament || null,
    targetMatchId,
    targetMatchStart: new Date(target).toISOString(),
    type,
    publishedAt: new Date(published).toISOString(),
    capturedAt: new Date(captured).toISOString(),
    observedAt: new Date(captured).toISOString(),
    sourceName,
    sourceUrl,
    quote: quote || null,
    detail: detail || null,
    verified: true,
    reviewedBy: clean(input.reviewedBy, 120)
  };
  record.evidenceId = stableKey(record);
  return { valid: true, errors: [], record };
}

/**
 * Import records without silently accepting bad rows or duplicate evidence.
 * Existing records win on duplicate keys; the caller can review rejected rows.
 */
export function importTournamentIntentEvidence(existing, incoming, options = {}) {
  const records = Array.isArray(existing) ? [...existing] : [];
  const known = new Set(records.map(row => row?.evidenceId).filter(Boolean));
  const accepted = [];
  const rejected = [];
  let duplicates = 0;
  for (const [index, input] of (Array.isArray(incoming) ? incoming : []).entries()) {
    const result = validateTournamentIntentRecord(input, options);
    if (!result.valid) {
      rejected.push({ index, errors: result.errors });
      continue;
    }
    if (known.has(result.record.evidenceId)) {
      duplicates++;
      continue;
    }
    known.add(result.record.evidenceId);
    records.push(result.record);
    accepted.push(result.record);
  }
  return {
    records,
    accepted,
    rejected,
    duplicates,
    summary: {
      existingCount: Array.isArray(existing) ? existing.length : 0,
      receivedCount: Array.isArray(incoming) ? incoming.length : 0,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      duplicateCount: duplicates
    }
  };
}

/** Build a sourced assessment for one player and one target match. */
export function assessRegisteredTournamentIntent(records, player, targetMatch, options = {}) {
  const playerId = player?.playerId == null ? null : String(player.playerId);
  const playerName = clean(player?.playerName, 120).toLowerCase();
  const matchId = clean(targetMatch?.matchId, 120);
  const start = date(targetMatch?.startTime);
  if (!matchId || start === null || (!playerId && !playerName)) {
    return { status: "invalid_target", classification: "unknown", evidenceCount: 0 };
  }
  const relevant = (Array.isArray(records) ? records : []).filter(row => {
    const samePlayer = playerId
      ? String(row?.playerId ?? "") === playerId
      : clean(row?.playerName, 120).toLowerCase() === playerName;
    return samePlayer && row?.targetMatchId === matchId;
  });
  const safe = relevant.filter(row => {
    const published = date(row.publishedAt);
    const captured = date(row.capturedAt);
    return row.verified === true && published !== null && captured !== null
      && published <= start && captured <= start;
  });
  return assessTournamentIntent(safe, {
    asOf: options.asOf ?? targetMatch.startTime,
    targetDate: targetMatch.startTime,
    maxAgeDays: options.maxAgeDays ?? 45
  });
}
