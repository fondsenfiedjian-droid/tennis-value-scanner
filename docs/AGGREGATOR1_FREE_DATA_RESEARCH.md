# Aggregator 1 — free tennis data research

This research branch is isolated from Production. No Worker, frontend, API secret, deployment configuration, or production calculation is changed.

## Current source plan

| Source | Best contribution | License / restriction | Research action |
|---|---|---|---|
| Valuebetennis | Recent ATP/WTA singles, match IDs, Pinnacle opening/closing odds, results and surfaces since 2021 | CC BY 4.0; attribution | Keep as odds/results spine; refresh annual files |
| Jeff Sackmann ATP/WTA + lower tiers | Long history and match statistics; Challenger, Futures, qualifying, WTA ITF | CC BY-NC-SA 4.0; non-commercial, attribution, share-alike | Reuse the pinned archive already audited; do not duplicate the full download |
| TennisMyLife | ATP IDs and richer serve/return match statistics; ATP, Challenger, qualifying and WTA CSVs | Personal/non-commercial research; no raw redistribution/resale; commercial use needs written permission | Download selected seasons only; WTA files are explicitly marked lower-confidence by publisher |
| TennisData.app | 49-column ATP/WTA season exports, match and first-set odds where available | Public page says free; confirm applicable terms before ingestion | Schema/coverage comparison candidate; avoid duplicate storage |

## Current published Valuebetennis inventory

The source page generated on 21 Nov 2026 lists:
- 2021: 63,728 matches
- 2022: 83,381
- 2023: 89,826
- 2024: 79,910
- 2025: 80,412
- 2026: 81,249

The 2025 and 2026 CSV copies already available in the research workspace were audited previously: 80,412 and 80,836 rows respectively. The local 2026 copy is behind the current published count and should be refreshed. The exact 2026 published count is date-sensitive because the file is regenerated.

Download page: https://www.valuebetennis.com/en/donnees.htm

TennisMyLife direct CSV index/API: https://stats.tennismylife.org/api/data-files
- ATP seasons: https://stats.tennismylife.org/data/YYYY.csv
- Challenger seasons: https://stats.tennismylife.org/data/YYYY_challenger.csv
- WTA seasons: https://stats.tennismylife.org/data/YYYY_wta.csv
- ATP qualifying: https://stats.tennismylife.org/data/atp_quali/YYYY_atp_quali.csv
- ATP player ID table: https://stats.tennismylife.org/data/ATP_Database.csv

The official database page confirms these file groups and states that WTA files are imported from existing online CSVs and are not guaranteed to have the same reliability as ATP files.
Expected direct file pattern: https://www.valuebetennis.com/datasets/valuebetennis-matchs-YYYY.csv

## Existing Sackmann audit (not a Valuebetennis linkage audit)

The existing lower-tier audit covered 144 CSVs in a pinned archive snapshot:
- ATP Futures: 501,940 completed rows
- ATP Challenger + qualifying: 232,006 completed rows
- WTA ITF + qualifying: 602,821 completed rows
- 1,325,071 unique natural match identities after within-family deduplication

Serve-stat coverage varies materially: 4.84% Futures, 57.52% Challenger/qualifying, 8.99% WTA ITF/qualifying. These are historical audit figures, not a fresh download.

Existing report: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/blob/main/docs/LOWER_TIER_DATABASE_RESEARCH.md

## Selective downloader

A Node.js downloader is included; it uses built-in Node APIs only and stores files under `research-data/aggregator1` (not Production). It fetches Valuebetennis 2021–2026 and TennisMyLife ATP, Challenger, WTA and qualifying files for the selected years, plus the ATP ID table. It records file sizes and SHA-256 hashes in `manifest.json`.

Run from the repository root:

\`\`\`bash
node scripts/download-aggregator1-free-data.mjs
\`\`\`

Optional: `--years 2021,2022,2023` to limit the range, `--no-wta` to skip the lower-confidence WTA files, or `--no-quali` to skip ATP qualifying.

The downloader has not been executed in this research environment: outbound DNS/network access is unavailable here. It is prepared for execution in Termux or a normal Node.js environment; inspect the manifest for any source-side omissions or failed files.

## New linkage audit

Run after placing Valuebetennis season CSVs and Sackmann CSVs in separate folders:

```bash
node scripts/aggregator1-linkage-audit.mjs --valuebet-dir ./research-data/aggregator1/valuebetennis --sackmann-dir ./research-data/aggregator1/sackmann --out ./research-data/aggregator1/linkage-report.json
```

The audit uses exact normalized full-name pairs, normalized surface, and a date window around Sackmann's event-week date. French Valuebetennis surface labels are mapped to Sackmann's canonical labels (including `dur intérieur` → Hard and `moquette intérieur` → Carpet). Tournament names are not required when there is exactly one candidate for the player pair, surface and date window; when multiple candidates exist, a non-empty exact normalized tournament name or explicit alias must identify exactly one candidate. Blank tournament labels are never used to disambiguate. Otherwise the row is counted as ambiguous. Rows with missing or unrecognized surfaces are not linked; unrecognized surfaces are also excluded from the Sackmann candidate index. The report includes candidate counts and separates links accepted without tournament-name matching from links resolved by tournament name. It writes aggregate counts only, not player names, match IDs, or row-level links. A synthetic regression fixture covers unique candidates with different tournament labels, tournament-based disambiguation, ambiguous cases, French surface labels, and rejection of unrecognized court surfaces. Run it with `node scripts/test-aggregator1-linkage-audit.mjs`.

## Important separation

- Research files remain outside Production.
- Do not alter Production calculations or data feeds based on this audit alone.
- Before using any lower-tier result to update main-tour Elo, test a separate tier-aware rating state and chronological holdout.
- Valuebetennis contributes odds but not detailed serve/return statistics.
- TennisMyLife can improve ATP player-ID crosswalks and match-stat coverage, but its WTA files need an independent quality audit.
- Tennis-data.co.uk is not included in automated model-training ingestion until its current terms are reviewed.

## Attribution

- Valuebetennis: https://www.valuebetennis.com/en/donnees.htm (CC BY 4.0)
- Jeff Sackmann: https://github.com/JeffSackmann/tennis_atp and https://github.com/JeffSackmann/tennis_wta (CC BY-NC-SA 4.0)
- TennisMyLife: https://stats.tennismylife.org/tennis-match-database (personal, educational and non-commercial research terms)
- TennisData.app: https://tennisdata.app/downloads/
