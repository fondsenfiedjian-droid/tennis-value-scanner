# Tennis database expansion plan

Status: research and data acquisition only. No production prediction changes.

## Goals

1. Add genuinely new coverage rather than duplicate existing Sackmann match results.
2. Prefer free, documented sources that can be downloaded without manual account work.
3. Keep raw third-party datasets outside this public repository.
4. Preserve source provenance, license, snapshot date, checksums and exact player-ID mappings.
5. Never merge ATP and WTA player IDs into one namespace.
6. Do not change production Elo, EV, bet selection or the live API until a separate walk-forward evaluation supports it.

## Current project baseline

The project already has local Jeff Sackmann ATP/WTA match archives and normalized files (2000–2026), Valuebetennis seasonal results/odds data, and a live Winamax odds feed. The raw Sackmann files are CC BY-NC-SA 4.0 and must remain non-commercial, attributed and share-alike. Do not upload raw source CSVs to this repository.

## Ranked sources

### 1. Jeff Sackmann weekly rankings (ATP and WTA)

- Source mirror: https://github.com/Aneeshers/tennis-sackmann-archive
- Files: `atp/atp_rankings_*.csv`, `wta/wta_rankings_*.csv`.
- Adds: historical weekly rank and ranking points, allowing point-in-time ranking reconstruction, ranking momentum, rank decay and more accurate protected-ranking context.
- Coverage: ATP rankings are mostly complete from 1985 onward; 1973–1984 are intermittent. Verify WTA coverage from its upstream README before assuming completeness.
- License: CC BY-NC-SA 4.0.
- Priority: highest, because it is an easy extension of the existing Sackmann player-ID ecosystem.
- Acquisition: download to `~/tennis-data/rankings/`; do not commit raw files.

### 2. Live Tennis API public research sample

- Project documentation: https://github.com/livetennisapi/livetennisapi-data
- Academic dataset page: https://livetennisapi.com/data/academic
- Public Zenodo sample DOI: https://doi.org/10.5281/zenodo.22048730
- Public files documented by the project: `matches.csv.gz`, `players.csv.gz`, and a monthly `points_sample_2026-06.csv.gz` sample.
- Dataset snapshot measured 2026-08-22: 173,571 completed matches from 2023-01-01 through 2026-08-13 across ATP, WTA, Challenger and ITF; 32,678 players; the public point sample contains 951,064 point states for 5,380 matches in June 2026. The observed point layer began 2025-10-12. The broader reconstructed point layer is not in the public files.
- Adds: lower-tier coverage, stable player IDs with a Sackmann crosswalk, player metadata (country, birth date, handedness), and timestamped point-state observations.
- License/access: CC BY-NC 4.0; non-commercial academic research/teaching only. The full dataset requires an application and cannot be redistributed. Public sample is suitable for schema and linkage tests.
- Important: point rows are score states; point outcomes must be inferred from transitions between consecutive states for a match. Coverage may be partial; do not treat a tape as complete unless its metadata says so.
- Priority: high, after rankings. Start with the public sample and measure ID crosswalk coverage before applying for full access.

### 3. Grand Slam point-by-point archive

- Source: https://github.com/JeffSackmann/tennis_slam_pointbypoint
- Mirror folder: https://github.com/Aneeshers/tennis-sackmann-archive/tree/main/slam_pointbypoint
- Coverage: four Grand Slams, 2011–2024.
- Adds: point-level match sequences for majors, a useful historical complement to the Live Tennis sample.
- License: CC BY-NC-SA 4.0.
- Priority: high; check overlap and schema against existing match IDs before use.

### 4. Match Charting Project

- Source: https://github.com/JeffSackmann/tennis_MatchChartingProject
- Coverage: more than 5,000 manually charted professional matches; shot-by-shot records and match-level aggregates.
- Adds: shot type, direction, return depth, error type and tactical patterns.
- License: CC BY-NC-SA 4.0.
- Limitations: small, selection-biased sample; not representative of all tours or players. Use as a research feature source only, never infer that missing charting means missing skill.
- Priority: medium; download after the broad coverage datasets.

