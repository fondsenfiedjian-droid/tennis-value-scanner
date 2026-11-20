# Match Charting Project research

## Source and scope

Source: [Jeff Sackmann's Match Charting Project](https://github.com/JeffSackmann/tennis_MatchChartingProject), pinned to commit `1813a1309b7ed7ebf1c7e884b32bf675d00e4edf` (2026-09-18).

The source README describes more than 5,000 contributor-charted professional matches and shot-by-shot point records, including shot type/direction, return depth, errors and aggregate match statistics. Coverage is crowdsourced and selective; it must not be treated as a representative sample of all professional tennis.

## License

The source explicitly declares CC BY-NC-SA 4.0. Attribution is required, use is non-commercial only, and adaptations/redistributions must comply with ShareAlike. Do not use these data commercially without separate permission. This project downloads source CSVs only into an ephemeral GitHub Actions runner and retains only aggregate audit output. Do not commit raw CSVs or player-level derived datasets to this public repository.

## Automated audit

The `Match Charting Project data audit` workflow downloads ATP and WTA match metadata plus ten aggregate stat families per tour from the pinned source commit. It reports:
- metadata row counts, unique match IDs, duplicate IDs and date range;
- surface and player-handedness counts, including quality flags for unexpected categorical values;
- rows, columns and unique match IDs for each stat family;
- coverage of each stat family against its tour's match metadata;
- duplicate IDs, missing IDs and unmatched stat-file IDs.

The first completed audit found 7,565 ATP and 4,257 WTA unique metadata match IDs. Each of the ten stat families per tour joins to 100% of its own unique match IDs against the corresponding metadata IDs. This is join coverage, not a claim that every match has every statistic. The metadata also contains unexpected surface/hand values and duplicate rows, so those rows are flagged for review and the date/surface/hand fields must not yet be used for feature construction.\n\nThe workflow intentionally does not retain raw points or raw stat files. The first pass is a coverage/schema audit, not a predictive feature test. A second research stage may inspect selected point-level fields after the data dictionary has been mapped and point-to-match completeness has been assessed.

## Candidate PFE research signals

Potential descriptive features include:
- serve direction and serve-plus-one patterns;
- serve-and-volley frequency;
- return depth and return outcome;
- rally length distribution and net-point frequency;
- forehand/backhand shot mix, direction and outcome.

These features are not approved for production. The sample is player- and tournament-selective, repeated observations are not independent, and charting volume varies by player and year. Any model test must use only matches charted before the target match, apply minimum sample thresholds, compare against an identical baseline on the same eligible matches, and use chronological holdouts. Report sample coverage and uncertainty alongside any score change.

## Reproduction

The workflow is triggered by a pull request touching the audit files or can be manually dispatched from GitHub Actions. It uploads only `match-charting-audit.json` as a 30-day artifact.
