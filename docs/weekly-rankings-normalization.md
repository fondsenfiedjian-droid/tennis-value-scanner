# Weekly rankings normalization

The local-only importer `scripts/sackmann-weekly-rankings-import.mjs` normalizes ATP or WTA weekly rankings into separate files. It never modifies raw downloads or production data. It uses bounded-memory external sorting and exact grouping by (tour, ranking_date, player_id).

## Run

```sh
cd ~/tennis-value-scanner
node scripts/sackmann-weekly-rankings-import.mjs --tour atp --out-dir ~/tennis-data/rankings/processed ~/tennis-data/rankings/raw/atp_rankings_*.csv
node scripts/sackmann-weekly-rankings-import.mjs --tour wta --out-dir ~/tennis-data/rankings/processed ~/tennis-data/rankings/raw/wta_rankings_*.csv
```

Optional `--chunk-size 100000` controls approximate in-memory sort size (minimum 1000). Temporary sort chunks are created under the OS temp directory and removed after a successful or failed run.

## Outputs

For each tour:
- `<tour>-weekly-rankings.csv`: canonical rows sorted by date and player ID.
- `<tour>-weekly-rankings-quarantine.csv`: every source row belonging to a conflicting player/date group, with a reason.
- `<tour>-weekly-rankings-report.json`: row counts, resolutions, exclusions and output paths.

Canonical columns: `tour,ranking_date,player_id,rank,points,source_file,source_row`.

## Deduplication policy

- Exact same rank and points for the same player/date: retain one; count removed repeats.
- Same rank where one or more duplicate rows have blank points and at least one has populated points: retain the populated points; count the resolution.
- Different ranks for one player/date: quarantine every row in that group.
- Same rank but multiple different populated point values: quarantine every row in that group.
- Blank points are permitted, especially in older historical files. Invalid dates, missing IDs, invalid ranks, and nonnumeric populated points are counted and skipped.

The importer does not infer why conflicting lists exist and does not select the more favorable rank. In particular, it does not assume that duplicate rankings are singles/doubles or that one rank is correct.

## Temporal use

For a match on date D, research joins must use only the latest canonical ranking with `ranking_date <= D`. Never use the next weekly ranking or interpolate from a future snapshot. Keep ATP and WTA namespaces separate. The source files are CC BY-NC-SA 4.0: retain attribution and license restrictions; do not commit downloaded or normalized ranking data to this public repository.
