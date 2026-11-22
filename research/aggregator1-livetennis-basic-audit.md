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

## 10. Additional provider review — 2026-11-22

### AcesAPI: admitted as the next free research candidate, subject to a small sample audit

Current official documentation states:
- ATP/WTA singles results from 2007 to current; main draws from 2007 and qualifying from 2022; 124,000+ matches.
- Match records include exact `match_date` / `starts_at`, tournament ID, surface, round, player IDs, set and tiebreak scores, retirements and walkovers.
- Weekly rankings are partial (roughly 35–49 lists per tour/year; top 100–150).
- Overall and surface-specific Elo values are supplied before and after each match.
- No serve statistics are provided.
- 500 free credits/month, no card; individual calls cost 1–5 credits.
- The provider's published rights guidance explicitly permits storing retrieved data while the account is open, deriving values, research, backtesting, and training own models. It prohibits reselling/redistributing the dataset/feed and building a competing data service. It says internally stored data can continue to be used for internal research/backtesting after cancellation.

Assessment: unusually useful complementary candidate because it offers exact match dates and time-indexed pre/post-match Elo, unlike the Live Tennis archive's tournament-start date limitation. It overlaps Valuebetennis/Sackmann heavily for 2007 onward, so the goal is not to count its 124k rows as 124k new matches; it is to validate chronology, IDs, rankings and Elo feature semantics, and fill genuinely missing records. No account/key has been created and no data has been fetched. Next step should be a minimal free sample after account creation, with no paid upgrade.

Official sources:
- https://acesapi.com/
- https://acesapi.com/docs/timing-and-rights
- https://acesapi.com/docs

### Data for Tennis: high-potential, not yet admitted

The current site describes historical match data, ordered points, player/tournament analytics and versioned releases. Pricing lists Starter at $39/month (100,000 requests), Developer $79, Pro $139, Scale $199; point-by-point data starts at Pro, and timestamped PBP is listed at Scale. The FAQ says API plans include commercial use, but the precise rights to retain raw historical data and train models must be checked in the actual Terms before any purchase. Its published coverage front page currently advertises six seasons / 346 tournament editions / 274 editions with point records (updated 2026-09-11), so do not assume it is a century-long results archive.

Decision: keep as a potentially strong paid source for point-level features and reproducible releases, but do not spend money or create an account until its license and the incremental coverage are verified against our current sources.

Official sources:
- https://datafortennis.com/
- https://datafortennis.com/faq
- https://datafortennis.com/pricing
- https://datafortennis.com/contact

### Revised source priority

1. Existing Valuebetennis + Sackmann + TennisMyLife datasets: inventory and normalize first; no new paid source required.
2. AcesAPI free tier: next provider to sample because published terms expressly cover internal model training and exact match dates; first verify its real overlap and missing-match contribution.
3. Live Tennis API Basic: retain the completed bounded research; request written permission before persistent raw archive or model training.
4. Data for Tennis: license/coverage diligence only until user explicitly approves any purchase.
5. Reject any source whose terms prohibit automated analysis/model training (including TennisData results site terms currently reviewed).

No API keys, raw provider responses, or match-level datasets are stored in this audit.


## 11. First full Valuebetennis–Sackmann run — 2026-11-22

The research-branch GitHub Actions run `45080868022` completed successfully against the downloaded source files. A second run with expanded year-level diagnostics, `45080868022`, also completed successfully. Raw CSVs remained in the temporary runner; only the aggregate JSON and source checksum manifest were uploaded as a short-lived artifact.

### Verified inventory and conservative linkage

- Valuebetennis: 6 files (2021–2026), 478,606 rows; 478,601 passed the current basic row checks.
- Sackmann: 12 files (ATP/WTA main-draw results, 2021–2026), 30,885 rows total (ATP 16,105; WTA 14,780).
- Candidate pairs: 25,199; uniquely linked: 24,591 (5.14% of valid Valuebetennis rows); ambiguous: 608; no candidate: 453,407.
- Tour split: WTA 198,356 rows, 11,456 unique links (5.78%); ATP 280,250 rows, 13,135 unique links (4.69%).
- Among accepted links, the median date offset was 2 days and the 90th percentile was 5 days. This is consistent with the fact that Sackmann's `tourney_date` is generally the event-week date, not the exact match date.
- Current checks found no invalid Valuebetennis dates, unknown tours, or unknown surfaces.

