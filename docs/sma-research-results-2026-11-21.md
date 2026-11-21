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

## PFE point-engine bridge and correction feature

The first split-profile evaluation is complete (GitHub Actions research run 44898985313, commit `1039943112ff6e6927278a1e724359b2fc643ce3`). It uses first-serve-in, first-serve points won, second-serve points won, and opponent first/second-serve return rates; delegates the consistency check to PFE's `deriveServeReturnMatchInputs()`; and converts accepted point inputs through PFE's `calculateMatchWinProbability()`. It is still research-only.

### Raw PFE point-to-match probabilities: rejected

On the full eligible holdout, the uncorrected point-engine output was worse than Elo:

| Tour | n | Δ Brier (95% paired CI) | Δ LogLoss (95% paired CI) | Accuracy: Elo → point model |
|---|---:|---:|---:|---:|
| ATP | 3,142 | +0.003210 (-0.001535, +0.007954) | +0.006119 (-0.005124, +0.017363) | 64.35% → 64.00% |
| WTA | 2,926 | +0.011864 (+0.006840, +0.016889) | +0.025996 (+0.013960, +0.038032) | 65.07% → 62.78% |

WTA's deterioration is statistically clear under the paired intervals. The raw PFE point probability must not be substituted for Elo or used directly in betting.

### PFE point delta as a feature: promising, not approved

A more useful design is to treat the difference between PFE's point-engine logit and Elo's logit as a *feature*, then fit a regularized correction on earlier seasons only. This learns how much of the point-engine signal is reliable without blindly replacing the base model. On the identical 730-day / shrinkage-5 common sample:

| Tour / specification | n | Δ Brier (95% paired CI vs Elo) | Δ LogLoss (95% paired CI vs Elo) | Accuracy: Elo → corrected |
|---|---:|---:|---:|---:|
| ATP point-delta only | 2,740 | -0.003217 (-0.004855, -0.001579) | -0.008840 (-0.013101, -0.004579) | 64.27% → 64.60% |
| ATP core residual + point delta | 2,740 | -0.003414 (-0.005274, -0.001554) | -0.009282 (-0.013894, -0.004669) | 64.27% → 64.64% |
| ATP core + extended + point delta | 2,740 | -0.003503 (-0.005469, -0.001536) | -0.009609 (-0.014434, -0.004785) | 64.27% → 64.64% |
| WTA point-delta only | 2,509 | -0.001537 (-0.002701, -0.000373) | -0.004369 (-0.007540, -0.001198) | 65.72% → 65.56% |
| WTA core residual + point delta | 2,509 | -0.002115 (-0.003438, -0.000793) | -0.005685 (-0.009186, -0.002184) | 65.72% → 65.48% |
| WTA core + extended + point delta | 2,509 | -0.002009 (-0.003375, -0.000644) | -0.005460 (-0.009051, -0.001869) | 65.72% → 64.93% |

Negative deltas mean lower error than Elo. The paired intervals here compare each specification with Elo on the same common sample; they are **not** direct confidence intervals for differences between the specifications. The point-delta feature improves Brier and LogLoss in both tours on this 730-day sample. Accuracy is mixed, especially WTA. The large extended feature block does not consistently improve on the simpler core-residual-plus-point-delta specification.

The 730-day result is directionally stable across shrinkage strengths 3, 5 and 10. The 365-day window is weaker for WTA; the 84-day window is not reliable for either tour. This makes a long, rolling history the only current candidate worth carrying forward.

### Coverage and interpretation

For the 730-day / shrinkage-5 run, 19,722 ATP and 20,? WTA matches had enough input to generate point-engine output across the evaluation history; 3,156 ATP and a similar-sized WTA subset were marked for review due to serve/return disagreement. (Exact full-period counts are included in the machine report; holdout counts are shown above.) The 8-percentage-point consistency threshold is a conservative exclusion rule, not proof that the retained rates are unbiased.

**Decision:** reject raw point-engine match probabilities. Keep the PFE point-logit delta as a research feature for a separately trained correction layer, with ATP and WTA calibrated separately. Do not promote it into PFE's live model registry until a new, untouched forward period confirms the gains and betting-market tests show incremental value.

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
