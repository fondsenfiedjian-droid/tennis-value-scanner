/**
 * Objective human-factor inputs for tennis predictions.
 *
 * This module deliberately reports observable workload/recovery measurements only.
 * It does not invent a psychological score or modify win probabilities.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function parseTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validDuration(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 600 ? minutes : null;
}

/**
 * @param {Array<{playedAt?: string|number, date?: string, startTime?: string,
 *   durationMinutes?: number|string, duration?: number|string, matchId?: string|number}>} matches
 * @param {{now?: string|number}} options
 */
export function calculateWorkloadProfile(matches, options = {}) {
  const now = parseTime(options.now ?? Date.now());
  if (now === null) throw new TypeError("A valid now timestamp is required");

  const source = Array.isArray(matches) ? matches : [];
  const seen = new Set();
  const rows = [];
  let invalidDateCount = 0;
  let futureMatchCount = 0;

  for (const match of source) {
    if (!match || typeof match !== "object" || Array.isArray(match)) continue;
    const playedAt = parseTime(match.playedAt ?? match.startTime ?? match.date);
    if (playedAt === null) {
      invalidDateCount++;
      continue;
    }
    if (playedAt > now + 5 * 60 * 1000) {
      futureMatchCount++;
      continue;
    }
    const identity = match.matchId != null
      ? String(match.matchId)
      : String(playedAt) + "|" + String(match.opponentId ?? match.opponent ?? "");
    if (seen.has(identity)) continue;
    seen.add(identity);
    rows.push({
      playedAt,
      durationMinutes: validDuration(match.durationMinutes ?? match.duration)
    });
  }

  rows.sort((a, b) => a.playedAt - b.playedAt);
  const latest = rows.at(-1) ?? null;
  const inWindow = hours => rows.filter(row => row.playedAt >= now - hours * HOUR);
  const last72Hours = inWindow(72);
  const last7Days = inWindow(168);
  const durationRows = last7Days.filter(row => row.durationMinutes !== null);
  const playedDates = [...new Set(rows.map(row => new Date(row.playedAt).toISOString().slice(0, 10)))];
  let consecutivePlayingDays = 0;
  if (playedDates.length) {
    const dateSet = new Set(playedDates);
    let cursor = Date.parse(playedDates.at(-1) + "T00:00:00.000Z");
    while (dateSet.has(new Date(cursor).toISOString().slice(0, 10))) {
      consecutivePlayingDays++;
      cursor -= DAY;
    }
  }

  return {
    status: rows.length ? "available" : "no_history",
    matchesInLast72Hours: last72Hours.length,
    matchesInLast7Days: last7Days.length,
    restHours: latest ? Number(Math.max(0, (now - latest.playedAt) / HOUR).toFixed(1)) : null,
    restDays: latest ? Number(Math.max(0, (now - latest.playedAt) / DAY).toFixed(2)) : null,
    consecutivePlayingDays,
    knownDurationMinutesLast7Days: durationRows.reduce((sum, row) => sum + row.durationMinutes, 0),
    durationCoverageLast7Days: {
      known: durationRows.length,
      total: last7Days.length,
      complete: last7Days.length > 0 && durationRows.length === last7Days.length
    },
    historyMatches: rows.length,
    invalidDateCount,
    futureMatchCount,
    lastMatchAt: latest ? new Date(latest.playedAt).toISOString() : null,
    interpretation: "measurements_only_not_probability_adjusted"
  };
}

/**
 * Positive deltas mean player A has more recent workload; negative deltas mean
 * player A has more rest. These are descriptive differences, not effect sizes.
 */
export function compareWorkloadProfiles(playerA, playerB) {
  const fields = [
    "matchesInLast72Hours",
    "matchesInLast7Days",
    "restHours",
    "restDays",
    "consecutivePlayingDays",
    "knownDurationMinutesLast7Days"
  ];
  const deltas = {};
  for (const field of fields) {
    const a = playerA?.[field];
    const b = playerB?.[field];
    deltas[field] = Number.isFinite(a) && Number.isFinite(b)
      ? Number((a - b).toFixed(2))
      : null;
  }
  return {
    deltas,
    comparable: fields.filter(field => deltas[field] !== null).length,
    status: fields.some(field => deltas[field] !== null) ? "comparable" : "insufficient_data",
    interpretation: "descriptive_only_no_probability_adjustment"
  };
}
