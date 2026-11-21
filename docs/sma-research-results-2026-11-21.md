# SMA research results — 2026-11-21

## Scope

Research-only walk-forward tests on the Jeff Sackmann / Tennis Abstract archive mirror (ATP and WTA match data, 1991–2026). Model training begins in 2016. The fixed holdout is 2025 through the available partial 2026 archive. The mirror's 2026 rows end on 2026-05-25.

The tested baseline is the repository's chronological K=32 Elo. Each candidate is a regularized logistic correction to Elo. No live PFE model, Worker endpoint, UI, or betting decision is changed.

## Main findings

### Rolling-window sensitivity

The 730-day history was the most consistent window. The 365-day and 84-day results were weaker or less stable, especially for WTA.

| Window | ATP profile results | WTA profile results |
|---|---|---|
| 84 days | Some LogLoss improvement, but Brier intervals often crossed zero | Mostly neutral or unstable |
| 365 days | Modest improvements; extended-profile confidence intervals crossed zero | Little clear improvement |
| 730 days | Strongest and most consistent improvements | Strongest and most consistent improvements |

### Same-sample comparison: 730 days, shrinkage prior 3

Both models below are fitted and evaluated on the same eligible matches. Negative deltas mean lower error than Elo.

| Tour / model | Holdout n | Δ Brier (95% paired CI) | Δ LogLoss (95% paired CI) | Accuracy: Elo → model | ECE: Elo → model |
|---|---:|---:|---:|---:|---:|
| ATP core serve/return + surface residual | 3,036 | -0.001376 (-0.002508, -0.000244) | -0.004002 (-0.006677, -0.001327) | 64.36% → 64.23% | 0.049735 → 0.046437 |
| ATP core + extended profile | 3,036 | -0.001147 (-0.002042, -0.000251) | -0.003621 (-0.005833, -0.001409) | 64.36% → 64.16% | 0.049735 → 0.044982 |
| WTA core serve/return + surface residual | 2,785 | -0.001306 (-0.002167, -0.000446) | -0.003685 (-0.005792, -0.001578) | 65.53% → 64.96% | 0.036763 → 0.034138 |
| WTA core + extended profile | 2,785 | -0.000734 (-0.001420, -0.000049) | -0.002387 (-0.004105, -0.000669) | 65.53% → 64.92% | 0.036763 → 0.035479 |

The extended profile candidate improves both error metrics over Elo, but does **not** outperform the simpler core surface-residual model on the same matches. It also lowers winner accuracy slightly. The extra fields therefore have not yet demonstrated incremental predictive value beyond the simpler features.

### Feature-level observations

- Serve-profile features are more useful than return-only features in the tested 730-day window.
- Return-only specifications are mostly neutral or weaker.
- Surface residuals (same-surface rate minus overall rate) are consistently useful in the longer window.
- Surface-specific extended profiles shrunk toward overall rates can improve Brier/LogLoss over Elo, but their incremental value beyond the core residual model is not established.
- Shrinkage prior 3 performed somewhat better than 5 or 10 in the explored holdout; this is not a license to tune further on the same holdout.

## PFE point-engine bridge

A preliminary bridge that averaged overall serve rate with one minus opponent return rate performed worse than Elo:
- ATP: Δ Brier +0.003013 on 3,200 matches.
- WTA: Δ Brier +0.008932 on 3,046 matches; LogLoss also worsened materially.

That crude bridge is rejected. It is superseded by a stricter implementation using first-serve-in, first-serve points won, second-serve points won, and opponent first/second-serve return rates. It delegates the consistency check to PFE's existing `deriveServeReturnMatchInputs()` and converts point inputs through `calculateMatchWinProbability()`. Results for that split-profile bridge are pending a separate full run.

### Split first/second-serve PFE bridge — standalone result

The stricter bridge used first-serve-in, first-serve points won, second-serve points won, opponent first/second-serve return rates, PFE's 8-point disagreement check, and the exact PFE match engine with source `best_of`. It was still worse than Elo as a standalone probability source.

| Window / tour | Holdout n | Δ Brier (95% paired CI) | Δ LogLoss (95% paired CI) | Accuracy: Elo → PFE | ECE: Elo → PFE |
|---|---:|---:|---:|---:|---:|
| 730d ATP | 3,142 | +0.003210 (-0.001535, +0.007954) | +0.006119 (-0.005124, +0.017363) | 64.35% → 64.00% | 0.049751 → 0.038984 |
| 730d WTA | 2,926 | +0.011864 (+0.006840, +0.016889) | +0.025996 (+0.013960, +0.038032) | 65.07% → 62.78% | 0.037577 → 0.031713 |

The WTA deterioration is statistically clear in this holdout; ATP is directionally worse but its paired intervals cross zero. ECE improved, but Brier, LogLoss and winner accuracy did not. This is not enough to trust the point engine as a standalone forecast. It remains a research input only; the next test is whether a walk-forward-trained logit stack can learn a conservative weight for the PFE point-model delta alongside Elo and core SMA features.

## Limitations and decision

1. This is probability-quality research, not a betting ROI, CLV, or profitability test.
2. The 2025–partial 2026 holdout has already been inspected across many specifications and windows. No multiplicity correction was applied. Treat all reported gains as exploratory.
3. The 2026 source archive is partial through 2026-05-25; it does not test the full current season.
4. The model is not yet fully opponent-strength adjusted. Current rates use prior player histories, opponent-return cross-checks, surface residuals, and sample shrinkage.
5. No production PFE integration is authorized. PFE remains the live baseline; SMA and ACE stay research/shadow only.
6. The archive source is CC BY-NC-SA 4.0. Commercial use requires separate permission.

**Decision:** retain the 730-day SMA candidate for further research, but do not deploy or use it to place bets. The next gate is the split first/second-serve PFE bridge, followed by a future untouched holdout and an explicit test for incremental value over the core surface-residual model.