### Year-level linkage

| Year | Valuebetennis rows | Unique links | Linkage |
|---|---:|---:|---:|
| 2021 | 63,728 | 4,531 | 7.11% |
| 2022 | 83,381 | 4,460 | 5.35% |
| 2023 | 89,826 | 4,675 | 5.20% |
| 2024 | 79,910 | 3,970 | 4.97% |
| 2025 | 80,412 | 4,859 | 6.04% |
| 2026 | 81,349 | 2,096 | 2.58% |

### Interpretation and limits

This is not yet a valid measure of full-dataset overlap. The current Sackmann download includes only `atp_matches_YYYY.csv` and `wta_matches_YYYY.csv` main-draw files. It does not include the archive's qualifying, Challenger, Futures, or other tier-specific files. Valuebetennis contains a much broader match inventory, so the 5.14% figure substantially understates potential overlap across all levels. Do not use this number to reject either source or to estimate how many Valuebetennis matches are absent from Sackmann.

The audit script now emits year-level counts and a privacy-safe schema/level diagnostic (column names and aggregate value frequencies for categorical fields, never player names or match rows). This diagnostic is being used to determine the tournament-level composition of Valuebetennis before broadening Sackmann ingestion.

### Next controlled steps

1. Complete the aggregate Valuebetennis category/level inspection.
2. Expand Sackmann only to the relevant qualifying/Challenger/Futures files, after verifying file availability and tier semantics; preserve the same temporary-runner/raw-data policy.
3. Re-run linkage by tour, year, and competition tier. Do not loosen player/date matching until tier coverage is corrected.
4. Add a canonical match registry only after the source-level and identity crosswalks are sufficiently understood. Every row must retain source ID, date precision, tier, and provenance; ambiguous links remain separate.
5. Keep TennisMyLife quarantined from model-training inputs until its restrictive license is cleared for the intended use. Do not bulk-download Live Tennis API history until written retention/training permission is received.


## 12. Valuebetennis competition-level composition and expanded Sackmann coverage — 2026-11-22

The full aggregate schema inspection identified why the first overlap result was misleading:

| Valuebetennis category | Rows | Share |
|---|---:|---:|
| ITF | 278,278 | 58.1% |
| Challenger | 151,398 | 31.6% |
| Main tour | 23,091 | 4.8% |
| Grand Slam | 11,113 | 2.3% |
| Masters | 10,839 | 2.3% |
| Davis Cup / BJK Cup | 1,168 | 0.2% |
| Empty category | 2,719 | 0.6% |

The first comparison used only Sackmann main-draw files, so it compared a dataset dominated by ITF and Challenger matches against a narrow main-tour archive. That is the primary known coverage mismatch; the 5.14% linkage rate is not a meaningful estimate of total source overlap.

The source repository inventory was checked directly. For 2021–2026 it contains:
- ATP main-draw files;
- ATP qualifying/Challenger files (`atp_matches_qual_chall_YYYY.csv`);
- ATP Futures files (`atp_matches_futures_YYYY.csv`);
- WTA main-draw files;
- WTA ITF qualifying files (`wta_matches_qual_itf_YYYY.csv`).

The research workflow has now been expanded to download these 30 Sackmann files (5 series × 6 years), in addition to the six Valuebetennis files. The audit parser already recognizes the tier-specific filenames and reports row counts by tour/tier/year. This expanded run is the next decisive overlap measurement.

Important residual gap: the inspected Sackmann WTA archive lists WTA main-draw and ITF qualifying files, but no separate WTA ITF main-draw series. Therefore even the expanded Sackmann comparison will not fully cover the 278,278 Valuebetennis ITF rows. The expanded result must be interpreted by tier, not as complete coverage.

