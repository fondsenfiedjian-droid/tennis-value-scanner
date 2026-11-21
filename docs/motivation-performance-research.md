# Motivation and performance-gap research

Status: research only. No production model, live API, EV calculation or bet selection changes.

## Objective

Test whether pre-match indicators of recent underperformance and tournament workload add predictive information beyond pre-date Elo. Do not label a player as unmotivated: match archives cannot establish mental state, injury, intent or travel burden reliably.

## Available archive fields

The normalized Sackmann match archive provides tournament date and ID/name, round, surface, winner/loser IDs and names, ranks, ages, score, best-of and match duration where available. It does not reliably provide exact match start times, travel distance, player statements, injury diagnoses, withdrawals with reasons, or verified motivation.

## Phase 1 — Performance Gap

For each match, calculate pre-match Elo probability for each player using only completed matches strictly before the match date. For player i in match t:

- expected outcome = pre-match Elo win probability;
- realized outcome = 1 for a win, 0 for a loss;
- residual = realized outcome minus expected outcome.

Build player-level rolling features from prior appearances only:
- mean residual over last 3, 5 and 10 matches;
- cumulative residual over last 5 and 10 matches;
- count of losses in last 3, 5 and 10;
- consecutive-loss streak;
- count of losses to opponents whose pre-match Elo was at least 100/200 points lower;
- number of prior observations available for each window.

Use shrinkage / minimum-observation safeguards so one or two matches do not create an extreme signal. Preserve separate measures for underperformance and loss streaks; they are not equivalent.

## Leakage and chronology rules

- Sort by date and stable match identity.
- Every match on the same calendar date must use identical player histories and pre-date Elo states; do not let one same-day result affect another same-day prediction.
- Evaluate a day's matches first, then update all player histories and Elo after the whole day.
- For every evaluated year, fit model coefficients only on earlier calendar years; freeze them throughout the evaluation year.
- Baseline and candidate must be evaluated on exactly the same eligible matches.
- Use symmetric player orientation or equivalent sign-consistent observations.
- Deduplicate natural match identities and quarantine genuinely conflicting records.
- Keep all outputs in a separate research report; never overwrite source CSVs.

## Phase 2 — workload / schedule pressure

If duration and match counts are sufficiently complete, add separately:
- matches played in prior 7, 14 and 30 calendar days;
- sets played in prior 7, 14 and 30 days, parsed only from completed scores;
- days since previous archived match;
- consecutive calendar days with matches;
- consecutive tournament weeks, only where tournament boundaries can be reconstructed safely.

Treat archive-derived workload as a proxy. The archive may omit lower-tier events, so gaps and match counts are not complete career schedules. Do not infer travel distance or fatigue from tournament locations without verified event dates and reliable itinerary data.

## Phase 3 — tournament context

Only add features with reliable historical provenance:
- tournament level and round;
- ranking-points context / points to defend, if a valid point-in-time source can be reconstructed;
- season phase and tournament sequence;
- home-country indicator only if player nationality and event location are reliable.

Do not infer motivation from a player's name, reputation, press narrative or an isolated loss. Do not use future tournament outcomes, post-match interviews, later injury reports or end-of-season standings as pre-match inputs.

## Walk-forward experiments

Run ATP and WTA separately. Compare:
1. pre-date Elo baseline;
2. Elo + performance-gap features;
3. Elo + workload features;
4. Elo + performance gap + workload;
5. optional tournament-context additions after provenance checks.

Report Brier score, LogLoss, accuracy, calibration, sample counts and year-by-year deltas. Include recent-period results and cohorts by surface, tournament level, ranking/Elo strength and recent workload. Report coverage/missingness and compare all models on matched samples.

A feature is promising only if it improves probability quality consistently across years and relevant cohorts, not merely accuracy or one aggregate period. This is predictive signal research, not proof of betting profitability.

## First implementation milestone

Build a read-only Performance Gap walk-forward script and unit tests. Initial version uses only the existing normalized ATP/WTA archives and pre-date Elo. No new downloads required. After validating chronology and leakage tests, run both tours and inspect overall, annual and surface results before adding workload features.

## Phase 1 implementation — v1

Script: `scripts/sackmann-performance-gap-research.mjs`

Tests: `tests/sackmann-performance-gap-research.test.mjs`

Run locally after pulling the latest `main`:

```sh
node --check scripts/sackmann-performance-gap-research.mjs
node --test tests/sackmann-performance-gap-research.test.mjs
node scripts/sackmann-performance-gap-research.mjs --tour atp --from 20000101 --to 20261231 --out ~/tennis-data/atp-performance-gap-report.json ~/tennis-data/atp-normalized.csv
node scripts/sackmann-performance-gap-research.mjs --tour wta --from 20000101 --to 20261231 --out ~/tennis-data/wta-performance-gap-report.json ~/tennis-data/wta-normalized.csv
```

The v1 candidate compares Elo-only logistic regression against Elo plus differences between the players' recent residual means (last 3/5/10), recent loss rates (last 5/10), current losing streak and prior archive-match counts. Residuals are calculated from the pre-date overall Elo probability. ATP and WTA are separate; model coefficients are trained on earlier calendar years and frozen during each evaluation year. The report includes overall, year and surface comparisons.

V1 deliberately does not yet include cumulative residual totals, losses specifically to lower-Elo opponents, workload or tournament-context variables. These should be added only after inspecting the first reports. The archive is incomplete below the main tours; zero or low archive activity must not be interpreted as proof of inactivity or lack of motivation.

Validation: GitHub Actions regression suite passed 463/463 tests after the implementation and stream-writer repair. Research only; no production model changed.

## Phase 1b — feature ablation

The research script accepts `--exclude-features` (comma-separated exact feature names) to remove selected predictors from the candidate while keeping the Elo-only baseline and evaluation sample unchanged. Available predictors:

- `gapMean3Diff,gapMean5Diff,gapMean10Diff`
- `lossRate5Diff,lossRate10Diff`
- `lossStreakDiff`
- `historyCountDiff`

Example: `--exclude-features historyCountDiff,lossStreakDiff`.

Use this to test whether recent residuals, conventional loss-rate/streak features, and archive-history count each add independent value. Do not select features based on the full-history result alone; compare modern years and surfaces as well. The ablation remains research-only.
