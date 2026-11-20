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


## Next Gen Fast4 score validation

The historical importer has a separate Fast4 rule only for tournaments whose name identifies the Next Gen format. A completed Fast4 set is accepted as 4-0, 4-1 or 4-2, or 4-3 when a tiebreak marker is present. Ordinary-length sets such as 5-3 or 6-4 are rejected even when the tournament name is Next Gen. The normal-tour completed-set rule remains unchanged. This prevents the special format from widening the accepted score range for standard events.