Valuebetennis schema fields confirmed: `match_id`, `date`, `tournoi`, `tournoi_id`, `categorie`, `genre`, `surface`, `tour`, player names and IDs, opening/closing odds, winner ID, score, and duration. This provides useful source-native IDs and match metadata for a future canonical registry. Odds and outcomes must remain segregated from pre-match model features to avoid target leakage.

Surface distribution: clay 213,143; outdoor hard 207,997; indoor hard 42,804; grass 9,967; carpet 4,695. All five surface labels are recognized by the current normalization map.


## 13. Expanded all-available Sackmann tier audit — 2026-11-22

The expanded 30-file download and aggregate linkage run completed successfully (run `45081063910`).

### Inventory

| Sackmann series | Rows |
|---|---:|
| ATP main draw | 16,105 |
| ATP Futures | 88,988 |
| ATP qualifying / Challenger | 56,740 |
| WTA main draw | 14,780 |
| WTA ITF qualifying | 160,487 |
| **Total** | **337,100** |

### Updated linkage

- Valuebetennis valid rows: 478,601.
- Candidate rows: 289,039.
- Uniquely linked rows: 280,698 (58.65%).
- Ambiguous rows: 8,341.
- No candidate: 189,567.
- WTA unique linkage: 141,115 / 198,351 valid rows (71.14%).
- ATP unique linkage: 139,583 / 280,250 rows (49.81%).
- Median accepted date offset: 2 days; p90: 4 days.
- Invalid dates, unknown tours, and unknown surfaces remained zero.

This is a major correction to the first main-draw-only audit: adding ATP Futures, ATP qualifying/Challenger, and WTA ITF qualifying raised unique linkage from 5.14% to 58.65%. This confirms that source coverage tier was the dominant cause of the earlier low result. It still does not mean all 189,567 unmatched rows are missing from Sackmann: remaining differences can include absent WTA ITF main draws, unrepresented levels, naming/ID mismatch, round/date differences, or genuine source gaps.

The next diagnostic now breaks linkage down by Valuebetennis `categorie` (ITF, Challenger, Main tour, Grand Slam, Masters, Davis/BJK Cup, empty) so the remaining mismatch can be attributed by competition tier rather than guessed from the overall rate. The raw inputs remain temporary; the report contains aggregate statistics only.


## 14. Competition-category linkage breakdown — 2026-11-22

The category-level audit completed successfully (run `45081163906`):

| Valuebetennis category | Rows | Unique links | Linkage |
|---|---:|---:|---:|
| ITF | 278,278 | 132,873 | 47.75% |
| Challenger | 151,398 (5 rows fail basic player-name validity) | 111,179 | 73.44% |
| Main tour | 23,091 | 18,237 | 78.98% |
| Grand Slam | 11,113 | 9,111 | 81.99% |
| Masters | 10,839 | 8,507 | 78.49% |
| Davis Cup / BJK Cup | 1,168 | 790 | 67.64% |
| Empty category | 2,719 | 1 | 0.04% |

The largest residual gap is clearly in ITF: 141,532 ITF rows have no accepted unique link, and 3,873 are ambiguous. This is consistent with the known absence of WTA ITF main-draw files in the inspected Sackmann archive; ATP Futures and WTA ITF qualifying files do not fully cover the entire ITF inventory. Challenger linkage is materially higher, but 36,729 Challenger rows still have no candidate and 3,490 remain ambiguous.

Main-tour, Grand Slam, and Masters linkage is approximately 78–82%, not 100%. These residuals require separate investigation of source coverage, tournament naming, date offsets, and player-name variants. Do not relax matching or force ambiguous rows into the registry.

The next useful breakdown is tour × category (ATP ITF vs WTA ITF, ATP Challenger vs WTA Challenger, etc.). This will isolate the WTA ITF main-draw gap from other missing records before canonical match-level links are created.


## 15. Tour × competition-category breakdown — 2026-11-22

The latest full audit (`45081305445`) completed successfully with the new ATP/WTA-by-category diagnostics.

