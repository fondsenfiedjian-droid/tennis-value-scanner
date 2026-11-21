# Weekly ranking as-of join

`scripts/sackmann-weekly-rankings-asof.mjs` creates a separate research copy of the normalized match archive with weekly ranking fields attached by exact player ID.

## Run

```sh
node scripts/sackmann-weekly-rankings-asof.mjs --tour atp --matches ~/tennis-data/atp-normalized.csv --rankings ~/tennis-data/rankings/processed/atp-weekly-rankings.csv --output ~/tennis-data/rankings/processed/atp-matches-with-weekly-rank.csv
node scripts/sackmann-weekly-rankings-asof.mjs --tour wta --matches ~/tennis-data/wta-normalized.csv --rankings ~/tennis-data/rankings/processed/wta-weekly-rankings.csv --output ~/tennis-data/rankings/processed/wta-matches-with-weekly-rank.csv
```

Optional `--report PATH` sets the JSON report path; by default it is derived from the output CSV name.

## Safety and methodology

- ATP and WTA are processed separately.
- Exact player IDs only; no name matching or cross-tour joins.
- For match date D, use the most recent ranking snapshot with `ranking_date < D`. Same-day snapshots are excluded because publication time and exact match time are unavailable; this avoids possible look-ahead leakage.
- The match archive must be sorted chronologically. The script reports any date regressions; canonical Sackmann imports are already sorted.
- The script streams the inputs and retains only the latest known ranking per player, rather than loading millions of ranking rows into memory.
- It writes a new research CSV and JSON report; it never modifies input archives or production data.
- Ranking points may be blank in historical source records and remain blank; they are not imputed.
