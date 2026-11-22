# Research data feasibility audit — ACE, SMA, HFA

Status: source-level audit of repository documentation and existing research code. No new historical dataset was downloaded and no statistical experiment was executed in this step.

## Summary

| SAS | Current evidence source | What can be tested now | Main limitation | Current status |
|---|---|---|---|---|
| PFE | Existing historical match CSVs and Elo backtests | Frozen baseline probabilities, rating/rank candidates, chronological evaluation | Must freeze exact baseline version and sample definition | Ready for baseline specification |
| ACE | Historical match dates/results; existing workload research notes | Calendar-day match counts and prior-match density when strictly earlier than target match | No dependable intraday start/end times; incomplete archive; medical/injury evidence not established | Partial / exploratory only |
| SMA | Sackmann match statistics and existing serve-return research | Serve/return rates, surface-specific rates, aces/DF/BP if present; prior-match-only features | Uneven coverage; archive terms are CC BY-NC-SA 4.0 | Existing experiment; reuse after licensing and coverage review |
| HFA | No verified source identified in inspected repo | No defensible predictive signal yet | No confirmed timestamped motivation/psychology observations with reproducible labels | Not data-ready; abstain |

## ACE — Adaptive Condition Evaluation

### Candidate features that may be derived from match histories
- Matches played in the previous 3, 7 and 14 calendar days.
- Number of distinct playing days in the previous 7 and 14 days.
- Consecutive calendar days with a recorded match.
- Prior match duration totals, but only where durations exist and are valid.
- Tournament transition / travel proxy only if tournament location and dates are both reliable.

### Strict eligibility rules
- A prior match counts only if its completion/result timestamp is proven to precede the target prediction cutoff.
- If only a calendar date is known, same-day ordering is unknown. Exclude same-day matches from the strict feature set.
- Do not translate calendar-day gaps into hours of recovery.
- Missing duration is NA, not zero.
- A walkover or retirement must not be treated as a normal full workload match.
- Report coverage separately by tour, year, level and surface.

### Not currently established
- Exact match start and finish timestamps for the prior matches.
- Reliable, timestamped injury reports or physical readiness measurements.
- Travel distance and timezone changes with sufficient historical coverage.

ACE v0 should therefore begin with a conservative calendar-based workload signal and an explicit missing-data / abstention state. It must not claim to measure actual recovery hours or diagnose injury.

## SMA — Serve & Matchup Analysis

### Existing work to reuse
- `scripts/sackmann-data-audit.mjs` checks source field validity and coverage.
- `scripts/sackmann-serve-return-research.mjs` builds prior-match-only serve/return features, excludes non-standard outcomes, groups same-day matches before history updates, and tests overall, surface, residualized and shrinkage variants.
- Existing workflow runs walk-forward tests with a 2025 holdout and several surface-shrinkage settings.

### Required next audit
1. Capture latest completed workflow artifact/report rather than infer results from script design.
2. Break coverage down by ATP/WTA, year, surface and tournament level.
3. Compare eligible samples across all feature variants.
4. Verify every feature's data availability timestamp precedes prediction cutoff.
5. Check whether ace, double-fault, break-point and return measures add information after existing serve/return rates; avoid double counting.

### Licensing gate
The repository identifies the source archive as CC BY-NC-SA 4.0. This is a non-commercial, share-alike license. Before using this dataset in a commercial product or distributing adapted datasets/reports, obtain appropriate permission or use a separately licensed source. Do not assume public GitHub availability grants commercial rights.

## HFA — Human Factor Analysis

No reliable HFA dataset was confirmed in the inspected repository. The following are possible evidence classes, not approved inputs:
- Official player withdrawals / retirements and their timestamps.
- Player statements or tournament press conference transcripts published before the match.
- Verified scheduling or tournament-context facts published before the match.
- Reproducible, independently coded observations with source links and two-person review.

Do not score vague claims such as “must win”, “high motivation”, “revenge”, “nervous”, or “mentally weak” without a documented pre-match source, a coding protocol, an availability timestamp and an uncertainty rating. Post-match interviews, result descriptions and retrospective commentary are prohibited as pre-match features.

HFA v0 should return `insufficient_data` for most matches until a source corpus and coding/reliability protocol exist. This is a correct output, not a failure.

## Shared provenance requirements

For every feature observation retain:
- source identifier and source URL/reference;
- source publication timestamp (if supplied);
- first-known / ingested timestamp;
- prediction cutoff timestamp;
- transformation and feature version;
- raw value, normalized signal, coverage and reliability;
- missingness reason.

A feature is admissible only if its availability timestamp is no later than the prediction cutoff. If that cannot be established, mark it unavailable.

## Priority order

1. Freeze the PFE control model and its exact evaluation sample.
2. Retrieve and review existing SMA workflow reports; do not launch a fresh full archive download until the prior report is checked.
3. Build ACE calendar-based workload coverage report from already-held historical match data, explicitly excluding same-day ambiguity.
4. Keep HFA in abstention mode while documenting admissible sources and a coding protocol.
5. Only then implement Aggregator v0.1, with missing systems omitted and abstention supported.

## Decision

SMA is the most mature candidate for the first integration experiment, subject to license review and same-sample evaluation. ACE is a limited exploratory candidate. HFA is not ready for predictive weighting. PFE remains the sole production baseline.
