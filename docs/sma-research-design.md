# SMA — Serve & Matchup Analysis

## Status
Research-only design. SMA is developed in parallel with PFE and ACE. It must not alter production probabilities or betting decisions until it passes the same leakage-free validation gates.

## Role in the model system
- **PFE** remains the baseline probability engine and owns match/set/game probability calculations.
- **ACE** models pre-match workload and recovery effects.
- **SMA** estimates how each player's serve profile is likely to perform against the opponent's return profile, including surface and sample-size context.

SMA is not a second vote that is averaged blindly with PFE. Its primary output is a pair of opponent-adjusted expected service-point probabilities (A serving vs B returning; B serving vs A returning). These can be passed to PFE's existing point-to-game/set/match probability functions, or used as a separately evaluated correction to PFE. The two approaches must be compared out of sample.

## Initial feature groups

### Serve profile (per player)
- service points won / service points played;
- first-serve-in rate;
- first-serve points won rate;
- second-serve points won rate;
- ace rate and double-fault rate;
- break points saved rate, with denominator and sample count.

### Return profile (per player)
- return points won / return points played, derived from the opponent's service-point columns in the same historical match;
- first-serve return points won and second-serve return points won, only where the source schema supports them reliably;
- break-point conversion rate, with denominator and sample count.

### Context and matchup
- tour (ATP/WTA), surface, indoor/outdoor where reliable;
- rolling windows (84, 365 and 730 days in the current research grid) plus surface-specific history;
- opponent-adjusted serve and return residuals to account for schedule strength;
- shrinkage toward tour/surface averages when samples are small;
- sample counts, coverage and uncertainty for every estimate.

All player features must be computed strictly from matches completed before the target match. Same-day matches are excluded unless trustworthy completion timestamps establish ordering. Retirements, walkovers, missing denominators and malformed stats are explicitly excluded or flagged.

## Implemented archival profile features (research branch)
The current archival builder derives the following pre-match rates from prior match rows, preserving each numerator and denominator before aggregation:
- first-serve-in, first-serve points won, and second-serve points won;
- ace and double-fault rates per service point;
- break points saved / faced;
- first-serve and second-serve return points won / opportunities;
- break-point conversion, derived as the opponent's break points faced minus break points saved;
- surface-specific versions of each profile metric, plus feature-specific shrinkage toward each player's overall rate based on that metric's own sample count.

Each feature has its own valid-observation count, reported separately for overall and surface-specific histories. Missing or invalid optional counters suppress only that feature; they do not discard otherwise valid core service-point history. Same-day matches remain excluded. The research evaluator now compares serve-profile-only, return-profile-only, combined extended-profile, and core-plus-extended specifications against the same chronological Elo baseline. Reports include Brier score, log loss, accuracy, ten-bin reliability tables and expected calibration error, plus paired confidence intervals for Brier and log-loss differences.

**Important limitation:** these are rolling player-level rates, not yet opponent-adjusted serve-vs-return matchup estimates. Opponent-strength residualization, tour/surface priors for each submetric, and direct PFE point-probability integration remain separate research tasks. Do not describe this branch as a finished matchup model or enable it in production.

## PFE point-engine bridge (research-only)
The archival evaluator now has a separate diagnostic path that:
1. estimates each player's pre-match service-point win rate from their own prior service history;
2. cross-checks it against one minus the opponent's prior return-points-won rate;
3. averages the two only when their disagreement is at most 8 percentage points;
4. uses feature-specific surface rates shrunk toward each player's overall rates when surface history is sufficient, then passes the two service-point probabilities and the source `best_of` value to PFE's existing `calculateMatchWinProbability()` function.

This is a deliberately conservative bridge test, not a validated opponent-adjusted estimator. It does not change PFE's live model registry, Worker endpoints, or betting recommendations. A missing format, insufficient prior history, or disagreement above the threshold excludes the point-model prediction rather than inventing an input. The report also compares the existing core surface-residual model and the detailed extended-profile model on an identical common sample to avoid confusing model changes with coverage changes.

## Candidate matchup calculation
For player A serving against player B returning, estimate expected service-point win probability from:
1. the tournament/tour/surface baseline;
2. A's opponent-adjusted serve strength relative to that baseline;
3. B's opponent-adjusted return strength relative to that baseline.

Repeat symmetrically for B serving against A returning. Do not use raw serve percentage alone: opponent strength and sample-size uncertainty must be addressed. The exact estimator and any Elo reconciliation are research questions, not fixed coefficients.

## Data audit before modelling
1. Inventory available historical columns for ATP and WTA separately.
2. Verify that serve/return denominators and opponent-side columns are correctly paired.
3. Measure usable-match coverage by year, tour and surface.
4. Check player identity linkage and duplicate matches.
5. Verify pre-match cutoffs and exclude current-match statistics from every feature.
6. Record missingness; never replace unavailable serve/return statistics with zero.

The current source-neutral `historical-normalizer.js` schema does not yet contain serve/return point statistics. The existing PFE module already contains point-to-game/set/match probability calculations, which may provide the downstream probability conversion. Therefore, the first SMA implementation should be an archival feature builder and research evaluator, not a live predictor.

## Validation plan
- Train ATP and WTA separately.
- Use expanding or rolling walk-forward splits; no random train/test split.
- Compare PFE baseline, SMA-only point model, and PFE+SMA blend/correction on identical evaluation matches.
- Report Brier score, log loss, accuracy, calibration, coverage and uncertainty.
- Slice results by surface, year, tour and sample-size tier.
- Run ablations: serve only, return only, opponent adjustment, surface adjustment, recent window, long window, shrinkage.
- Evaluate betting ROI only after joining historical bookmaker odds available before match start; account for margin and realistic price availability.
- Keep SMA in shadow mode until improvements are stable and statistically credible.

## First deliverables
1. Dataset schema/coverage audit for the user's ATP and WTA Sackmann archives.
2. Leakage-free rolling serve/return feature builder.
3. Opponent-adjusted SMA estimator with uncertainty and missing-data flags.
4. Walk-forward research report and tests.
5. Only after validation, a separately versioned SMA coefficient/model artifact.

## Research references
- Gollub (2021), *Forecasting serve performance in professional tennis matches*: opponent-adjusted serve/return estimates, sample-size shrinkage and Elo reconciliation. https://doi.org/10.3233/JSA-200345
- Li et al. (2026), *A unified server quality metric for tennis*: separates serving quality from return ability using point-level data. https://doi.org/10.1177/22150218261444537
