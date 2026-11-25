/**
 * Tournament-intent evidence classifier.
 *
 * Classifies documented pre-match evidence that a tournament may be a
 * preparation/secondary-priority event for a player. It does not infer intent
 * from results, ranking, odds or reputation, and never changes probabilities.
 */

const DAY = 24 * 60 * 60 * 1000;

const TYPES = {
  explicit_preparation: { weight: 4, label: "Player explicitly describes this event as preparation / match practice" },
  explicit_next_event_priority: { weight: 4, label: "Player explicitly prioritizes a later event" },
  official_return_cautious: { weight: 3, label: "Player/team confirms a cautious return or limited workload" },
  recent_injury_return: { weight: 2, label: "Verified recent return after injury or a long absence" },
  major_event_soon: { weight: 2, label: "A higher-priority event follows soon in the calendar" },
  schedule_bridge: { weight: 1, label: "Current event sits between more important calendar commitments" },
  explicit_title_focus: { weight: -4, label: "Player explicitly states a strong goal to win this event" },
  home_event_commitment: { weight: -1, label: "Player describes this event as a special personal/home priority" }
};

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Evidence schema:
 * { type, observedAt, source, detail, verified, eventDate? }
 * All evidence must be available before the target match. A source and
 * observation timestamp are mandatory; verified must be true.
 */
export function assessTournamentIntent(evidence, options = {}) {
  const asOf = timestamp(options.asOf);
  if (asOf === null) throw new TypeError("A valid asOf timestamp is required");
  const targetDate = options.targetDate ? timestamp(options.targetDate) : null;
  const maxAgeDays = Number.isFinite(options.maxAgeDays) ? Math.max(0, options.maxAgeDays) : 45;
  const rows = Array.isArray(evidence) ? evidence : [];
  const accepted = [];
  const rejected = { unknownType: 0, unverified: 0, missingSourceOrDate: 0, futureEvidence: 0, stale: 0, afterTargetDate: 0 };

  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rule = TYPES[item.type];
    if (!rule) { rejected.unknownType++; continue; }
    if (item.verified !== true) { rejected.unverified++; continue; }
    const observed = timestamp(item.observedAt);
    if (observed === null || typeof item.source !== "string" || !item.source.trim()) {
      rejected.missingSourceOrDate++; continue;
    }
    if (observed > asOf) { rejected.futureEvidence++; continue; }
    if (targetDate !== null && observed > targetDate) { rejected.afterTargetDate++; continue; }
    const ageDays = (asOf - observed) / DAY;
    if (ageDays > maxAgeDays) { rejected.stale++; continue; }
    accepted.push({
      type: item.type,
      label: rule.label,
      weight: rule.weight,
      observedAt: new Date(observed).toISOString(),
      ageDays: Number(ageDays.toFixed(1)),
      source: item.source.trim(),
      detail: typeof item.detail === "string" ? item.detail.trim().slice(0, 500) : ""
    });
  }

  const positive = accepted.filter(x => x.weight > 0);
  const contrary = accepted.filter(x => x.weight < 0);
  const positiveWeight = positive.reduce((sum, x) => sum + x.weight, 0);
  const contraryWeight = contrary.reduce((sum, x) => sum + Math.abs(x.weight), 0);
  const net = positiveWeight - contraryWeight;
  let classification = "unknown";
  if (net >= 6 && positive.length >= 2) classification = "strong_preparation_or_low_priority_signals";
  else if (net >= 3) classification = "possible_preparation_or_low_priority";
  else if (net <= -3) classification = "evidence_of_high_event_priority";
  else if (accepted.length) classification = "mixed_or_weak_evidence";

  return {
    status: accepted.length ? "evidence_available" : "insufficient_evidence",
    classification,
    evidenceCount: accepted.length,
    positiveEvidenceCount: positive.length,
    contraryEvidenceCount: contrary.length,
    positiveWeight,
    contraryWeight,
    netEvidenceWeight: net,
    evidence: accepted,
    rejected,
    interpretation: "evidence_triage_only_not_player_intent_or_win_probability",
    probabilityAdjustment: null
  };
}

export function compareTournamentIntent(playerA, playerB) {
  const a = Number(playerA?.netEvidenceWeight);
  const b = Number(playerB?.netEvidenceWeight);
  return {
    status: Number.isFinite(a) && Number.isFinite(b) ? "comparable_evidence_weights" : "insufficient_data",
    differenceAminusB: Number.isFinite(a) && Number.isFinite(b) ? a - b : null,
    interpretation: "descriptive_only_not_a_probability_adjustment"
  };
}
