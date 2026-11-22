# Aggregator 1 — Live Tennis API Basic access audit

Date: 2026-11-22  
Branch: `research/aggregator1-linkage-audit`  
Scope: read-only verification; no Production, Cloudflare Worker, app calculations, or API secrets changed.

## 1. Subscription verification

The GitHub Actions secret `LIVE_TENNIS_API_KEY` was confirmed against `GET /usage` on run #3:

- tier: `basic`
- subscription: `active`
- quota: 60 requests/minute, 1,000/day
- remaining at verification: 1,000

Run: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45078821871

## 2. Bounded endpoint verification

Run #4 completed successfully on 2026-11-22. It checked the subscription and sampled only one row per list endpoint. The six requests were: `/usage`, `/history/coverage`, `/history/matches?limit=1`, one per-match tape, `/history/archive/matches?tour=atp&limit=1`, and one archive detail.

Run: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45078950746

Observed results:

| Endpoint | HTTP | Result |
|---|---:|---|
| `/history/coverage` | 200 | 11 tour/draw buckets; coverage artifact dated 2026-11-22 |
| `/history/matches?limit=1` | 200 | completed-match listing and tape-coverage summary available |
| `/history/matches/{matchId}` | 200 | sampled tape: 155 rows; 155 timestamps; 155 model-probability rows; `point_source=observed`; `coverage=from_start` |
| `/history/archive/matches?tour=atp&limit=1` | 200 | archive results available |
| `/history/archive/matches/{archiveId}` | 200 | archive detail available; sampled record had null serve-stat block |

The six-request count includes `/usage`; the script's initial `request_budget: 5` label was off by one. The actual number of calls is six. No raw match rows, player names, API key, or provider response body was written to the artifact.

A null `stats` block on the one sampled archive record does not mean all archive matches lack serve statistics. The provider documents that recorded serve statistics exist from 1991 onward, but are absent for many earlier rows and are never synthesised.

## 3. What Basic actually includes

- **2023 to present:** completed match listing and per-match point-by-point tape. Model win probability and timestamps are present only on rows where the provider's model actually ran / points were observed. Completeness must be checked per match and against `/history/coverage`.
- **1968–2022:** results archive with winner/loser, final score, round, surface, tournament, ranks/seeds where recorded, and serve statistics where the source recorded them. Archive `event_date` is tournament start date, not the individual match date.
- **Player and aggregate endpoints:** archive bios, career aggregates and H2H are included in Basic.
- **Not included in core Basic:** monthly bulk packages (PRO); market prices and rankings listing (PRO); live in-play statistics, model analysis, and shot charting (ULTRA).
- **Important boundary:** reconstructed point-by-point tapes for 2013–2022 are not included in core Basic. The provider says these require core ULTRA or a separate active Historical Data API plan. Bulk archive-tape packages have a different, higher gate.

## 4. Rights and model-use decision

The current Terms of Use grant a limited license to access API responses and use them within the subscriber's own applications. They prohibit resale/redistribution of raw responses and scraping, caching, or storing data beyond what is reasonably necessary to operate the application. The provider retains ownership of its data compilation and model outputs.

The terms do not expressly grant a right to build and retain an offline training corpus or to train a separate commercial ML model on the raw historical data. Therefore:

- Do not bulk-download, persist, or use Live Tennis API records as the Tennis Value Scanner's training dataset unless JSB Holdings gives explicit written permission.
- Do not treat the provider's `win_probability_p1` / `danger` outputs as our own model labels or training targets.
- Basic can be considered for live operational lookups and per-match history within the application's normal operation, subject to the stated terms.
- Ask the provider for written clarification before any offline model training, persistent research archive, or derived-data retention beyond normal application operation.

Terms: https://livetennisapi.com/terms  
API reference: https://docs.livetennisapi.com/reference.html  
History archive: https://docs.livetennisapi.com/historical-results-archive.html  
Point-by-point guide: https://docs.livetennisapi.com/point-by-point-history.html

## 5. Next research direction