| Tour / category | Valuebetennis rows | Unique links | Linkage |
|---|---:|---:|---:|
| WTA ITF | 77,646 | 55,431 | 71.39% |
| ATP ITF | 200,632 | 77,442 | 38.60% |
| WTA Challenger | 96,895 (96,890 valid) | 68,327 | 70.52% |
| ATP Challenger | 54,503 | 42,852 | 78.62% |
| WTA Main tour | 11,070 | 8,508 | 76.86% |
| ATP Main tour | 12,021 | 9,729 | 80.93% |
| WTA Grand Slam | 5,548 | 4,409 | 79.47% |
| ATP Grand Slam | 5,565 | 4,702 | 84.49% |
| WTA Masters | 5,475 | 4,228 | 77.22% |
| ATP Masters | 5,364 | 4,279 | 79.77% |
| ATP Davis/BJK Cup | 737 | 579 | 78.56% |
| WTA Davis/BJK Cup | 431 | 211 | 48.96% |

### Interpretation

- The biggest unresolved volume is ATP ITF: 121,225 rows have no candidate and 1,965 are ambiguous. The current Sackmann ATP Futures series is not necessarily a complete equivalent of all ITF events in Valuebetennis; event/tier coverage needs an explicit inventory before interpreting these as missing matches.
- WTA ITF links 71.39%, but 20,307 rows have no candidate and 1,908 are ambiguous. The available Sackmann WTA ITF file is qualifying-only, so this result does not prove complete WTA ITF main-draw coverage.
- Challenger coverage is better: ATP 78.62%, WTA 70.52%. Remaining no-candidate counts are 10,020 ATP and 26,709 WTA; these may reflect source coverage, event naming, and player-name identity differences.
- ATP/WTA main-tour and Grand Slam linkage is around 77–84%. This is a useful starting point for cross-source identity reconciliation, but not yet enough to merge records automatically.
- The blank Valuebetennis category remains a separate data-quality problem: 2,719 rows (1,428 ATP and 1,291 WTA) have no category. They should not be silently assigned a tier.
- All audited records still have parseable dates, recognized tours and mapped surfaces. The five Challenger rows with invalid player-name fields remain excluded from valid-row linkage.

### Decision

Do not create canonical match links from aggregate percentages alone. Next inspect the Valuebetennis category blanks and quantify why candidate matches are not accepted (zero candidate vs multiple candidates, event-name disambiguation, and date offset). Then build a versioned match registry that stores source-native IDs and confidence/ambiguity state, rather than overwriting source identities. Keep the main model training blocked until tier coverage, date semantics, and licensing are documented.


## 16. Reasons for unmatched rows and diagnostic test coverage — 2026-11-22

The latest expanded audit run `45082493444` completed successfully after adding explicit unmatched-row reason counters. The totals reconcile exactly:

| Reason | Rows without an accepted unique link |
|---|---:|
| Player pair absent from Sackmann under exact normalized full-name matching | 178,460 |
| Same player pair exists, but no matching surface | 2,870 |
| Same player pair and surface exist, but all candidate dates are outside ±14 days | 8,232 |
| Invalid/missing player pair in Valuebetennis | 5 |
| **Total no-candidate rows** | **189,567** |

These are diagnostic classes, not proof that all 178,460 matches are absent from the archive. Exact normalized full-name matching can miss aliases, initials, alternate transliterations, name changes, and source-specific spellings. The 2,870 surface mismatches may include surface coding inconsistencies. The 8,232 date-window misses need separate inspection of date semantics and source event weeks before changing the window.

The latest full audit retained the same conservative linkage totals: 280,698 unique links (58.65%), 8,341 ambiguous candidates, and 189,567 no-candidate rows. Accepted links have median date offset 2 days and p90 4 days; the ±14-day bounds are a guardrail, not a match-date equivalence.

### Code and validation

- The aggregate audit now separates pair-absent, surface-absent, date-window-miss, and invalid-player-pair cases.
- The diagnostic fields are emitted at aggregate category and tour × category level; no player names, individual match rows, or raw CSVs are exported.
- Synthetic fixtures now cover unique matches, tournament-based ambiguity resolution, no matching player pair, date-window misses, unknown surfaces, and malformed player pairs.
- Latest research fixture workflow `45082521630` completed successfully.
- Latest full data audit workflow `45082493444` completed successfully.
- Only aggregate report and source manifest are retained as the workflow artifact; raw data remain temporary.