### 5. Valuebetennis seasonal CSVs (already partly used)

- Source: https://www.valuebetennis.com/en/donnees.htm
- License: CC BY 4.0 with attribution.
- Adds: historical Pinnacle opening and last pre-match odds alongside results.
- Existing project adapter already handles these files. Do not download duplicate seasons unless the local archive is missing a year or has a newer revision.
- Limitation: no archived model probability or full quote-capture provenance, so it cannot establish strict historical EV/ROI.

## Sources not approved for automated import

### Tennis-Data.co.uk

The site publishes historical bookmaker odds, but its notice restricts use to private individuals and excludes commercial products and automated bot/scraper/AI data-training use. Do not scrape, import or train on these files unless a separate written licence is obtained.

### Unlicensed odds mirrors / scraped bookmaker pages

Do not ingest them until source, collection method, redistribution rights and intended use are documented.

## Work sequence

### Phase A — independent work (no phone required)

- [x] Review public source descriptions and licences.
- [x] Identify high-value data gaps and prioritize sources.
- [x] Add this plan and source register to the repository.
- [x] Add a local read-only audit script for downloaded ranking and Live Tennis files.
- [ ] Add download commands with resumable transfers and checksum capture.
- [ ] Review schemas and prepare ID crosswalk checks.

### Phase B — local download (one Termux run)

The audit utility is available at `scripts/tennis-dataset-audit.mjs`. After downloading files, run it with explicit paths; it streams `.csv.gz` files without extracting them and prints a JSON report. It does not modify inputs.

```sh
node scripts/tennis-dataset-audit.mjs \\
  ~/tennis-data/rankings/atp_rankings_*.csv \\
  ~/tennis-data/rankings/wta_rankings_*.csv \\
  ~/tennis-data/livetennis/raw/matches.csv.gz \\
  ~/tennis-data/livetennis/raw/players.csv.gz \\
  ~/tennis-data/livetennis/raw/points_sample_2026-06.csv.gz
```

If a glob has no matching files, remove that path before running.

1. Download ATP/WTA weekly ranking files.
2. Download the Live Tennis public sample files.
3. Download Grand Slam point-by-point files.
4. Download Match Charting Project files only if storage allows.
5. Keep original compressed files and checksums; write derived/normalized files separately.

### Phase C — quality audit

For every source, report:
- file size, checksum, source URL, retrieval date and licence;
- row count, date range, duplicate count and missing required fields;
- tour / draw / tournament-tier / surface coverage;
- unique player count and exact-ID crosswalk rate;
- overlap with the existing Sackmann archive;
- point-sequence completeness and observed/reconstructed provenance, where available.

### Phase D — research, not production

- Weekly rankings: ranking momentum, points decay and ranking/Elo disagreement.
- Live Tennis: Challenger/ITF coverage, point-state features and observed timestamp coverage.
- Grand Slam points: historical serve/return and pressure-point features.
- Match Charting: tactical features on the charted subset only.
- Run chronological walk-forward evaluation separately for ATP and WTA.
- Require stable improvements across years and cohorts before any production proposal.

## Data safety and storage

Recommended local layout:

```
~/tennis-data/
  rankings/raw/
  livetennis/raw/
  livetennis/normalized/
  slam-pointbypoint/raw/
  match-charting/raw/
  reports/
```

Do not place API keys, Apify tokens, signed download URLs, or raw third-party datasets in GitHub. Do not alter the existing normalized Sackmann files. All new importers must write to new paths and produce an audit report before any merge.

## Current decision

The first acquisition target is the weekly ATP/WTA ranking history. It is the least complicated high-value addition because it shares the Sackmann ID system and fills a real gap in the existing match archive. The Live Tennis public sample is second and will be used to validate Challenger/ITF linkage and point-level coverage.
