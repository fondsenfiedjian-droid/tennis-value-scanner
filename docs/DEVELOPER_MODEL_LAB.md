# Developer Edition — historical model laboratory

The laboratory is available only in Developer Edition at /developer/. It stores up to six isolated model profiles and runs a local chronological comparison against one or more uploaded semicolon-delimited CSV files.

## Input schema

The CSV must contain these columns:

- date
- joueur1_id
- joueur2_id
- vainqueur_id
- surface

match_id is strongly recommended and is used for duplicate detection. The Valuebetennis archive schema is supported directly. Multiple yearly files can be selected together; duplicate match IDs are removed.

Files are parsed and processed in the browser. They are not uploaded to the Worker or stored by the app.

## Research model

Each profile has four parameters:

- K-factor: Elo rating update size.
- Surface weight: multiplier for the difference in surface-specific Elo.
- Form weight: multiplier for the difference in each player's win rate over their last 10 completed matches.
- H2H weight: multiplier for the shrunk head-to-head win difference. The denominator includes a four-match prior to limit extreme values from tiny samples.

The reference profile is K=32, surface weight=0.30, form weight=80 and H2H weight=60. This is a reproducible research baseline, not a claim that the historical runner is identical to the live API prediction implementation.

## Chronology and metrics

Matches are sorted by date. For each calendar day, every model makes all predictions before any result from that day updates its ratings, form history or H2H history. This avoids same-day result leakage when exact match start times are unavailable.

Every profile is evaluated on the same accepted match sample. Reported metrics:

- Brier score — lower is better.
- LogLoss — lower is better.
- Accuracy — supplementary, not a replacement for probability quality.
- ECE — ten-bin expected calibration error; lower is better.

The table reports the Brier difference against the reference profile. ROI is deliberately omitted: this runner does not implement timestamped bookmaker odds, staking, settlement, void handling or costs.

## Boundaries

- No profile can change the live prediction model or Production recommendations.
- No model is automatically promoted.
- Results are research diagnostics, not proof of betting profitability.
- Coverage, missing IDs, event/tier mix and data licensing remain the researcher's responsibility.
- The CSV input is semicolon-delimited; unsupported or invalid rows are excluded and counted.
