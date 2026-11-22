# ACE v0.1 — Calendar Workload Feature Specification

Status: research specification; not production code.
Isolation: `research/tvs-research-lab-v1` only.
Purpose: test whether pre-match calendar workload indicators add predictive information beyond the frozen PFE control.

## 1. Scope and non-claims

ACE v0.1 measures observable recent match activity from the historical match archive. It does **not** measure physiological recovery, hours of rest, injury status, fitness, fatigue, or readiness. Calendar-day gaps are not recovery hours. The archive does not provide sufficiently reliable match start/end timestamps or a complete injury feed.

ACE must abstain when the available records cannot support a defensible feature calculation.

## 2. Input contract

Expected source columns (semicolon-delimited archive):
`match_id;date;tournoi;tournoi_id;categorie;genre;surface;tour;joueur1;joueur1_id;joueur2;joueur2_id;cote1_ouverture;cote2_ouverture;cote1_cloture;cote2_cloture;vainqueur_id;score;duree_min`

Required for a target:
- stable target match id;
- target local/event date parseable as YYYY-MM-DD;
- player IDs for both participants;
- historical rows with parseable dates and player IDs.

Optional:
- duration in minutes;
- match status/outcome fields if a future source supplies them.

Do not infer player identity from names when IDs are absent or conflicting.

## 3. Strict temporal eligibility

For a target match on date D, only records with date strictly earlier than D are eligible. Every same-day record is excluded because the archive has no reliable within-day ordering.

For each target player independently, calculate windows:
- prior 3 calendar days: [D-3, D-1];
- prior 7 calendar days: [D-7, D-1];
- prior 14 calendar days: [D-14, D-1].

Window boundaries are calendar dates in the tournament's date convention. Do not convert them into hours.

## 4. Candidate features

For each player and each window:
- `matches_3d`, `matches_7d`, `matches_14d`: count of eligible match records;
- `playing_days_3d`, `playing_days_7d`, `playing_days_14d`: count of distinct eligible dates;
- `known_duration_sum_7d`, `known_duration_sum_14d`: sum of valid, positive, explicitly recorded durations only;
- `duration_coverage_7d`, `duration_coverage_14d`: rows with valid duration divided by eligible match rows; null if denominator is zero;
- `consecutive_prior_playing_days`: length of the immediately preceding consecutive run of dates containing at least one eligible match, ending at D-1; zero if D-1 has no match.

Pairwise directional features may be formed only after player-level values are calculated:
`ACE_signal = standardized(player_A_feature - player_B_feature)`.
Standardization parameters must be fitted on training data only, then frozen for validation/test.

Do not create an overall fatigue score in v0.1. Keep raw features separately inspectable.

## 5. Record-quality exclusions

Exclude from duration sums and mark as uncertain:
- missing, zero, negative, non-numeric, or implausible duration;
- walkover / W-O, default / DEF, abandoned / ABD, or administrative outcomes when reliably identifiable;
- retirement / RET records from duration-based workload until a consistent policy is validated.

A completed match with an ordinary score may count as a match record even if duration is missing. Keep count coverage and duration coverage separate. If status cannot be identified from the source, do not silently infer it from score text.

Deduplicate only exact duplicate source records with matching stable match ID and participant IDs. Conflicting duplicates must be flagged and excluded from the affected feature calculation; never choose one arbitrarily.

## 6. Output status and uncertainty

ACE output uses the common `system-output.schema.json` contract:
- `available`: sufficient valid temporal and identity coverage;
- `insufficient_data`: required source fields or usable history are missing;
- `abstain`: source conflict or ambiguous record quality makes the estimate unsafe;
- `error`: implementation failure, not a data-quality status.

Include evidence for window counts, date bounds, duration coverage, exclusions, and source snapshot/hash. Missing values remain null; never replace missing data with zero.

Reliability must be tied to measured coverage and record quality, not tuned to make ACE appear useful. Until calibrated, publish coverage and uncertainty but do not assign a learned reliability weight.

## 7. Leakage and evaluation rules

- Compute features independently for each target using only dates strictly before target date.
- Fit scaling, imputation, feature selection, and coefficients on training folds only.
- Use chronological walk-forward splits; never random-split matches.
- Compare PFE control vs PFE+ACE on exactly the same eligible matches.
- Report ATP/WTA separately, plus surface and event-level strata where sample sizes permit.
- Report coverage and abstention rate alongside Brier score, log loss, calibration, and accuracy.
- Use paired per-match loss differences and confidence intervals; do not claim improvement from accuracy alone.
- Run ablations: counts only; playing days only; duration-only with coverage gate; combined raw features.
- No post-match information, final odds, or results may enter ACE inputs.

## 8. Minimum acceptance gates

ACE v0.1 cannot be promoted to Aggregator input until:
1. date and ID parsing tests pass;
2. same-day exclusion tests pass;
3. boundary tests for 3/7/14-day windows pass;
4. duplicate/conflict tests pass;
5. missing and invalid duration tests pass;
6. RET/W-O/ABD/DEF policy is explicit for the actual source;
7. a leakage audit confirms all feature timestamps precede target date;
8. walk-forward evaluation shows incremental probability-quality value on identical samples;
9. the result survives ATP/WTA and major-surface checks without material calibration damage.

Passing engineering tests does not establish predictive value. Passing a historical experiment does not authorize production integration.

## 9. Required unit-test cases

1. Prior match on D-1 is included.
2. Match on D-3 is included in 3d; D-4 is excluded.
3. Match on D-7 is included in 7d; D-8 is excluded.
4. Match on D-14 is included in 14d; D-15 is excluded.
5. Same-day match is always excluded.
6. Two matches on one date count as two matches and one playing day.
7. Missing duration does not become zero duration.
8. Zero/negative duration is excluded from duration sum and lowers coverage.
9. Conflicting duplicate IDs cause abstention/flag, not arbitrary selection.
10. A player with no prior archive rows returns explicit insufficient history, not a fabricated zero-load claim.

## 10. v0.1 decision

ACE is a calendar workload evidence module only. It has no direct probability weight, no injury diagnosis, no hours-rest estimate, and no production connection. Its first deliverable is a leakage-safe feature table plus a coverage report.