Keep Live Tennis API in the **operational-data candidate** category, not the model-training-corpus category, until written permission is received. For model development, continue prioritising sources whose terms expressly permit internal ML training and long-term research storage. No further historical API crawl is justified at this stage.


## 6. First archive inventory — 2026-11-22

A stratified inventory checked ATP and WTA archive queries across six eras. Each of the 12 queries returned HTTP 200, 20 sample rows, and `has_more=true`; one detail record per bucket also returned HTTP 200. The query's `meta.total` values are recorded below (these are endpoint-reported filtered totals, not independently deduplicated counts).

| Era | ATP reported rows | WTA reported rows |
|---|---:|---:|
| 1968–1979 | 48,752 | 36,783 |
| 1980–1989 | 53,341 | 58,575 |
| 1990–1999 | 169,551 | 104,712 |
| 2000–2009 | 229,899 | 140,951 |
| 2010–2015 | 169,117 | 121,719 |
| 2016–2022 | 182,010 | 170,307 |
| **Total reported by these 12 queries** | **852,670** | **633,047** |

The archive list schema consistently exposed result, player, surface, round, tournament, level, score, minutes, and event-start-date fields. Winner/loser ranking fields were present in the sampled rows in most later eras; the 1968–1979 WTA sample had no ranking values. The 12 first-detail samples all had `stats: null`. These were the first rows returned in broad era windows, not a random or representative serve-stat sample; this does NOT establish that later-era archive statistics are absent. The next targeted Grand Slam checks are designed to test that distinction.

The inventory made 25 calls in the first pass: 1 usage, 12 list queries, and 12 detail lookups. A follow-up run was triggered solely to correct the workflow artifact path; it repeated the same bounded 25 calls. No raw rows or names were retained in the repository. The artifact is `livetennis-archive-inventory` (1-day retention).

## 7. Interpretation for model work

The API reports a large ATP/WTA archive across all six eras, but do not treat the aggregate `meta.total` sum as a verified unique-row count until pagination and cross-era boundaries are reconciled. The archive's `event_date` is the tournament start date, not a match date. That is a material limitation for chronological Elo, rolling form, rest days, and leakage-safe backtests. We must not assign every match the tournament start date and pretend it is the match date.

The most useful near-term feature candidates are:
- player ranks at the time (where present and correctly defined);
- surface, round, tournament level, score and outcome;
- duration (minutes), with missingness assessed;
- per-match serve statistics only where the source recorded them (the provider says this begins in 1991, but coverage is uneven).

Before using the archive in a training corpus, obtain written permission for persistent retention and ML training. Until then, use bounded API analysis and metadata only.


## 8. Targeted Grand Slam / player endpoint checks — 2026-11-22

