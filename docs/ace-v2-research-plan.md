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


### Additional chronological PFE holdouts — 2026-11-21

The follow-up workflow also completed two additional PFE-combined ACE evaluations:

| Tour / holdout | n | Δ Brier (95% paired CI) | Δ LogLoss (95% paired CI) | Accuracy change |
|---|---:|---:|---:|---:|
| ATP 2025 (train through 2024) | 28,067 | -0.004738 (-0.005686, -0.003790) | -0.010438 (-0.012500, -0.008376) | +1.24 pp |
| WTA 2025 (train through 2024) | 22,142 | -0.005755 (-0.006804, -0.004706) | -0.013500 (-0.015809, -0.011191) | +1.68 pp |
| ATP Jul–Nov 2026 (train Jan–Jun 2026) | 24,845 | -0.009702 (-0.010700, -0.008704) | -0.021406 (-0.023599, -0.019213) | +2.53 pp |
| WTA Jul–Nov 2026 (train Jan–Jun 2026) | 16,454 | -0.009165 (-0.010388, -0.007942) | -0.021125 (-0.023909, -0.018341) | +2.18 pp |

These repeated chronological evaluations strengthen the case that workload features add predictive information to PFE. They are still exploratory: Valuebetennis data and overlapping research windows are not a substitute for a future untouched live-forward sample or historical Winamax odds/CLV test. A new feature-availability audit is being added to report separately (a) any prior history, (b) both players having prior history for restDays, and (c) actual known-duration coverage.


### Corrective audit — rest-day availability

A code review found that the first PFE-combined ACE feature row incorrectly gated restDays and restDaysAvailable on the presence of a match in the previous seven days. Rest days should instead be available whenever both players have any prior match history; only 3/7-day load and duration features should depend on recent-history records. The feature gating was corrected on 2026-11-21. All PFE+ACE figures above from the pre-correction implementation are provisional and superseded pending a full rerun. The updated report separately counts recent-week workload availability, both-player rest-history availability, and observed-duration coverage.


## Corrected PFE+ACE results after rest-day availability fix — 2026-11-21

The corrected feature gating has now completed all three chronological tests. The candidate used below is **core ACE**: PFE combined logit plus 3/7-day match counts, 7-day playing days, rest-day difference, restDaysAvailable and recent-workload availability. Minutes and duration-coverage features are excluded from core ACE.

| Tour / holdout | n | PFE Brier | Core ACE Brier | Δ Brier (95% paired CI) | Δ LogLoss (95% paired CI) | Core ACE vs calibration-only Δ Brier (95% CI) |
|---|---:|---:|---:|---:|---:|---:|
| ATP 2025 (train through 2024) | 28,067 | 0.225298 | 0.219866 | -0.005432 (-0.006369, -0.004495) | -0.011892 (-0.013933, -0.009851) | -0.003627 (-0.004349, -0.002905) |
| WTA 2025 (train through 2024) | 22,142 | 0.220108 | 0.213496 | -0.006613 (-0.007639, -0.005586) | -0.015318 (-0.017581, -0.013055) | -0.004068 (-0.004946, -0.003190) |
| ATP 2026 (train through 2025) | 45,426 | 0.225234 | 0.215645 | -0.009589 (-0.010330, -0.008848) | -0.020998 (-0.022616, -0.019379) | -0.005559 (-0.006135, -0.004983) |
| WTA 2026 (train through 2025) | 31,568 | 0.219093 | 0.210294 | -0.008799 (-0.009711, -0.007887) | -0.020213 (-0.022288, -0.018137) | -0.004782 (-0.005533, -0.004031) |
| ATP Jul–Nov 2026 (train Jan–Jun) | 24,845 | 0.223173 | 0.212825 | -0.010347 (-0.011376, -0.009318) | -0.022678 (-0.024935, -0.020422) | -0.005613 (-0.006449, -0.004777) |
| WTA Jul–Nov 2026 (train Jan–Jun) | 16,454 | 0.217516 | 0.207724 | -0.009791 (-0.011046, -0.008537) | -0.022400 (-0.025248, -0.019552) | -0.005096 (-0.006120, -0.004072) |

All paired intervals above exclude zero. Crucially, the workload correction also beats a **calibration-only** logistic correction using only PFE logit on the same matches. This establishes incremental workload signal beyond simple probability recalibration in these chronological samples. It is not proof of profitability or an untouched prospective result.

### Feature availability and ablation

- Both players have prior history for rest-day calculation on 93.99–96.60% of the 2026/2025 evaluation matches; 78.76–83.91% have at least one prior match in the previous seven days.
- Known-duration coverage of prior-week player-match records ranges only 0.03–7.32% across these evaluation samples.
- Full ACE with minutes and duration-coverage features is statistically indistinguishable from core ACE on all three holdouts. Remove these duration features from the ACE v1 candidate; do not impute missing minutes.
- ECE also improves materially, but calibration must continue to be assessed by probability band and on future data.