### Next data-engineering step

Build an explicit player identity crosswalk before changing match matching:
1. Preserve each source-native player ID and source-native name.
2. Use independently supported identifiers (for example, ATP/WTA registry IDs and birth dates where licensed and available) to map aliases.
3. Never infer a player ID from name similarity alone when multiple candidates exist.
4. Keep unresolved and conflicting aliases in a review queue.
5. Re-run the same match audit with the crosswalk and report how many links are genuinely added, not merely re-labelled.

Do not use TennisMyLife raw files in the training corpus without permission for the intended retention and model-training use. Do not bulk-ingest Live Tennis API archive data until written permission on retention/training is obtained. Sackmann remains CC BY-NC-SA 4.0 and must stay separately attributed and non-commercial unless the rights holder grants otherwise.


## 17. Direct Valuebetennis player-ID crosswalk baseline — 2026-11-22

A new aggregate-only audit compared Valuebetennis player IDs and names against the Sackmann ATP/WTA player registries. It supports both first-last and last-first name order, strips Unicode diacritics and punctuation, and does not use fuzzy or initials matching.

| Tour | Valuebetennis player IDs | Unique name-based candidate IDs | Ambiguous | Unmapped |
|---|---:|---:|---:|---:|
| ATP | 14,185 | 6,942 (48.94%) | 134 | 7,109 |
| WTA | 9,790 | 7,472 (76.32%) | 630 | 1,688 |

- Valuebetennis contains 478,606 match rows and 957,212 player observations. All observations have a source player ID; one observation lacks a player name.
- Sackmann registries parsed successfully: ATP 66,912 rows (66,864 with ID and name); WTA 70,571 rows (all valid). The registries contain 130,853 distinct normalized ATP name-order keys and 132,807 WTA keys.
- Some normalized registry name keys map to multiple Sackmann player IDs (1,900 ATP and 3,703 WTA keys, counting first-last and last-first forms separately). These remain ambiguous and are not force-mapped.
- The result is a baseline, not an authoritative identity crosswalk. Common names and historical name collisions are the main known ambiguity source; exact-name misses may reflect abbreviations, alternate spellings, or incomplete registry coverage.

### Next refinement

Use accepted match-level evidence to resolve identities where the exact player pair, surface, and date window produce one unique Sackmann match. That evidence can map both Valuebetennis player IDs to the corresponding Sackmann winner/loser IDs without fuzzy matching. Compare it against the direct registry baseline and count agreements, conflicts, and additional resolved IDs. Keep all row-level mappings ephemeral and publish only aggregate diagnostics until licensing and identity quality are fully cleared.

The full dataset workflow now downloads the two Sackmann player registries and emits only an aggregate player-ID report. Its synthetic player-ID tests pass. The report and checksum manifest are retained; raw CSVs remain temporary.


## 18. Player ID evidence from accepted match links — 2026-11-22

The match audit now also derives an aggregate-only player crosswalk from accepted unique match links. For each accepted Valuebetennis–Sackmann match, the two Valuebetennis source player IDs are associated with the Sackmann winner/loser IDs using exact normalized name orientation. No row-level mappings are exported.

Latest full audit run: `45083261249` — success.

| Tour | Distinct Valuebetennis player IDs | IDs with accepted match evidence | Resolve to one Sackmann ID | Conflicting IDs |
|---|---:|---:|---:|---:|
| ATP | 14,185 | 5,741 | 5,679 (40.04%) | 62 |
| WTA | 9,791 | 7,812 | 7,692 (78.56%) | 120 |

- Both player IDs were present on all 280,698 accepted unique match links.
- WTA has one more distinct Valuebetennis player ID here than in the direct name-registry audit because this method counts source IDs even when a player-name observation is missing.
- Match-evidence mapping is stronger than a bare name lookup because it uses a uniquely accepted match pair, surface, date window, and event disambiguation. It is still a candidate crosswalk, not a final truth table.
- Conflicting source IDs (62 ATP, 120 WTA) must remain quarantined. Possible causes include source ID reuse, source/player identity changes, or a mistaken match link; do not choose one ID automatically.
- The direct registry baseline and match-evidence baseline should be compared at source-ID level before any crosswalk is used in the canonical registry.

