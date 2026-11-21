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


## Latest ACE results — 2026-11-21

### Separate Elo workload experiment

The completed human-factor workflow trained on 2025 and evaluated on 2026. It reported improvement on 45,426 ATP and 31,568 WTA matches; a second 2026 temporal split (Jan–Jun train, Jul–Nov test) also improved both tours. This is evidence for workload signal, but the workflow baseline is Elo, not the live PFE combined probability.

Known-duration coverage is only 1.28% of prior-week ATP player-match records and 5.49% for WTA in the evaluation sample. Minutes must remain a low-coverage optional feature; the observed improvement is primarily supported by match counts, playing days and rest-day availability.

### Direct PFE-combined baseline experiment

A separate winner-formula-research.mjs run was added to test the same workload correction on the existing combined PFE probability (not Elo alone). Training was through 2025-12-31; evaluation was 2026-01-01 through 2026-11-21:

| Tour | Evaluation n | PFE Brier | PFE+ACE Brier | Paired Δ Brier (95% CI) | PFE LogLoss | PFE+ACE LogLoss | Paired Δ LogLoss (95% CI) | Accuracy change |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ATP | 45,426 | 0.225234 | 0.216337 | -0.008897 (-0.009616, -0.008178) | 0.640737 | 0.621131 | -0.019607 (-0.021180, -0.018033) | +2.90 pp |
| WTA | 31,568 | 0.219093 | 0.210927 | -0.008166 (-0.009058, -0.007274) | 0.627258 | 0.608342 | -0.018916 (-0.020952, -0.016881) | +2.04 pp |

Ten-bin ECE changed ATP 0.063435→0.014484 and WTA 0.058591→0.009872. These are strong exploratory results, not a production approval: the 2026 holdout has been inspected by related research, the correction is fitted on one training year, and the feature-availability definition needs a field-by-field audit. The model remains research-only.

### Next experiments

1. Run independent chronological PFE+ACE origins: train through 2024/test 2025, train through 2025/test 2026, and train Jan–Jun 2026/test Jul–Nov 2026. Compare on identical PFE predictions and report paired confidence intervals and calibration.
2. Audit per-feature availability, especially whether both players have prior histories for restDays, rather than relying on the broad workload-available flag.
3. Only if stable, test one feature group at a time: nonlinear short-recovery / excess-load hinges, then 14/28-day accumulated load, then age×load.
4. Keep duration features optional until source coverage improves. No production promotion until independent origins and Winamax odds validation pass.
