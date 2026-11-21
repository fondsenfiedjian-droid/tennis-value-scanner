# ACE v2 — recovery and accumulated-load research plan

## Status
Research plan only. ACE remains a shadow correction; no production model or betting path is changed.

## Existing baseline
The current winner-formula experiment adds a regularized correction to the existing PFE combined probability using prior 3/7-day match counts, playing days, known minutes, duration coverage and an explicit workload-availability flag. ATP and WTA are fitted separately. Same-day matches are scored before that day's results are added.

The workload feature builder already calculates restDays, but the current winner-formula feature vector does not use it. The separate workload research script has tested restDays in a 2025-train / 2026-evaluation design; do not silently treat that experiment as part of the current ACE formula.

## Hypotheses to test — in predeclared order

1. **Recovery gap:** restDays since the most recent prior match may add information beyond match counts and minutes. Audit complete player-history coverage first; missing histories must remain missing/flagged, not be treated as 30 days of rest.
2. **Accumulated load:** add prior 14- and 28-calendar-day match counts, distinct playing days, known minutes and duration coverage. Keep 3/7-day variables as short-term spikes.
3. **Nonlinear fatigue:** test predeclared hinge terms for excess load and short recovery (thresholds learned only inside training folds, or fixed before evaluation). Avoid arbitrary polynomial expansion.
4. **Age × load interaction:** test whether the same recent load has a different association with outcomes by age. Age is a moderator hypothesis, not a direct fatigue measurement. Fit ATP/WTA separately and inspect age bands only as descriptive slices.
5. **Surface interaction:** test only after the base feature groups have been evaluated; use surface-specific effects with shrinkage to the tour-wide estimate.

## Evaluation protocol
- Build exact pre-match histories using actual match dates from the source; exclude all same-day matches because match completion order is unknown.
- Keep ATP and WTA separate.
- Compare PFE baseline, current ACE, and one predeclared feature-group addition at a time on identical matches.
- Train chronologically, freeze coefficients, and score later dates. Use multiple rolling origins (not random splits).
- Report paired Brier and LogLoss differences with confidence intervals, calibration, coverage, and coefficient stability. Accuracy is secondary.
- Report duration coverage and match-history coverage by tour, year, and surface. Missing duration is not zero minutes.
- Do not select thresholds from the final holdout. Correct for multiple candidate comparisons or reserve a new untouched forward period.
- Only after predictive validation, evaluate Winamax odds with timestamped pre-match quotes, verified results, ROI, CLV, drawdown and sample size.

## Rejection criteria
Reject an addition if its gain disappears across rolling origins, relies on one tour/year/surface, has unstable coefficient signs, worsens calibration materially, or depends on incomplete duration/history records. No promotion based solely on in-sample fit or accuracy.

## Current priority
The first next ACE experiment is a paired ablation of current ACE versus current ACE + restDays, after an explicit completeness audit. If that passes, test 14/28-day accumulated load, then age × load. Do not combine all additions in one run.
