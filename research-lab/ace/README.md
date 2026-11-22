# ACE v0.1 implementation

Research-only implementation of the calendar workload feature specification.

## API

`calculateAceFeatures(target, history, options)`

- `target`: `match_id`, `date` (YYYY-MM-DD), `player_a_id`, `player_b_id`
- `history`: parsed rows from the semicolon archive; source or normalized column names accepted
- `options.source_snapshot_id`: optional immutable source identifier

Returns the standard status vocabulary: `available`, `insufficient_data`, or `abstain`. Implementation failures should throw and be handled by the runner as `error`.

## Important constraints

- All same-day records are excluded.
- Only rows with stable match IDs and valid date/player IDs are used.
- Exact duplicate IDs are collapsed; conflicting duplicate IDs affecting either target player cause abstention.
- W/O, WO, WALKOVER, DEF, DEFAULT, ABD and ABANDONED statuses are excluded from counts. Retirement records are not inferred from score text; absent a reliable status field, source ambiguity remains.
- Duration is counted only when positive and no more than 600 minutes. This is a conservative engineering guard, not a medical threshold.
- This module does not estimate rest hours, fitness, injury, or match-win probability.

## Tests

Run with Node.js 20 or newer:

```sh
node --test research-lab/ace/features.test.mjs
```

The tests are committed but have not been executed in this environment. No performance claim is made.


## Validation history

The first GitHub Actions run exposed two fixture problems: an incorrect expected count at the 7-day boundary and an exact-duplicate scenario where player B had no prior history. The fixtures were corrected, and a retirement-duration exclusion case was added. A second CI result is pending; do not treat the first failed run as a pass.
## Validation history

GitHub Actions run [#45000705945](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45000705945) passed all 9 tests (9 passed, 0 failed) on Node.js 22. The test suite covers strict same-day exclusion, 3/7/14-day boundaries, match-vs-playing-day counts, missing/invalid durations, administrative outcomes, duplicate conflicts, retirement duration handling, insufficient history and invalid targets.

Earlier runs exposed fixture errors and a literal-newline encoding error; those were corrected before the successful run. A later refinement separates exact-duplicate counts from conflicting IDs and adds an assertion for that accounting, so that refinement is awaiting the next CI run.
