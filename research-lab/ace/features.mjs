/**
 * ACE v0.1 — leakage-safe calendar workload features.
 * Research-only module. No production imports or probability weights.
 *
 * Input rows may use source CSV names (joueur1_id, joueur2_id, date,
 * duree_min, match_id) or normalized aliases documented below.
 */
const DAY_MS = 86_400_000;
const MAX_PLAUSIBLE_DURATION_MIN = 600;

function pick(row, ...keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return null;
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.trim()
    ? null
    : date;
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeRow(row) {
  const dateText = pick(row, "date", "match_date");
  const date = parseDate(String(dateText ?? ""));
  const id = pick(row, "match_id", "id");
  const p1 = pick(row, "joueur1_id", "player1_id", "player_a_id");
  const p2 = pick(row, "joueur2_id", "player2_id", "player_b_id");
  const durationRaw = pick(row, "duree_min", "duration_min", "duration");
  const duration = durationRaw === null ? null : Number(String(durationRaw).replace(",", "."));
  const status = String(pick(row, "match_status", "status", "result_status") ?? "").trim().toUpperCase();
  return {
    id: id === null ? null : String(id).trim(),
    date,
    dateText: date ? dayKey(date) : null,
    p1: p1 === null ? null : String(p1).trim(),
    p2: p2 === null ? null : String(p2).trim(),
    duration: Number.isFinite(duration) && duration > 0 && duration <= MAX_PLAUSIBLE_DURATION_MIN
      ? duration : null,
    durationPresent: durationRaw !== null,
    status,
    raw: row
  };
}

function isAdministrativeStatus(status) {
  return /^(W\/O|WO|WALKOVER|DEF|DEFAULT|ABD|ABANDONED)$/.test(status);
}

function fingerprint(row) {
  return JSON.stringify([row.dateText, row.p1, row.p2, row.duration, row.status]);
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function playerFeatures(playerId, targetDate, rows) {
  const eligible = rows.filter(row =>
    row.date && row.date.getTime() < targetDate.getTime() &&
    (row.p1 === playerId || row.p2 === playerId)
  );

  const windows = {};
  for (const n of [3, 7, 14]) {
    const selected = eligible.filter(row => {
      const age = daysBetween(row.date, targetDate);
      return age >= 1 && age <= n;
    });
    const dates = new Set(selected.map(row => row.dateText));
    windows[`${n}d`] = {
      matches: selected.length,
      playing_days: dates.size,
      date_from: dayKey(new Date(targetDate.getTime() - n * DAY_MS)),
      date_to: dayKey(new Date(targetDate.getTime() - DAY_MS))
    };
  }

  const durationWindows = {};
  for (const n of [7, 14]) {
    const selected = eligible.filter(row => {
      const age = daysBetween(row.date, targetDate);
      return age >= 1 && age <= n;
    });
    const valid = selected.filter(row => row.duration !== null && !isAdministrativeStatus(row.status) && row.status !== "RET" && row.status !== "RETIRED" && row.status !== "RETIREMENT");
    durationWindows[`${n}d`] = {
      known_duration_sum_min: valid.reduce((sum, row) => sum + row.duration, 0),
      duration_coverage: selected.length === 0 ? null : valid.length / selected.length,
      duration_known_matches: valid.length,
      eligible_matches: selected.length
    };
  }

  const priorDays = new Set(eligible.map(row => row.dateText));
  let consecutive = 0;
  for (let offset = 1; offset <= 365; offset += 1) {
    const key = dayKey(new Date(targetDate.getTime() - offset * DAY_MS));
    if (!priorDays.has(key)) break;
    consecutive += 1;
  }

  return {
    player_id: playerId,
    history_matches_before_target: eligible.length,
    matches_3d: windows["3d"].matches,
    matches_7d: windows["7d"].matches,
    matches_14d: windows["14d"].matches,
    playing_days_3d: windows["3d"].playing_days,
    playing_days_7d: windows["7d"].playing_days,
    playing_days_14d: windows["14d"].playing_days,
    known_duration_sum_7d_min: durationWindows["7d"].known_duration_sum_min,
    known_duration_sum_14d_min: durationWindows["14d"].known_duration_sum_min,
    duration_coverage_7d: durationWindows["7d"].duration_coverage,
    duration_coverage_14d: durationWindows["14d"].duration_coverage,
    consecutive_prior_playing_days: consecutive,
    windows,
    duration_windows: durationWindows
  };
}

/**
 * @param {object} target { match_id, date, player_a_id, player_b_id }
 * @param {object[]} history historical source rows
 * @param {object} options { source_snapshot_id }
 */
export function calculateAceFeatures(target, history, options = {}) {
  const targetDate = parseDate(String(pick(target, "date", "match_date") ?? ""));
  const targetId = pick(target, "match_id", "id");
  const playerA = pick(target, "player_a_id", "joueur1_id", "player1_id");
  const playerB = pick(target, "player_b_id", "joueur2_id", "player2_id");

  if (!targetDate || !targetId || !playerA || !playerB || String(playerA) === String(playerB)) {
    return {
      status: "insufficient_data",
      reason: "Target match requires a valid date, stable match id and two distinct player ids.",
      match_id: targetId === null ? null : String(targetId),
      system_id: "ACE",
      model_version_id: "ACE-v0.1"
    };
  }

  const normalized = (Array.isArray(history) ? history : []).map(normalizeRow);
  const relevantMalformed = normalized.some(row =>
    !row.date || !row.p1 || !row.p2
  );
  const byId = new Map();
  const conflicts = new Set();
  const unique = [];

  for (const row of normalized) {
    if (!row.id) continue;
    const previous = byId.get(row.id);
    if (!previous) {
      byId.set(row.id, row);
      unique.push(row);
    } else if (fingerprint(previous) !== fingerprint(row)) {
      conflicts.add(row.id);
    }
    // Exact duplicate: ignore the repeated copy.
  }

  const conflictedRows = unique.filter(row =>
    conflicts.has(row.id) && row.date && row.date < targetDate &&
    (row.p1 === String(playerA) || row.p2 === String(playerA) ||
     row.p1 === String(playerB) || row.p2 === String(playerB))
  );
  if (conflictedRows.length) {
    return {
      status: "abstain",
      reason: "Conflicting duplicate match ids affect one or both target players' prior history.",
      match_id: String(targetId),
      system_id: "ACE",
      model_version_id: "ACE-v0.1",
      conflict_match_ids: [...new Set(conflictedRows.map(row => row.id))]
    };
  }

  const cleanRows = unique.filter(row =>
    row.id && !conflicts.has(row.id) && row.date && row.p1 && row.p2 &&
    !isAdministrativeStatus(row.status)
  );

  const a = playerFeatures(String(playerA), targetDate, cleanRows);
  const b = playerFeatures(String(playerB), targetDate, cleanRows);
  const hasHistory = a.history_matches_before_target > 0 && b.history_matches_before_target > 0;

  return {
    status: hasHistory ? "available" : "insufficient_data",
    reason: hasHistory ? null : "At least one player has no usable prior archive history.",
    match_id: String(targetId),
    system_id: "ACE",
    model_version_id: "ACE-v0.1",
    prediction_created_at: null,
    data_cutoff_at: `${dayKey(new Date(targetDate.getTime() - DAY_MS))}T23:59:59`,
    source_snapshot_id: options.source_snapshot_id ?? null,
    source_rows: normalized.length,
    exact_duplicates_ignored: normalized.filter(row => row.id && byId.has(row.id)).length - unique.length + 0,
    conflicted_match_ids_excluded: [...conflicts],
    malformed_rows_present: relevantMalformed,
    same_day_rows_excluded: normalized.filter(row =>
      row.date && row.date.getTime() === targetDate.getTime() &&
      (row.p1 === String(playerA) || row.p2 === String(playerA) ||
       row.p1 === String(playerB) || row.p2 === String(playerB))
    ).length,
    players: { A: a, B: b },
    claims: {
      measures_calendar_match_activity_only: true,
      estimates_recovery_hours: false,
      diagnoses_injury_or_fitness: false,
      probability_weight_applied: false
    }
  };
}