**Decision:** core ACE is the strongest current research candidate to pair with PFE. Keep it in shadow/research only. Next, audit coefficient stability and run feature-group ablations (3/7-day load vs rest-days) before adding 14/28-day windows or age×load. Historical Winamax odds/CLV and future prospective predictions remain mandatory before production promotion.


### ACE component ablation — 2026-11-21

The corrected PFE experiment compared a calibration-only model, a short-term load-only model, a rest-only model, and the combined core ACE model on identical matches. Both feature groups add value beyond recalibration, and their combination beats either group alone on every chronological holdout:

| Tour / holdout | Load-only vs calibration ΔBrier (95% CI) | Rest-only vs calibration ΔBrier (95% CI) | Combined ACE vs load-only ΔBrier (95% CI) | Combined ACE vs rest-only ΔBrier (95% CI) |
|---|---:|---:|---:|---:|
| ATP 2025 | -0.002334 (-0.003018, -0.001650) | -0.001133 (-0.001333, -0.000933) | -0.001293 (-0.001536, -0.001049) | -0.002494 (-0.003182, -0.001806) |
| WTA 2025 | -0.002740 (-0.003577, -0.001903) | -0.001052 (-0.001317, -0.000787) | -0.001328 (-0.001638, -0.001017) | -0.003016 (-0.003846, -0.002186) |
| ATP 2026 full | -0.003922 (-0.004431, -0.003413) | -0.001926 (-0.002189, -0.001663) | -0.001637 (-0.001906, -0.001368) | -0.003633 (-0.004148, -0.003118) |
| WTA 2026 full | -0.003378 (-0.004062, -0.002694) | -0.001672 (-0.001974, -0.001370) | -0.001404 (-0.001719, -0.001089) | -0.003110 (-0.003800, -0.002419) |
| ATP Jul–Nov 2026 | -0.003918 (-0.004660, -0.003177) | -0.001921 (-0.002293, -0.001548) | -0.001694 (-0.002064, -0.001325) | -0.003692 (-0.004443, -0.002941) |
| WTA Jul–Nov 2026 | -0.003769 (-0.004690, -0.002847) | -0.001606 (-0.002046, -0.001166) | -0.001328 (-0.001766, -0.000890) | -0.003490 (-0.004418, -0.002563) |

All intervals exclude zero. Load features carry the larger standalone contribution; rest-day information adds a smaller but consistent improvement. The combined model is consistently stronger than either alone. Minutes/duration features remain neutral beyond core ACE.

Next experiment: add 14/28-day match counts and distinct playing days, keeping the existing 3/7-day and rest-day core fixed. Test the longer windows as a separate feature group before considering nonlinear thresholds or age×load.


### 14/28-day workload extension — implementation pending validation

The pre-match workload builder now calculates 14- and 28-calendar-day match counts and distinct playing days, with separate availability flags. Same-day matches remain excluded; the 3/7-day and rest-day core remains unchanged. Regression fixtures cover inclusive date boundaries. The PFE workflow now compares an extended 14/28-day load-only model and an extended ACE model against the fixed core ACE on the same chronological holdouts. Results are pending CI; no production path changes.


### Non-overlapping workload bands — pending validation

The raw cumulative 14/28-day extension produced modest additional gains but unstable coefficients, likely due overlapping windows. The workload builder now derives non-overlapping bands: 1–3, 4–7, 8–14 and 15–28 calendar days, for both match counts and distinct playing days. The PFE research runner compares banded load-only and banded ACE against core ACE and the cumulative-window model on the same chronological holdouts. Inclusive boundaries, same-day exclusion and band derivation have regression fixtures. Results pending CI.


### 14/28-day and non-overlapping band results — 2026-11-21

The extended ACE comparisons completed on the same three chronological holdouts. The 14/28-day extension improved ATP Brier over core ACE by 0.000578 (2025), 0.000683 (full 2026) and 0.000594 (Jul–Nov 2026); paired 95% CIs excluded zero in all three. WTA was inconsistent: 2025 showed no improvement, full 2026 showed a small improvement (-0.000365), and Jul–Nov 2026 did not exclude zero. The non-overlapping band model and cumulative 14/28 model were effectively indistinguishable; banding did not materially improve performance. ATP coefficients for 14/28 load features were not stable enough to justify production adoption. **Decision:** keep 3/7-day load + rest-day core ACE as the shared candidate; retain 14/28-day extension as ATP-only research, and do not add it to WTA yet. Next ACE work should focus on age×load and nonlinear thresholds only after age mapping quality is measured; avoid further tuning the overlapping-window variants.
