# Sackmann historical data import (research only)

This importer reads the yearly main-tour singles files from Jeff Sackmann's ATP or WTA archive and creates a compact normalized CSV for chronological research. It does not download or store source datasets in this repository.

## Source layout

Use separate source folders:
- ATP: `atp/atp_matches_YYYY.csv`
- WTA: `wta/wta_matches_YYYY.csv`

The archive's ATP/WTA player and ranking files are retained as source material for later feature work. The yearly match rows already include winner/loser rank, ranking points and age fields. Treat these as historical snapshots associated with the tournament date, not as current rankings.

## Run

```sh
node scripts/sackmann-import.mjs --tour atp --input-dir /path/to/archive/atp --output /path/out/atp-sackmann-normalized.csv
node scripts/sackmann-import.mjs --tour wta --input-dir /path/to/archive/wta --output /path/out/wta-sackmann-normalized.csv
```

The output retains tourney date, player IDs, result, surface, tour/tournament metadata, rank, ranking points and age. It excludes invalid dates/IDs and retired, walkover or otherwise incomplete outcomes. Unknown surfaces are retained with a blank surface and counted in diagnostics.

The output is compatible with the existing chronological Elo backtest's core columns. ATP and WTA must be backtested separately. The import is a data-preparation step only; it does not change production predictions or EV.

## Licensing and provenance

The source is Jeff Sackmann's tennis datasets:
- https://github.com/JeffSackmann/tennis_atp
- https://github.com/JeffSackmann/tennis_wta
- Archive mirror: https://github.com/Aneeshers/tennis-sackmann-archive

The archive states CC BY-NC-SA 4.0. Attribute Jeff Sackmann, preserve the same license for redistribution, and do not use commercially without separate permission. Do not commit raw or generated Sackmann data to this public application repository. This tool is for non-commercial research pending legal clearance for any broader use.


## Annual walk-forward rank and age research

After importing normalized ATP or WTA CSVs, run the research model separately for each tour:

```sh
node scripts/sackmann-rank-age-research.mjs --tour atp --from 20000101 --to 20260525 --k 32 --min-training 1000 --max-training 50000 --out atp-rank-age-report.json atp-sackmann-normalized.csv
node scripts/sackmann-rank-age-research.mjs --tour wta --from 20000101 --to 20260525 --k 32 --min-training 1000 --max-training 50000 --out wta-rank-age-report.json wta-sackmann-normalized.csv
```

The script compares three candidates:
- Elo + ranking: Elo difference plus the log ratio of the opponents' tournament-date ranks.
- Elo + age: Elo difference plus age difference and average age.
- Elo + ranking + age: all of the above.

For each candidate, an Elo-only logistic baseline is fitted on exactly the same eligible training matches. Candidate and baseline are then evaluated on the same eligible matches in the next calendar year. Coefficients are frozen for the entire evaluation year and are fitted only on earlier calendar years. All matches on the same date use the same pre-date Elo state; same-day results do not enter other same-day predictions.

Training samples are deterministically capped at 50,000 rows per annual fit to control runtime; evaluation uses every eligible match. The JSON report contains aggregate metrics only, not player-level predictions. Negative candidate-minus-baseline Brier or LogLoss deltas indicate improvement; positive deltas indicate deterioration. Missing ranks/ages are not imputed: each comparison uses its own eligible subset, and the combined model uses only matches with both signals.

This is an exploratory diagnostic, not a production model. Ranking values are tournament-date snapshots and are not guaranteed to be exact match-start snapshots. Do not activate rank or age in production without checking snapshot timing and confirming repeatable out-of-sample improvement across independent periods. All Sackmann-derived research remains non-commercial under CC BY-NC-SA 4.0.
