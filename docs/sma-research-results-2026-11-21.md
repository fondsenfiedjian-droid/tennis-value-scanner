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

For the 730-day / shrinkage-5 run, 21,372 ATP and 19,745 WTA matches had enough input to generate point-engine output across the evaluation history. A further 2,838 ATP and 2,571 WTA matches were marked for review because serve and opponent-return evidence disagreed; 3,939 ATP and 4,048 WTA matches lacked sufficient input history or required fields. The 8-percentage-point consistency threshold is a conservative exclusion rule, not proof that the retained rates are unbiased.

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

## Latest frozen-holdout robustness run (2026-11-21, workflow 44899493914)

The completed full-archive run re-evaluated the PFE point-delta stack across 84-, 365- and 730-day SMA histories. For 730 days it tested surface-shrinkage priors 3, 5 and 10. Each specification was trained on eligible 2016–2024 rows, coefficients were frozen, and evaluation used 2025 through the available 2026 archive. Rolling player histories remain strictly pre-match; all matches on a date are scored before that date's statistics are added. The 2026 source is partial through 2026-05-25.

### 730-day stability: core SMA residual + PFE point-delta

Negative deltas mean lower error than the same-sample Elo baseline. Confidence intervals are paired comparisons against Elo, not direct intervals between the two candidate stacks.

| Tour / shrinkage prior | Holdout n | Δ Brier (95% CI vs Elo) | Δ LogLoss (95% CI vs Elo) | Accuracy: Elo → stack |
|---|---:|---:|---:|---:|
| ATP / 3 | 2,731 | -0.003375 (-0.005224, -0.001526) | -0.009249 (-0.013841, -0.004656) | 64.30% → 64.56% |
| ATP / 5 | 2,740 | -0.003414 (-0.005274, -0.001554) | -0.009282 (-0.013894, -0.004669) | 64.27% → 64.64% |
| ATP / 10 | 2,748 | -0.003530 (-0.005395, -0.001665) | -0.009528 (-0.014134, -0.004922) | 64.30% → 64.77% |
| WTA / 3 | 2,499 | -0.002163 (-0.003475, -0.000850) | -0.005689 (-0.009166, -0.002212) | 65.55% → 65.11% |
| WTA / 5 | 2,509 | -0.002115 (-0.003438, -0.000793) | -0.005685 (-0.009186, -0.002184) | 65.72% → 65.48% |
| WTA / 10 | 2,523 | -0.002163 (-0.003472, -0.000853) | -0.005759 (-0.009242, -0.002277) | 65.64% → 65.48% |

The point-delta-only candidate also improved Brier and LogLoss over Elo in all six 730-day/shrinkage combinations. Adding core SMA residual features gave a further favorable point estimate in every combination; the incremental difference versus point-delta-only has not yet been given its own paired confidence interval, so this is not proof of statistically significant synergy. Accuracy improved slightly on ATP but declined on WTA, illustrating why accuracy alone is not the selection criterion.

The 84-day configuration did not provide a reliable signal: point-delta-only and core-plus-point-delta were approximately neutral or slightly worse on Brier, with wide intervals for both tours. The 365-day results were directionally positive but generally weaker than 730 days, particularly for WTA. The 730-day window is therefore the only current configuration worth carrying into the next validation stage.

### Interpretation and decision

- The 730-day stack's direction is robust to surface-shrinkage prior strengths 3, 5 and 10 for both tours.
- This is a frozen-coefficient temporal holdout, but **not a blind independent holdout**: 2025–partial 2026 results and many candidate specifications were already inspected in prior iterations. No multiple-comparison correction was applied.
- Candidate comparisons share overlapping matches. Reported confidence intervals compare each specification with Elo, not directly with another candidate.
- The archive ends on 2026-05-25, so it does not cover the full current season.
- These are probability metrics, not Winamax ROI, closing-line value or profitability.

**Decision:** retain SMA core + PFE point-delta as the leading research candidate, using a 730-day history. Do not merge into the production PFE registry or use for betting yet. The next gate is a strict historical Winamax price evaluation with genuinely pre-match model probabilities, quote timestamps, verified outcomes and sufficient closing-price coverage. If no representative historical Winamax archive exists, collect timestamped snapshots prospectively rather than substituting Pinnacle prices or current Apify data for historical Winamax prices.

