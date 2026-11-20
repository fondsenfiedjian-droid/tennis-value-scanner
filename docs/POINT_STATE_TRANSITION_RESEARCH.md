# Point-state transition research

## Scope

This is a research-only parser for the Live Tennis API academic public sample. Each CSV row is a scoreboard state, not a point result. A point outcome is inferred only from the transition to the next state for the same match. The script accepts a CSV or gzip-compressed CSV and emits aggregate diagnostics only:

`node scripts/point-state-transition-audit.mjs --input points_sample_2026-06.csv.gz --out report.json`

No match IDs, player names, raw rows, or player-level features are written to the report.

## Inference order

1. Compare completed-set counters. Exactly one side increasing by one identifies the set winner.
2. If set counters do not change, compare the current-set game counters. Exactly one side increasing by one identifies the game winner.
3. If neither counter changes, inspect point-score states:
   - normal game progression: 0 → 15 → 30 → 40 → advantage;
   - advantage lost: advantage → 40 while the opponent remains at 40, so the opponent won the point;
   - tiebreak: numeric point counters increase by exactly one for one side.
4. Multi-point jumps, conflicting changes, missing scores and match-boundary transitions remain ambiguous; the parser does not guess.

The server field is preserved only as before/after availability and change counts. Its exact alignment to a transition is not assumed; service attribution remains blocked until validated against hand-checked source matches.

## Required validation before feature work

- Test transitions in normal games, deuce/advantage, tiebreaks, game boundaries and set boundaries against manually checked matches.
- Measure tape completeness: first state may start mid-match and final state may stop early.
- Keep ambiguous transitions and missing states explicit; never impute them as points won/lost.
- Validate whether server in the prior or next state owns the transition, especially around game and tiebreak service changes.
- Keep observed live capture separate from reconstructed post-match data. The public sample contains observed states only.
- Pre-match features may use only matches completed before the target match start; no same-event history without reliable match-specific order.
- Keep ATP, WTA, Challenger and ITF separate and apply minimum-history / shrinkage gates.

## Current status

The parser and synthetic tests are implemented, but no public sample file has been downloaded or imported in this pass. The parser is not production-connected and does not create player-level features. The dataset has no serve speed, serve direction or shot-level information.
