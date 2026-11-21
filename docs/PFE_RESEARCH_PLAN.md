# PFE research and development plan

## Operating decisions

- **Work mode: combined.** Continue improving the operational PFE core while independent research tracks run in parallel. Research must not hold up safe, validated improvements to the working engine; unvalidated research must not enter production.
- **Tour scope: ATP and WTA simultaneously.** Maintain separate ATP and WTA datasets, model evaluations and calibration reports. Do not pool their probability calibration by default.
- **Execution rule:** each implementation or research change updates this plan or the relevant research note and `PROJECT_STATE.md` in the same pull request.

## Main workstreams

### A. Operational PFE core

1. Keep the current prediction pipeline usable with the available verified inputs.
2. Preserve historical results, pre-match predictions, bookmaker prices and actual outcomes so every forecast can later be evaluated.
3. Improve probability calibration and uncertainty handling independently for ATP and WTA.
4. Keep the scanner's two recommendation concepts distinct: **Ставка дня** prioritises reliability; **EV дня** prioritises a justified positive expected value and is not a reliability ranking.
5. Never place bets automatically and never interpret positive EV as a guarantee.

### B. Parallel research tracks

1. **Data foundation:** maintain source registry, licensing notes, coverage audits, player crosswalks and reproducible aggregate-only reports.
2. **Score and point-state integrity:** validate row semantics, transition legality, missing-state patterns, timestamp order and source completeness before constructing point-level features.
3. **Serve and return:** investigate validated first/second serve, return, break-point and service-hold indicators. Reconcile denominators and field definitions before calculating player features.
4. **Player strength and context:** rank, age, Elo, surface-specific strength, recent form, opponent quality, workload and schedule.
5. **Playing style:** investigate charting-derived shot patterns and matchup effects only where samples are sufficiently representative and temporally valid.
6. **Physical and situational context:** assess rest, travel, acclimatisation, injury/stoppage signals, tournament incentives and psychological proxies only when reliable pre-match evidence exists.
7. **Market information:** measure opening/current line movement and market margin without allowing bookmaker prices to leak into an ostensibly independent baseline.

## Evaluation protocol

- Use chronological walk-forward evaluation. Every feature must be available before the target match begins.
- Keep ATP and WTA results separate; stratify by tour, surface, level and relevant coverage tier where sample size allows.
- Compare each candidate against a frozen baseline, not against a re-tuned model on the same holdout.
- Report Brier score, LogLoss, calibration, coverage, sample size and uncertainty; accuracy alone is insufficient.
- Test across multiple time windows and reasonable Elo/K-factor settings. A single aggregate improvement is not enough.
- Handle missingness explicitly. Do not turn absent observations into zero, a loss or an inferred event.
- A feature is research-only until it passes data-quality, timing, coverage and independent holdout checks. Then run it in shadow mode before production integration.
- Record negative findings as well as improvements. No production feature is activated by a promising correlation alone.

## Current priority order

1. Finish validating the PFE point-state research parser and the meaning of each source field.
2. Resolve server, tiebreak and incomplete-state semantics; keep unsafe fields blocked.
3. Continue serve/return data-quality and denominator research.
4. Consolidate validated rank/age and Elo/surface/form candidates into independent ATP and WTA evaluation reports.
5. Build and test playing-style/matchup candidates from sufficiently representative data.
6. Add physical, schedule and market-context candidates only with reliable timestamped pre-match evidence.
7. Compare combinations against the frozen baseline, then shadow-test accepted candidates.
8. Integrate only candidates that improve out-of-sample probabilities and remain stable across time windows.

## Current guardrails

- Jeff Sackmann and Match Charting Project raw data are not redistributed in this public repository; respect source licences.
- The Live Tennis API academic sample is non-commercial research data. Store only permitted aggregate findings in CI and repository reports; do not commit raw files or player-level sample extracts.
- Match Charting Project coverage is selective, not representative of the full tour.
- Point-state observations can begin mid-match or stop before the final point. Missing rows are not point outcomes.
- No server/tiebreak-dependent feature is production-approved until its source semantics reconcile at match level.