A follow-up run made 41 requests (25 inventory + 16 targeted checks; the script's declared budget of 37 was four too low). All 4 targeted Grand Slam list/detail, player-bio, and career-aggregate paths returned HTTP 200.

| Tour / era | Match detail | Serve stats | Player bio | Career aggregate |
|---|---:|---|---:|---:|
| ATP 1991–2000 | 200 | null in selected record | 200 | 200 |
| ATP 2016–2022 | 200 | present for winner and loser | 200 | 200 |
| WTA 1991–2000 | 200 | null in selected record | 200 | 200 |
| WTA 2016–2022 | 200 | present for winner and loser | 200 | 200 |

The 2016–2022 selected ATP and WTA Grand Slam records exposed aces, double faults, first-serve-in, first-serve points won, second-serve points won, serve points/games and break points saved/faced for both players. The 1991–2000 selected records had null stats; this reinforces that stats availability is match-specific and cannot be assumed solely from year.

The archive player endpoint returned bios with country, DOB, hand, height, career-high rank and date. The career endpoint returned overall and by-surface/by-level W-L, titles, yearly records, and aggregate serve totals/ratios. These are accessible under BASIC and potentially useful as player-profile features, but they are career aggregates over the archive, not time-frozen pre-match features. Using full-career aggregates in a historical backtest would leak future information unless the feature is rebuilt only from matches before the target match.

The run's report states 41 actual requests against a declared budget of 37; all returned checks succeeded. The account usage response showed Basic active and 994 daily calls remaining at its point of measurement. The discrepancy in the counter is documented; no more broad archive calls should be made until the next bounded task is defined.

## 9. Project decision — prepare the unified historical corpus before full model training

Decision dated 2026-11-22: complete source discovery, rights screening, data normalization, entity resolution, deduplication, and quality auditing before the main training campaign. Small diagnostic baselines may be used only to validate the pipeline; they are not the final model-training milestone.

### Source admission register

| Source | Current evidence | Intended role | Admission gate |
|---|---|---|---|
| Valuebetennis (2021–2026) | Local CSVs previously counted at about 478,606 rows; CC BY 4.0 | Core match results and chronology | Verify actual files, schema, duplicates, and attribution |
| Jeff Sackmann ATP/WTA (2021–2026 currently audited) | 12 CSVs; CC BY-NC-SA 4.0 | Independent result cross-check and features | Preserve attribution/share-alike; non-commercial use only unless separately cleared |
| TennisMyLife ATP/WTA | High linkage in prior audit; restrictive personal/educational/non-commercial terms | Supplementary player/event crosswalk and validation | Do not redistribute raw data; verify current terms and permitted local use |
| Live Tennis API Basic archive | Endpoint verified; reported archive totals are not deduplicated; event_date is tournament start date | Coverage/field research; possible training source only after written permission | Written permission required for durable archive retention and ML training; no bulk crawl before clearance |
| AcesAPI | Previously reviewed terms reportedly permit internal model training, with no resale/redistribution; free quota limited | Candidate supplementary results source | Recheck current terms, quota, coverage, and account access before ingestion |
| Data for Tennis | Previously reviewed terms reportedly permit commercial ML research/training and local research archive within entitlement; paid plans | Potentially strongest additional licensed source | No purchase or account commitment without explicit user approval; obtain current written plan/coverage details |
| Other providers | Not yet admitted | Gap filling only | Must add meaningful unique coverage and have explicit compatible rights |

### Corpus preparation rules

1. Keep each provider's raw files separate and immutable; never mix provider rows before provenance is attached.
2. Create a canonical match table with source, source match ID, tour, event, event date, match date (nullable), round, surface, level, best-of, player IDs, winner/loser, score, and field-level provenance.
3. Do not promote tournament-start dates to exact match dates. Archive rows without exact dates may be used only in analyses whose time ordering can be proven safe; otherwise exclude them from chronological model training.
4. Resolve player identities with stable crosswalk tables and confidence levels. Do not silently fuzzy-merge ambiguous identities.
5. Deduplicate using tour, normalized player pair, event identity, round, date evidence, and score; retain source links and conflict flags rather than deleting provenance.
6. Keep match outcomes separate from pre-match features. Career aggregates must be recomputed strictly from matches earlier than the prediction cutoff; full-career API aggregates are not valid historical pre-match features.
7. Treat missing serve statistics as missing, never as zero. Report coverage by tour, year, surface, level, and source.
8. Respect each source's license independently. A combined dataset does not erase non-commercial, attribution, share-alike, retention, or redistribution restrictions.

### Completion criteria before main training

- Source and license register complete; no unresolved source is silently included.
- Inventory by source/tour/year/level/surface with row counts, missingness, and date precision.
- Player and tournament crosswalks include confidence and ambiguity counts.
- Duplicate and conflicting-result report is produced with provenance preserved.
- Chronological eligibility flag is explicit for every match.
- Leakage audit confirms all pre-match features use information available before the target match.
- A reproducible, aggregate-only quality report is committed; raw licensed datasets and API responses are not committed to GitHub.

### Immediate next actions

- Inspect the research branch for existing local-data ingestion workflows and available source files without touching Production.
- Reuse existing Valuebetennis/Sackmann/TennisMyLife linkage results rather than repeat expensive scans.
- Continue Live Tennis API work only with narrowly scoped metadata/field checks until written ML/storage permission is received.
- Verify AcesAPI current entitlement and Data for Tennis licensing/coverage before any new download or payment.
- Build the canonical schema and quality gates first; then ingest sources that pass their rights gates.