### Next validation

Add aggregate conflict-multiplicity diagnostics and compare direct name-registry assignments against accepted-match assignments. Report agreement, disagreement, and one-sided coverage separately. Keep raw source-ID mappings only in temporary runner memory/files and never upload them as artifacts. Once the crosswalk is stable, use it to improve match linkage and re-run the same tier-by-tier audit.


## 19. Direct registry vs accepted-match player ID comparison — 2026-11-22

The latest combined audit run `45083548490` completed successfully. It compares two independent candidate identity signals for each Valuebetennis player ID:
1. Exact normalized full-name lookup against the Sackmann player registry (both first-last and last-first order).
2. Identity evidence from accepted unique Valuebetennis–Sackmann match links, using the Sackmann winner/loser IDs.

| Tour | Source player IDs | Both methods uniquely agree | Both methods uniquely disagree | Direct-only unique | Ambiguous in either |
|---|---:|---:|---:|---:|---:|
| ATP | 14,185 | 5,620 (39.62%) | 0 | 1,322 | 134 |
| WTA | 9,791 | 7,191 (73.45%) | 0 | 281 | 630 |

Additional method totals:
- ATP: direct registry unique 6,942; match-evidence unique 5,679.
- WTA: direct registry unique 7,472; match-evidence unique 7,692.
- Neither method yields a unique mapping for 7,109 ATP and 1,689 WTA IDs.
- Match-evidence unique mappings do not conflict with direct unique registry mappings in this audit. This is a useful independent consistency check, not proof that every accepted match is correct.

### Interpretation and decision

The zero-disagreement result is encouraging: where both methods independently return exactly one Sackmann ID, they agree for 5,620 ATP and 7,191 WTA source IDs. Those IDs form the highest-confidence candidate crosswalk cohort.

Do not promote all direct-only IDs automatically. They lack accepted match corroboration in the current 2021–2026 overlap. Keep them marked as name-only candidates. Likewise, keep all 134 ATP and 630 WTA IDs ambiguous in a review queue; do not select among multiple IDs based on name similarity alone.

The next refinement should focus on:
- why 1,322 ATP and 281 WTA IDs have a unique name-registry candidate but no accepted-match evidence;
- whether some of the 134/630 ambiguous IDs can be resolved with birth date, country, handedness, or additional independently linked match evidence;
- whether source IDs remain stable across years and do not map to multiple Sackmann IDs over time.

No player-level mappings have been committed or uploaded. The audit emits only aggregate counts. Raw CSVs and any in-memory ID sets remain temporary in the GitHub runner. The synthetic linkage and player-ID tests pass; the full aggregate audit and artifact upload succeeded.


## 20. Biographical profile of conflicting match-evidence IDs — 2026-11-22

A follow-up audit compared the Sackmann player biographies for source IDs that mapped to multiple Sackmann IDs through accepted unique matches.

| Tour | Conflicting source IDs | Same DOB and country across candidate IDs | Different DOB or country | Missing biography fields |
|---|---:|---:|---:|---:|
| ATP | 62 | 26 | 1 | 35 |
| WTA | 120 | 16 | 0 | 104 |

Interpretation:
- The 26 ATP and 16 WTA cases with the same date of birth and country may be duplicate/alias registry entries, but this is not enough to merge them automatically.
- One ATP conflict has differing birth date or country and should be treated as a high-priority identity conflict.
- Most remaining conflicts cannot yet be profiled because one or more core biography fields are missing.
- The conflict fixture explicitly tests that two Sackmann IDs with the same displayed name but different birth date/country are not silently merged.

Decision: retain every conflicting source ID in quarantine. The next review should compare all available biography fields (birth date, country, hand, height) and event-level match evidence, while preserving separate source IDs. Do not automatically collapse duplicate-looking Sackmann records.


