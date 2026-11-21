# Winner Formula — research design

## Purpose
Estimate the probability that player A beats player B from paired, pre-match information. The existing Elo/surface/form/H2H model remains the baseline and is not modified by this research.

## First executable version
The first experiment adds a regularized logistic correction to the existing combined probability using measurable pre-match workload differences:
- matches played in the previous 3 and 7 calendar days;
- number of playing days in the previous 7 calendar days;
- rest days since the latest prior match;
- known match minutes in the previous 7 calendar days;
- coverage of known match durations;
- an explicit workload-availability indicator.

All workload features are A-minus-B differences. Same-day matches are excluded because their actual completion order is unknown. Missing workload is neutral and flagged rather than fabricated. The ATP and WTA models are trained separately.

## Evaluation protocol
Train only on matches dated on or before the configured training cutoff; evaluate on a later, untouched date window. Compare Brier score, log loss, and accuracy against the existing combined model on exactly the same evaluation matches. Lower Brier/log loss is better. The module reports coverage and serialized coefficients. It is research-only and does not calculate betting ROI.

## Deliberately not scored yet
Verified injury/medical status, weather, altitude, court speed, ball type, serve/return point statistics, style matchups, protected ranking, reliable travel/time-zone data, coaching changes, motivation, and psychology are not inferred from absent data. These require separate audited data sources and walk-forward ablation tests before they can enter a production probability.

## Next research additions
1. Audit and link weekly rankings and protected-ranking observations to historical match IDs.
2. Add serve/return and point-level metrics where coverage and time ordering are defensible.
3. Add surface and style matchup features with separate ATP/WTA validation.
4. Add verified injury and schedule/travel feeds with timestamps and explicit missingness.
5. Test each factor independently and in combinations, with year and surface slices and calibration checks.
