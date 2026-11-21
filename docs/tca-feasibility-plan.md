# TCA — Technical & Competitive Attributes feasibility plan

## Status

Research specification only. TCA is not part of PFE, ACE, SMA, the production registry, Worker, UI, or betting recommendations. The objective is to determine whether objective, pre-match technical/matchup information exists at sufficient coverage and quality to add information beyond the existing model without double-counting.

## Model boundary

- **PFE** remains the base probability engine.
- **ACE** represents workload and recovery.
- **SMA** represents measured serve/return performance and surface-adjusted serve/return profiles.
- **TCA** may only represent a distinct opponent-specific technical matchup residual not already represented by PFE, ACE, or SMA.

TCA must not become a subjective player-rating score. No scouting adjectives such as "talented", "aggressive", "fast", "mentally strong", or "good technique" may be converted into numbers without a reproducible, sourced measurement.

## Data feasibility findings

The completed Sackmann data-coverage audit processed 118 ATP/WTA annual files. For the available 2016–2026 archive, the aggregate match-level coverage is:

| Tour | Valid matches | Core serve/return stats both players | Handedness both players | Age both players |
|---|---:|---:|---:|---:|
| ATP | 28,149 | 96.10% | 98.86% | 99.92% |
| WTA | 26,364 | 96.73% | 95.21% | 99.88% |

Interpretation:
- Core serve/return data overlaps heavily with SMA and must not be counted again as TCA.
- Handedness is a reliable contextual matchup variable in this archive, but it is not itself a measure of technical skill.
- Age belongs to a separate player-development/physical-moderator hypothesis, not TCA.
- The archive contains no reliable shot placement, rally tolerance, movement tracking, court-position, or tactical-choice measurements. These cannot be inferred from match outcomes or invented from ordinary box-score statistics.

**Licensing constraint:** the Sackmann/Tennis Abstract source and derived report are CC BY-NC-SA 4.0. This archive is suitable for non-commercial research only. Do not put derived features or data into a commercial production service without separate permission or a separately licensed source.

## Candidate feature tiers

### Tier 0 — eligible for feasibility testing

1. **Handedness matchup**: left/right combinations, represented as categorical pair interactions rather than an arbitrary "left-handed bonus".
2. **Handedness × surface**: only if predeclared and evaluated with adequate sample sizes; no assumption that the effect generalizes across surfaces.
3. **Handedness × opponent serve/return profile**: exploratory only. Because the underlying serve/return statistics belong to SMA, the interaction must be tested as an incremental residual on top of SMA and not reintroduced as a duplicate main effect.

These variables describe matchup context, not overall technical quality. Their value must be established by same-sample ablation.

### Tier 1 — require a new, licensed data source

- Rally-length win rates and performance by rally-length band.
- Shot direction, depth, pace, spin, placement, and shot tolerance.
- Return position / serve-return positioning.
- Court coverage, movement speed, defensive-to-offensive transition.
- Approach/net-play frequency and success, passing-shot patterns.
- Tactical adaptation within a match, provided the data is timestamped and available before the prediction being evaluated.

Point-by-point scores alone do not reliably identify these technical attributes. Shot-level or tracking data is required for most of this tier.

### Explicit exclusions

- Subjective media/scouting labels without a stable coding protocol.
- Post-match statistics used as if they were known before the match.
- Raw serve/return rates already used by SMA.
- Age and workload features already assigned to ACE or its separate research.
- Injury, motivation, confidence, or mental-state claims without verified pre-match measurements.

## Required experiment

1. Establish a frozen common sample where PFE, ACE and SMA all have valid pre-match predictions.
2. Build the simplest Tier 0 handedness interaction features with strict prior-date cutoffs and missingness flags.
3. Compare on identical matches:
   - PFE + ACE (baseline)
   - PFE + ACE + SMA
   - PFE + ACE + handedness matchup residual
   - PFE + ACE + SMA + handedness matchup residual
4. Fit all correction coefficients on earlier dates only; freeze them before each later holdout.
5. Report ATP and WTA separately: Brier, LogLoss, calibration/ECE, paired confidence intervals, coverage, coefficient stability, and results by surface.
6. Require direct paired comparisons of candidate stacks, not only comparisons of each candidate against Elo.
7. Reject TCA if its gain disappears after SMA is present, if coefficient signs are unstable, or if it only helps one narrow tour/surface slice.
8. Only after probability validation, test incremental value against timestamped Winamax quotes and verified results.

## Current decision

Do not build a broad TCA score yet. The available archive supports a narrow handedness-matchup experiment, but it does not contain the tracking/shot-level evidence needed to quantify most technical qualities. The next sensible research step is a small, explicitly labelled handedness residual ablation. In parallel, identify a licensed source for point/rally/shot-level data before expanding the concept.

No production changes are authorized by this document.
