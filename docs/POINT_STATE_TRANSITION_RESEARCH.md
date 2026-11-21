# Point-state transition research

## Scope

This is a research-only parser for the Live Tennis API academic public sample. Each CSV row is a scoreboard state, not a point result. A point outcome is inferred only from the transition to the next state for the same match. The script accepts a CSV or gzip-compressed CSV and emits aggregate diagnostics only:

`node scripts/point-state-transition-audit.mjs --input points_sample_2026-06.csv.gz --out report.json`

No match IDs, player names, raw rows, or player-level features are written to the report.

## Inference order

1. Compare completed-set counters, but accept a winner only when the prior score is demonstrably one point from closing the game/set and the next state resets the point score to 0-0. For a tiebreak, the prior numeric score must be one point from the two-point-margin finish.
2. If set counters do not change, apply the same terminal-score and 0-0 reset gate to current-set game counters. Counter changes without a terminal prior score remain ambiguous; this prevents skipped multi-point gaps from being mislabeled as a single point winner.
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

## Real public-sample audit harness (2026-11-21)

- Added optional match-index input to the aggregate-only audit. It reports coverage by the source's literal `tier_key`; these values are preserved as source categories and are not silently relabelled as ATP/WTA tours.
- Added timestamp integrity diagnostics: valid/missing timestamp counts, duplicate adjacent timestamps, non-monotonic adjacent timestamps, and affected match count. Input capture order remains authoritative; the audit flags timestamp inconsistencies rather than sorting away possible source defects.
- Added an ephemeral GitHub Actions workflow that downloads only the public Zenodo sample files (`matches.csv.gz`, `points_sample_2026-06.csv.gz`), runs the audit, and publishes aggregate diagnostics only. Raw source files remain on the temporary runner and are not committed or uploaded as artifacts.
- Source licence: CC BY-NC 4.0. Use for this non-commercial research only; cite the dataset and do not redistribute raw data.
- Validation of the harness is pending the PR checks and a successful manual/workflow run against Zenodo. No real-sample result is claimed yet.
- Next: inspect the resulting tier coverage and timestamp quality; then manually validate a stratified sample of transitions against source score sequences before drawing conclusions about server ownership or model features.

### Counter-inference safety gate (2026-11-21)

The first real-sample run exposed a potential over-inference risk: the earlier parser accepted any one-game or one-set counter increment, even if the previous point score was not a terminal game-point state. Such a transition may conceal multiple missed points. Counter-based inference is now restricted to transitions where the prior score is one point from game completion (or one point from a two-point tiebreak finish) and the next state resets to 0-0. Other counter changes remain ambiguous. Dedicated tests cover ordinary game, set, tiebreak and skipped-score cases. The initial 84.38% figure is therefore a pre-gate diagnostic only and must not be treated as the validated parser rate; rerun the sample after this change.
