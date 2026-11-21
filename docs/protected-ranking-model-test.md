# Protected Ranking: walk-forward experiment

Status: research-only. This experiment does not alter the live model.

## Run

Keep the Sackmann source archive, normalized files and manually verified observation CSV outside the public repository.

```sh
node scripts/protected-ranking-research.mjs --tour atp \
  --observations ~/tennis-data/protected-ranking-observations.csv \
  --from 20000101 --to 20260525 --k 32 \
  --out ~/tennis-data/atp-protected-ranking-research.json \
  ~/tennis-data/atp-normalized.csv

node scripts/protected-ranking-research.mjs --tour wta \
  --observations ~/tennis-data/protected-ranking-observations.csv \
  --from 20000101 --to 20260525 --k 32 \
  --out ~/tennis-data/wta-protected-ranking-research.json \
  ~/tennis-data/wta-normalized.csv
```

## Experiment design

- Exact numeric archive player IDs only; no fuzzy name join.
- ATP and WTA are evaluated separately.
- The baseline is a yearly walk-forward logistic model using pre-date overall Elo.
- The ordinary-rank model uses pre-date Elo plus the tournament ordinary ranking feature.
- On an explicitly documented protected-entry event only, the protected-rank model substitutes the published protected rank for that player's ordinary tournament rank. The opponent's ordinary rank remains unchanged unless the opponent also has a separately documented protected entry for that same event.
- Models for each evaluation year are fitted only on matches dated before that year. Training examples are mirrored to remove player-ID orientation asymmetry.
- All matches with the same tournament date use the same pre-date Elo state; Elo is updated after all matches on that date.
- Metrics are calculated on the same event-match sample for all three models: Brier score, log loss and accuracy. Lower Brier/log loss is better.
- Conflicting protected-rank values for the same player/event are excluded and reported. Missing IDs are reported and skipped.

## Interpretation

This is a deliberately narrow substitution experiment. It asks whether the official protected rank is a better ranking input than the ordinary rank recorded for the event, given an Elo+rank model calibrated on historical ordinary ranks. It does not establish that protected rank should be added as an independent production feature.

Entry-list observations are sparse and selected. A published protected rank is an entry mechanism and proxy for prior level, not a direct measurement of current strength. The experiment must not infer protection validity outside the documented event, diagnose injuries, or treat archive gaps as inactivity.

Sackmann tournament dates are week-level dates rather than exact match start times. Results are exploratory until the sample is enlarged with independently verified official records and broader lower-tier match coverage.

## Production gate

Do not ship this feature based on this experiment alone. Require larger verified coverage, recent-year robustness, improved out-of-sample Brier and log loss, and no material regressions for underdogs or first-return matches. Keep the existing production Elo/model untouched.
