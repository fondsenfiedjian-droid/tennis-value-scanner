# Sackmann serve/return walk-forward research

## Scope and method

Research-only ATP/WTA analysis using the Jeff Sackmann / Tennis Abstract match archives through 2026-05-25. Source data are CC BY-NC-SA 4.0: attribution, non-commercial use and share-alike apply. Raw CSVs and player-level records remain ephemeral; this note stores aggregate results only.

For each player, the pipeline aggregates service points won / service points played and return points won / return points faced over the prior 365 days. It creates overall and same-surface rates, requiring at least five prior statistics-complete matches for each player. Same-day results are excluded from all pre-match histories. The evaluation uses expanding chronological walk-forward models: training from 2016 onward, out-of-sample evaluation 2020–2026, with a frozen K=32 Elo probability as the offset in a regularized logistic correction. The 2026 archive is partial through May 25.

The stricter source-row validation requires:
- service points > 0;
- first serves in between 0 and service points;
- first-serve points won between 0 and first serves in;
- second-serve points won no greater than second-serve opportunities (service points minus first serves in).

## Source data-quality results

Successful run: GitHub Actions run 44866366600.

| Tour | Source match rows | Winner-side valid | Winner-side invalid | Loser-side valid | Loser-side invalid |
|---|---:|---:|---:|---:|---:|
| ATP | 112,768 | 101,899 | 10,869 | 101,876 | 10,892 |
| WTA | 97,614 | 47,748 | 49,866 | 47,748 | 49,866 |

Most invalid records have missing or non-integer serve fields:
- ATP: 10,842 missing/non-integer on each side; 26/50 non-positive service-point records; one winner-side row exceeded its second-serve opportunities.
- WTA: 49,786 winner-side and 49,787 loser-side missing/non-integer records; 79/78 non-positive service-point records; one first-serve-won count exceeded first serves in on each side.
- The new second-serve opportunity guard therefore catches one additional ATP winner-side source row in this archive. The guard is still retained because it enforces a necessary denominator invariant; it is not evidence that the source has a widespread second-serve counting problem.

Feature coverage:
- ATP: 28,149 prediction records had feature records; 22,878 were eligible for overall-rate specifications and 18,077 for same-surface specifications.
- WTA: 26,364 had feature records; 20,745 were eligible for overall-rate specifications and 15,491 for same-surface specifications.

## Main out-of-sample result

The seven specifications tested overall serve, overall return, their combination, surface serve, surface return, their combination, and all four overall-plus-surface features.

Only the combined overall-plus-surface specification showed an aggregate improvement in both Brier score and LogLoss for both tours. Individual and simpler specifications were mostly neutral or worse.

| Tour | Eligible matches | Elo baseline Brier | Adjusted Brier | Δ Brier (95% CI) | Elo baseline LogLoss | Adjusted LogLoss | Δ LogLoss (95% CI) |
|---|---:|---:|---:|---:|---:|---:|---:|
| ATP | 18,077 | 0.219690 | 0.219585 | -0.000105 (-0.000315, +0.000106) | 0.628924 | 0.628368 | -0.000556 (-0.001089, -0.000023) |
| WTA | 15,491 | 0.216927 | 0.216732 | -0.000196 (-0.000524, +0.000133) | 0.622782 | 0.622094 | -0.000688 (-0.001461, +0.000085) |

Interpretation:
- ATP aggregate LogLoss improvement has a 95% paired CI just below zero; aggregate Brier CI includes zero.
- WTA aggregate Brier and LogLoss CIs both include zero.
- The year-by-year pattern is mixed. For both tours, 2024 is the only evaluation year where the combined specification's paired Brier and LogLoss intervals exclude zero in the improving direction. Other years include regressions or inconclusive intervals.
- Seven specifications were compared and no multiple-comparison correction was applied. Selecting the best aggregate specification after looking at all seven creates selection bias.

## Decision

**Research candidate only; not production-approved.** The aggregate gain is small, not consistent enough across years, and not robustly significant for both tours. Do not activate serve/return features in PFE yet.

## Next tests

1. Sensitivity to rolling windows: 180, 365 and 730 days.
2. Minimum prior history: 3, 5 and 10 statistics-complete matches.
3. Surface shrinkage: blend same-surface estimates toward overall rates according to prior sample size, rather than using an unshrunk surface rate as a separate correlated feature.
4. Test residualized surface effects (same-surface rate minus overall rate) against the current four-feature specification.
5. Freeze a recent holdout and rerun ATP/WTA separately; require stable improvements in both Brier and LogLoss before shadow testing.

No production feature, live probability, EV or recommendation was changed by this research.

## Sensitivity grid implementation

A reproducible CI sensitivity mode now tests:
- Rolling windows of 180, 365 and 730 days.
- Minimum prior history of 3, 5 and 10 statistics-complete matches for both overall and same-surface rates.
- Surface shrinkage toward each player's overall rate with prior weights of 10 and 20 matches.
- Residualized surface effects (same-surface rate minus overall rate), shrunk with prior weights of 10 and 20 matches.

The grid keeps ATP and WTA separate and uses the same chronological K=32 Elo correction and same-day exclusion. It is a robustness analysis on the existing 2020–2026 walk-forward period, not a fresh untouched holdout; feature selection across this grid must not be presented as independent confirmation. The next independent test requires a frozen specification and later unseen match data. Results pending CI.
