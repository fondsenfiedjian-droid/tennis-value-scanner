# SMA results audit — 2026-11-22

Status: research evidence retrieved and reviewed; not production-approved.
Research branch: `research/sma-stat-integrity-audit`
Source commit: `4e3a719244e6b54988a5a725a4d6fcc47a476f6b`
Workflow run: [44918617777](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/44918617777)
Artifact: `sackmann-serve-return-walkforward` (ID `14712687719`, SHA-256 `115a7f68b33ac0b99c23e5417b71d0e0388f6d4824c473dc0f79463f0e120e73`)
Report inspected from the existing artifact; the model was not rerun for this audit.

## 1. Experiment design

- Source: Jeff Sackmann / Tennis Abstract ATP and WTA match archives, mirrored by `Aneeshers/tennis-sackmann-archive`.
- Archive coverage: ATP 112,768 rows; WTA 97,614 rows in the inspected 730-day report.
- Prediction features available for 28,149 ATP and 26,364 WTA matches.
- Baseline: offline chronological K=32 Elo from the repository backtest engine. This is **not** the live Cloudflare Worker PFE.
- Training: 2016–2024.
- Fixed holdout: 2025–2026, coefficients fitted before 2025 and frozen. The 2026 source is partial through 2026-05-25.
- Annual walk-forward: 2020–2026, expanding training window; all same-day results are excluded from pre-match feature history.
- Main candidate: 730-day rolling serve/return history; surface-relative residual features, with and without overall serve/return differences.
- Minimum history: 5 prior statistics-complete matches overall and 5 same-surface matches per player.
- Lower Brier and LogLoss are better. Accuracy is secondary.

## 2. Main fixed-holdout result

Candidate: `overall_plus_surface_residual` — overall serve/return differences plus surface-relative residual serve/return differences.

| Tour | Holdout n | Brier: Elo → SMA | Δ Brier (95% CI) | LogLoss: Elo → SMA | Δ LogLoss (95% CI) |
|---|---:|---:|---:|---:|---:|
| ATP | 3,071 | 0.219811 → 0.218452 | -0.001360 [-0.002473, -0.000246] | 0.630047 → 0.626105 | -0.003942 [-0.006566, -0.001318] |
| WTA | 2,807 | 0.216826 → 0.215628 | -0.001198 [-0.002037, -0.000359] | 0.624202 → 0.620797 | -0.003405 [-0.005447, -0.001362] |

Both tours show a statistically clear reduction in Brier and LogLoss on the fixed holdout: both 95% paired-difference intervals remain below zero.

Accuracy did **not** improve in this combined candidate (ATP 64.28% → 64.12%; WTA 65.51% → 64.87%). This is not a contradiction: the model improves probability quality without necessarily changing the most-likely winner. It reinforces why accuracy cannot be the primary acceptance metric.

## 3. Annual walk-forward result

The same candidate was evaluated on the expanding annual walk-forward sample:

| Tour | Matches | Brier: Elo → SMA | Δ Brier (95% CI) | LogLoss: Elo → SMA | Δ LogLoss (95% CI) |
|---|---:|---:|---:|---:|---:|
| ATP | 12,411 | 0.220762 → 0.219435 | -0.001327 [-0.001872, -0.000783] | 0.631745 → 0.628076 | -0.003670 [-0.004952, -0.002387] |
| WTA | 10,926 | 0.217990 → 0.217355 | -0.000635 [-0.000859, -0.000184] | 0.625443 → 0.623509 | -0.001934 [-0.003044, -0.000824] |

The annual walk-forward direction agrees with the fixed holdout for both tours and both probability-quality metrics.

## 4. Ablation and window observations

- `surface_residual_only` also improves both tours. On the 730-day fixed holdout, ATP ΔBrier = -0.001284 and WTA ΔBrier = -0.000937; the paired 95% intervals are below zero. LogLoss also improves for both.
- Adding the overall serve/return differences to the surface residual features improves the fixed-holdout point estimates further on both tours.
- The 730-day residual results repeat across the three configured surface-shrinkage values (3, 5, 10); the residual feature itself is not controlled by that shrinkage parameter. This is a specification check, not three independent datasets.
- The 365-day window is weaker and less uniform. The 84-day window does not show a stable improvement across both tours and both evaluation methods.
- The 730-day candidate is therefore the leading SMA research candidate from this batch, not a proven universal optimum.

## 5. Interpretation and restrictions

1. This is evidence that historical serve/return and surface-relative features can add probability-quality information to the **offline K=32 Elo** baseline.
2. It does not prove improvement over live production PFE, because the live Worker baseline is a different model and must be evaluated separately.
3. It does not establish betting ROI, expected value, closing-line value, or monthly income. No Winamax odds or execution assumptions are included.
4. The eligible samples are selected by availability of complete historical statistics. Coverage and missingness can change the population being evaluated; results must not be generalized to every ATP/WTA match.
5. The source and derived report are marked CC BY-NC-SA 4.0 and non-commercial. Commercial use requires separate permission/licensing.
6. No SMA coefficient is authorized for Aggregator or Production by this report.

## 6. Decision

**SMA advances to the next research gate, not to Production.**

Next tests:
- compare the selected SMA candidate against frozen live-PFE and offline-PFE controls on exactly identical match IDs;
- stratify by surface and tournament level with minimum sample thresholds;
- audit calibration changes and source coverage per stratum;
- test feature stability across more recent, non-overlapping holdout periods;
- preserve this report and source artifact provenance in the research ledger.

