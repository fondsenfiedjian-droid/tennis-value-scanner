# PFE control definition — research baseline

This file prevents the live production predictor from being confused with the offline historical Elo experiments.

## Control A: live production PFE

Source revision on `main` at inventory time:
- `worker.js`: `1c8abf5883bd589032e5f2c5b04169e22bbbd262`
- `README.md`: `d88703d018b1632706e2b6321b6e6840de6d33e1`

Documented production behavior:
- obtains general / overall Elo ratings from player profiles;
- computes the two-way win probability using `1 / (1 + 10^((EloB - EloA) / 400))`;
- bookmaker odds are used downstream for fair odds / estimated EV, not as an input to the Elo probability;
- no historical K-factor update occurs in the live request path;
- no trained surface, form, H2H, ACE, SMA or HFA correction is part of the documented live probability.

The Worker contains helpers for reading surface Elo fields, but the existence of a helper is not proof that the production prediction route uses surface Elo. The production control must be verified against the exact `/predict` route before any claim that surface Elo is live.

For the first paired research comparison, reproduce the exact production route's inputs and probability calculation, including its fallback/error behavior. Freeze player profile snapshots and their rating dates where available. Do not treat the provider's current profile as a historical pre-match rating.

## Control B: offline historical PFE benchmark

Source:
- `scripts/backtest.mjs`: `e298c9480e7bc8c1fab6e3973fe179cadf6f022d`
- `scripts/valuebetennis-backtest.mjs`: `058004b736365c0c09cec47960e24593b12411eb`

This is a separate historical reconstruction. The Elo backtest defaults to K=32 and maintains chronological ratings from the supplied match history. It also calculates experimental surface, form, H2H and combined candidate probabilities. These candidates are not automatically identical to the live production model.

Previously reported K=80 results belong to this offline research stream. K=80 is an experimental candidate, not the live production setting and not a production replacement.

## Required paired controls

Do not compare an ACE/SMA/HFA candidate to a historical K=80 report and call it an improvement to live production. Keep these comparisons separate:

1. Live PFE reproduction vs experimental candidate, only when historical rating snapshots can be reconstructed without leakage.
2. Offline PFE K32 control vs feature combinations on the same chronological historical sample.
3. Offline PFE K80 candidate vs the same feature combinations on the same sample, reported separately.

Every report must state:
- control ID and source commit SHA;
- rating source and as-of timestamp;
- K-factor if applicable;
- warm-up period and evaluation period;
- eligible match IDs / sample hash;
- tour and surface strata;
- Brier, LogLoss, calibration and accuracy;
- paired per-match loss difference and uncertainty interval.

## Current status

- Live PFE formula is documented, but an exact historical replay dataset of player profile snapshots is not yet confirmed.
- Offline PFE historical replay is supported by archived match CSVs.
- Do not mix live and offline control metrics into one leaderboard.
