# Match Charting Project research

## Source and scope

Source: [Jeff Sackmann's Match Charting Project](https://github.com/JeffSackmann/tennis_MatchChartingProject), pinned to commit `1813a1309b7ed7ebf1c7e884b32bf675d00e4edf` (2026-09-18).

The source README describes more than 5,000 contributor-charted professional matches and shot-by-shot point records, including shot type/direction, return depth, errors and aggregate match statistics. Coverage is crowdsourced and selective; it must not be treated as a representative sample of all professional tennis.

## License

The source explicitly declares CC BY-NC-SA 4.0. Attribution is required, use is non-commercial only, and adaptations/redistributions must comply with ShareAlike. Do not use these data commercially without separate permission. This project downloads source CSVs only into an ephemeral GitHub Actions runner and retains only aggregate audit output. Do not commit raw CSVs or player-level derived datasets to this public repository.

## Automated audit

The `Match Charting Project data audit` workflow downloads ATP and WTA match metadata plus sixteen aggregate stat families per tour from the pinned source commit. It reports:
- metadata row counts, unique match IDs, duplicate IDs and date range;
- surface and player-handedness counts, including quality flags for unexpected categorical values;
- rows, columns, unique match IDs and literal `row`/`set` category distributions for each stat family;
- coverage of each stat family against its tour's match metadata;
- duplicate metadata IDs, repeated match IDs across stat rows (expected for row-level aggregates), missing IDs and unmatched stat-file IDs.

The completed 16-family audit found 7,565 ATP and 4,257 WTA unique metadata match IDs (11,822 total), with 2,003,405 ATP and 1,085,144 WTA aggregate-stat rows. All 16 families have 100% ID-join coverage against metadata IDs present in that family, but this is not calendar coverage. The serve-and-volley family is much sparser than the others (6,327 ATP and 1,078 WTA unique matches). Metadata quality flags remain review-required: unexpected surface values occur in 2 ATP and 9 WTA rows; unexpected handedness values in 2 ATP and 8 WTA rows. Repeated match IDs within a stat file are expected because multiple aggregate rows can belong to one match; they are not duplicate match records. Metadata contains 1 repeated ATP ID and 7 repeated WTA IDs. The valid ATP date range begins 1960-05-29 and requires source-level verification. Strict calendar validation found 1 invalid ATP date, 8 invalid WTA dates and 10 missing WTA dates. The metadata also contains non-surface text and non-R/L values in the surface/hand columns; these fields remain excluded from feature construction. Do not use metadata date/surface/hand fields for feature construction until these anomalies are reviewed.\n\nThe workflow intentionally does not retain raw points or raw stat files. The first pass is a coverage/schema audit, not a predictive feature test. A second research stage may inspect selected point-level fields after the data dictionary has been mapped and point-to-match completeness has been assessed.

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


## Match metadata field coverage and linkage preparation

The completed field-coverage audit (run 44833318668) reports ATP metadata coverage: Tournament 100%, Round 99.99%, Time 54.11%, Court 74.13%, Surface 100%, Umpire 60.30%, Best of 99.56%, Final TB? 99.44%, Charted by 99.97%. WTA coverage: Tournament 99.60%, Round 99.72%, Time 41.49%, Court 66.98%, Surface 100%, Umpire 53.59%, Best of 99.58%, Final TB? 99.55%, Charted by 99.79%. Round labels mostly match the historical results codes (R128/R64/R32/R16/QF/SF/F/RR), so the event + round fields are usable for a conservative natural-identity linkage audit. The planned join is tour + year + tournament mapping + unordered player pair + round, with exact unique-only resolution and date as a consistency check. The metadata still has 1 invalid ATP date, 8 invalid WTA dates and 10 missing WTA dates; unexpected surface/hand categories are also present. These rows remain quarantined; no date/surface/hand feature is enabled from these rows.

The audit artifact writer was corrected to end JSON with a real newline; a CLI integration test parses the generated report as JSON.

## Pre-match style feature history coverage (research only)

A new ephemeral workflow joins the exact-linked MCP metadata to its aggregate stat families and Sackmann result archive, then estimates how many main-tour target matches have enough prior charted history for both players. The internal player-ID link map exists only in runner memory as a non-enumerable property and is never serialized. The workflow uploads only aggregate coverage counts.

Candidate descriptors from the stat families are:
- forehand share of forehand/backhand winners (Overview);
- unforced errors and winners per total point (Overview);
- net-point rate (NetPoints);
- deep/very-deep return share of returnable balls (ReturnDepth);
- serve-and-volley share of SnV plus non-SnV points (SnV);
- long-rally share among the mutually exclusive 1–3, 4–6, 7–9 and 10+ rally buckets (Rally).

For each descriptor, the audit measures whether both players have at least 3, 5 or 10 prior charted matches in a 730-day window, overall and on the target surface. Only exact linked rows with valid MCP match dates, plausible -7 to +21 day offsets from the archive event-week date, distinct player IDs and known Hard/Clay/Grass surfaces for same-surface history are accepted. Lower-tier linked charted matches may contribute to prior histories; evaluation targets are main-tour matches. All matches on the same calendar date are withheld from one another's histories because within-day order is not established.

This is a coverage audit, not a predictive backtest. The charted sample is selective, not representative; player-level history counts do not establish predictive value. No model is trained, no player-level features are retained, and no production feature is enabled. If coverage is sufficient, the next stage must evaluate each feature on identical eligible target matches against chronological Elo, with ATP/WTA separate and untouched later-period validation.