## 21. Valuebetennis duplicate and key-integrity audit — 2026-11-22

The new duplicate audit ran across all six Valuebetennis files (2021–2026), alongside the full Sackmann linkage audit. Latest run: `45084139894` — success, including aggregate report validation and artifact upload.

### Aggregate findings

| Check | Result |
|---|---:|
| Match rows | 478,606 |
| Rows with a source match_id | 478,606 (100%) |
| Repeated match_id groups | 0 |
| Conflicting match_id groups | 0 |
| Repeated composite match fingerprints | 54 groups |
| Excess rows in those fingerprint groups | 54 (0.01% of source rows) |
| Rows belonging to flagged fingerprint groups | 108 |
| Invalid core fingerprint fields | 5 |

The composite fingerprint uses tour, calendar date, tournament ID (preferred) or normalized tournament name, surface, and the unordered player pair. It is a conservative duplicate candidate key, not a deletion instruction.

### Distribution of rows in flagged fingerprint groups

| Year | Rows in flagged groups |
|---|---:|
| 2021 | 22 |
| 2022 | 18 |
| 2023 | 22 |
| 2024 | 12 |
| 2025 | 34 |
| 2026 | 0 |
| **Total** | **108** |

| Tour | Rows in flagged groups |
|---|---:|
| ATP | 70 |
| WTA | 38 |

All 54 groups contain exactly two records under the current fingerprint. No source `match_id` is repeated, so the candidates are separate source records with distinct match IDs. They may represent duplicated fixtures, revised/imported records, or rare same-day same-event rematches. The aggregate-only audit intentionally does not export match IDs, player names, or row-level pairs; therefore none is automatically removed.

The five invalid-core rows are all WTA. They are excluded from composite fingerprinting but remain in the source dataset pending inspection of missing fields. The yearly distribution is 4 in 2023 and 1 in 2026.

### Data admission decision

- Keep all 478,606 source records intact and immutable.
- Add a duplicate-review status to the future canonical match registry; do not deduplicate solely from this fingerprint.
- Preserve the original `match_id` and provider provenance.
- Review the 54 candidate pairs and five incomplete rows locally in a rights-compliant environment before admitting them to a clean modelling table.
- Keep the source audit report aggregate-only; raw CSV files remain temporary in the workflow runner.

The audit's yearly/tour breakdown now distinguishes excess duplicate rows from all rows belonging to flagged groups, avoiding confusion between those two counts.


## 22. Duplicate candidate outcome consistency — 2026-11-22

The duplicate audit was extended to compare detected score/result and winner columns inside each of the 54 composite fingerprint groups. The full run `45084342218` completed successfully, with syntax checks and synthetic fixtures passing.

| Diagnostic | Groups |
|---|---:|
| Composite fingerprint groups | 54 |
| Groups with conflicting score/result values | 2 |
| Groups with conflicting winner values | 10 |
| Groups with identical payload across every column except match_id | 0 |

The 54 groups contain 108 records (70 ATP, 38 WTA). All have distinct source match IDs; there are still zero repeated match_id groups. The result/winner conflict flags mean that a fingerprint match alone is not sufficient to collapse the records. They may indicate inconsistent source rows, corrections, or edge cases in the composite key. The audit does not choose a preferred record.

Next, inspect which source columns were detected for score and winner comparison, then refine the review logic to distinguish a true result contradiction from alternate score formatting, player-side orientation, or missing fields. Keep every candidate pair quarantined until that distinction is resolved.


## 23. Tournament-name agreement among accepted match links — 2026-11-22

The accepted match links were re-audited for tournament-name agreement. Full audit run `45084636545` succeeded.

| Accepted-link event comparison | Rows |
|---|---:|
| Unique accepted match links | 280,698 |
| Exact normalized tournament-name match | 182,131 (64.9%) |
| Tournament-name mismatch | 98,567 (35.1%) |
| Source event missing | 0 |
| Sackmann event name unavailable | 0 |

This is a significant unresolved quality issue. The current algorithm accepts a single player-pair/surface/date candidate even if the tournament names differ. A mismatch may be a legitimate alias, a naming convention difference, or a false match to another event in the 14-day window. It must not be silently treated as correct.

