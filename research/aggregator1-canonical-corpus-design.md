# Aggregator 1 — Canonical historical corpus design

Status: design specification; no canonical match/player table has been materialized.
Branch: `research/aggregator1-linkage-audit`

## 1. Non-negotiable rules

1. Preserve every provider's raw source identity and provenance. Never overwrite source-native match or player IDs with a canonical ID.
2. Keep raw provider files immutable and separate. Derived tables must be reproducible from source manifests and versioned transformation code.
3. Do not silently delete duplicates, choose among ambiguous player links, or force-match missing identities.
4. Separate observed match outcomes, pre-match features, market prices, and post-match statistics into distinct logical layers.
5. A feature is eligible for a pre-match prediction only if its information timestamp is strictly earlier than the prediction cutoff.
6. Keep rights metadata attached to every source and derived dataset. A technical match is not permission to retain or train on the data.
7. Do not use Live Tennis API archive data for durable training until explicit written retention and ML-training permission is obtained. Sackmann/TennisMyLife restrictions must remain visible; no commercial use assumption.
8. Research-only changes stay on this branch. Production, Worker, secrets, and deployment remain untouched.

## 2. Proposed logical tables

### `source_manifest`
One row per acquired source file or API snapshot:
- `source_name`, `source_version`, `source_url`, `retrieved_at_utc`
- `file_name`, `sha256`, `row_count`, `schema_fingerprint`
- `license_id`, `rights_status`, `attribution_text`, `retention_limit`
- `raw_location` (private/local only; never a public artifact path)

### `source_match`
One row per original provider match record:
- source key: `source_name + source_match_id` (nullable only if source does not provide one)
- `tour`, `competition_tier`, `event_source_id`, `event_name_raw`
- `match_date_raw`, `match_date_precision`, `event_start_date`
- `surface_raw`, `surface_normalized`, `round_raw`
- `player1_source_id`, `player2_source_id`, raw player labels
- `winner_source_id`, score, duration, retirement/walkover flags
- `source_file`, `source_row_number`, `retrieved_at_utc`

Date precision must be explicit: exact match date, date-only, tournament-start proxy, or unknown. Never silently convert a tournament-start date into an exact match date.

### `player_crosswalk_edge`
One row per proposed identity edge:
- source player key and candidate canonical player key
- method: exact registry name, unique match evidence, verified DOB/country, or manual review
- confidence tier, supporting evidence count, conflicting evidence count
- `valid_from`, `valid_to` if source IDs or identities vary over time
- status: accepted, provisional, ambiguous, rejected
- reviewer and audit version

The 5,620 ATP and 7,191 WTA IDs with independent unique agreement are the highest-confidence candidate cohort, not yet promoted to accepted canonical identity. All ambiguous/conflicting IDs remain quarantined.

### `canonical_match_candidate`
One row per source-match-to-canonical-match candidate:
- source match key, canonical match candidate key
- matching method and evidence fields
- date difference and date precision
- player-edge statuses, event/surface agreement
- duplicate group ID and review status
- status: accepted, provisional, ambiguous, duplicate_candidate, rejected

A unique player-pair/date/surface candidate is not enough if the source date is only an event-start proxy. Preserve that uncertainty.

### `match_outcome`
Post-match-only facts:
- canonical match key, winner, score, duration, retirement/walkover
- result provenance and source disagreement flags

### `prematch_feature_snapshot`
Features calculated as-of a prediction cutoff:
- canonical player IDs, cutoff timestamp, target match key
- Elo overall and surface ratings from matches completed strictly before cutoff
- rolling form, rest, workload, H2H, age and ranking only when historically available as-of cutoff
- feature calculation version and source provenance

No full-career aggregates or end-of-season rankings may be copied backward into historical snapshots.

### `market_snapshot`
Separate from model features:
- bookmaker, market, selection, odds, captured timestamp
- odds source and freshness
- no post-match or closing price may be used if the target prediction timestamp precedes it

## 3. Admission gates

A source or derived feature cannot enter the training corpus until all applicable gates pass:

1. **Rights:** explicit permitted retention and ML training; attribution/share-alike and commercial restrictions recorded.
2. **Schema:** required fields and data types validated; unknown values retained explicitly.
3. **Identity:** source-native IDs preserved; ambiguous crosswalks quarantined.
4. **Chronology:** match-date precision and information timestamps known; no tournament-start proxy treated as exact.
5. **Duplicates:** source IDs and composite fingerprints audited; conflicting scores/winners reviewed.
6. **Coverage:** ATP/WTA and competition tiers reported separately by year.
7. **Leakage:** every feature proven available before the prediction cutoff.
8. **Reproducibility:** code version, source checksums, configuration, and aggregate QA report retained.

## 4. Current evidence and unresolved risks

- Valuebetennis 2021–2026: 478,606 rows; all have a match_id; 54 composite duplicate-candidate groups; 5 incomplete core-key rows.
- Valuebetennis–Sackmann expanded tier audit: 280,698 unique links (58.65% of 478,601 valid Valuebetennis rows); WTA 71.14%, ATP 49.81%. Coverage differs substantially by tier and should not be interpreted as a global source-quality score.
- Independent player-ID methods agree on 5,620 ATP and 7,191 WTA uniquely mapped source IDs; 62 ATP and 120 WTA IDs have conflicting match-evidence mappings and remain quarantined.
- Sackmann is CC BY-NC-SA 4.0. TennisMyLife has non-commercial/personal-educational restrictions. Live Tennis API offline archive retention and ML-training rights are not established. Do not assume these sources are commercially trainable.
- Valuebetennis is CC BY 4.0; preserve attribution.
- AcesAPI account and API key are now present. Its conditional rights and limited 2025 preflight evidence are documented in [`aggregator1-source-admission-update-2026-11-23.md`](aggregator1-source-admission-update-2026-11-23.md); that dated addendum supersedes the earlier account-status statement. AcesAPI is not admitted to the canonical corpus pending coverage, tier, identity, chronology, and upstream-rights validation.

## 5. Next implementation sequence

1. Complete duplicate-pair score/winner consistency classification without exporting row-level records.
2. Audit source ID stability across years and identify crosswalks with multiple name variants.
3. Split unmatched rows by tour, tier, year, surface, date-window reason, and missing registry coverage.
4. Build a private canonical crosswalk only after rights review; keep aggregate reports public to this research branch.
5. Add chronology/leakage tests for match-date precision and pre-match feature generation.
6. Only after source admission gates pass, materialize the canonical research corpus and run the main ATP/WTA training campaign.

No raw licensed match rows, player names, or player-level crosswalks belong in committed files or CI artifacts.
