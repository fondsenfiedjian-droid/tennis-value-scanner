# Tier-aware Elo research

Research only. No production model, Worker, or release was changed.

## Data

Pinned archive snapshot: Aneeshers/tennis-sackmann-archive, commit 83733587353df8a41f2fd4f516147d5aa83f5a8d. Original Jeff Sackmann ATP/WTA data, CC BY-NC-SA 4.0 (attribution, non-commercial use, share-alike).

The workflow downloaded 262 CSV files transiently. No raw match rows or player-level derived data are committed or included in the report.

| Dataset | Source rows | Completed matches |
|---|---:|---:|
| ATP Futures | 523,355 | 501,940 |
| ATP Challenger qualifying | 240,471 | 232,006 |
| WTA ITF qualifying | 624,475 | 602,821 |

Combined processing: 1,749,872 source rows; 1,675,233 unique completed matches after deduplication; 350,162 main-tour and 1,325,071 lower-tier matches. 11,696 exact duplicate rows removed, zero conflicting duplicate groups, 19 invalid player-ID rows and 62,924 incomplete/retired/non-completed rows excluded.

## Method

- ATP and WTA processed separately; player ID namespaces are never mixed.
- Baseline: main-tour Elo only, main-tour K=32.
- Candidate: main-tour K remains 32; lower-tier matches update the shared player rating using tested lower-tier K.
- Lower-tier K grid: 4, 8, 12, 16, 20, 24, 28, 32.
- Main-tour evaluation: 2000-01-01 through 2026-05-25.
- Predictions use only ratings available before the prediction date; same-date updates are batched.
- Timing sensitivity: delay all match-result updates by 0, 7, or 14 days to account conservatively for event-week date granularity.

## Results

Lower Brier and LogLoss are better. Each candidate is compared with the baseline on the same main-tour matches.

| Lag | Tour | Matches | Baseline Brier | Candidate Brier | Lower K | Baseline LogLoss | Candidate LogLoss |
|---:|---|---:|---:|---:|---:|---:|---:|
| 0d | ATP | 76,349 | 0.211117 | 0.204838 | 28 | 0.609766 | 0.594766 |
| 7d | ATP | 76,349 | 0.211866 | 0.205662 | 28 | 0.611548 | 0.596705 |
| 14d | ATP | 76,349 | 0.212712 | 0.206714 | 24 | 0.613594 | 0.599195 |
| 0d | WTA | 70,306 | 0.210393 | 0.202119 | 32 | 0.607524 | 0.588350 |
| 7d | WTA | 70,306 | 0.211788 | 0.203418 | 32 | 0.610706 | 0.591443 |
| 14d | WTA | 70,306 | 0.212695 | 0.204607 | 32 | 0.612940 | 0.594382 |

Both Brier and LogLoss improved in all 27 annual evaluation slices (2000–2026), for every tested lower-tier K and all three timing lags. The improvement survives 7- and 14-day delays, although this cannot reconstruct exact match times.

## Interpretation and limitations

1. Lower-tier match history contains useful information for main-tour ratings.
2. ATP's best tested Brier range is lower K=24–28. WTA is still improving at the upper tested bound K=32, so its optimum is not yet located.
3. This is a probability-quality experiment, not a betting ROI study. No Winamax odds, value, staking, or actual wagers are included.
4. Separate weights for Futures, Challenger qualifying, and WTA ITF qualifying remain untested.
5. Ranking, age, serve/return, surface-specific Elo, and logistic recalibration are not included.
6. The source license is non-commercial CC BY-NC-SA 4.0. Commercial use requires separate rights.

## Next experiments

- Extend the lower-tier K grid, especially above 32 for WTA.
- Test separate lower-tier weights by source type.
- Sweep main-tour K with lower-tier history on independent periods.
- Add strictly pre-match ranking/age features and walk-forward calibration.
- Only then link historical market odds and evaluate EV. Do not change production settings based on this research alone.

## Reproducibility

Workflow: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45208391490

Aggregate-only report artifact: sackmann-tier-aware-elo-research (30-day retention).

Research branch: research/tier-aware-elo.