Decision:
- Keep the 280,698 links as candidates, not all final canonical links.
- Before promoting any link to accepted canonical match status, diagnose tournament-name mismatches.
- Add a top aggregate list of normalized tournament-name mismatch pairs (without player names, match IDs, or row-level records) to identify systematic alias patterns.
- Expand explicit tournament aliases only when supported by repeated, unambiguous evidence.
- Re-run linkage and measure how many mismatches are resolved, how many candidates become ambiguous, and whether any links are rejected.

This check reinforces why the 58.65% linkage rate is a candidate-linkage statistic, not a verified match-level accuracy score.


## 24. Duplicate candidate score-orientation and winner-identity refinement — 2026-11-22

The duplicate audit now distinguishes score orientation from material score disagreement and checks whether different winner IDs still refer to the same Valuebetennis player identity. Run `45084701092` completed successfully, including aggregate validation and artifact upload; synthetic fixtures for both checks passed.

| Refined diagnostic across 54 fingerprint groups | Groups |
|---|---:|
| Score/result values differ | 2 |
| Score differences explained only by reversing set-score orientation | 0 |
| Material score conflicts after allowing orientation reversal | 2 |
| Score conflict unresolved due to missing/unsupported format | 0 |
| Winner IDs differ | 10 |
| Winner IDs differ but map to the same source player | 10 |
| Winner IDs map to different source players | 0 |
| Winner identity unresolved | 0 |

Interpretation:
- The 10 winner-ID discrepancies do not appear to change the actual winner identity when the source winner ID is checked against the two source player IDs. They are likely ID/record variants, but the records still remain candidates until the crosswalk is accepted.
- Two groups have genuine score-field disagreements even after allowing a simple player-side score reversal. These require manual review; do not select one result automatically.
- No fingerprint group is byte-identical across every source column except `match_id`.

This narrows the review queue: 52 groups have no detected score disagreement, while 2 have material score conflicts. It does not establish that the other 52 are safe to merge; event/round/date semantics and source provenance must still be checked.


## 25. Tournament-name mismatch taxonomy and alias refinement — 2026-11-22

The aggregate mismatch list from run `45084782450` showed that many leading discrepancies are systematic naming variants rather than obviously different events. Examples include:
- Grand Slam city suffixes: Australian Open Melbourne / Australian Open; French Open Paris / French Open; US Open New York / US Open; Wimbledon London / Wimbledon.
- Sponsor and venue variants: Mutua Madrid Open Madrid / Madrid; Internazionali BNL d'Italia Rome / Rome; BNP Paribas Open Indian Wells / Indian Wells; Rolex Paris Masters Paris / Paris.
- Same tournament under a sponsor/city title versus a short city name: Miami Open Miami / Miami; China Open Beijing / Beijing; Dubai Duty Free Championships Dubai / Dubai; Shanghai Rolex Masters Shanghai / Shanghai Masters.
- Challenger naming: `... Challenger` versus Sackmann's `... CH` convention.
- ITF venue suffixes in a small set of examples: M15 Naples / M15 Naples FL; W35 Boca Raton / W35 Boca Raton FL.

A conservative explicit alias list was added for repeated, recognizable tournament pairs from this audit, including Grand Slam venue suffixes, selected Masters/500 events, and the observed Challenger suffix convention. Synthetic tests confirm that a venue-suffixed Grand Slam name normalizes to the corresponding Sackmann event.

This alias update is a normalization change only; it does not widen the 14-day date window or use fuzzy event matching. The next full run measures its effect on exact event agreement and on ambiguous/accepted links. Unfamiliar mismatch pairs remain diagnostic and are not auto-aliased.


A potentially ambiguous `M15 Naples` / `M15 Naples FL` pair was deliberately **not** promoted to an alias: the city name alone is insufficient to rule out another Naples event. It remains a mismatch until country/venue or independent event-ID evidence confirms identity. This illustrates the policy: exact, well-supported aliases only; ambiguous city matches stay unresolved.
