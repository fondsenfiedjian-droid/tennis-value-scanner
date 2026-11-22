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
