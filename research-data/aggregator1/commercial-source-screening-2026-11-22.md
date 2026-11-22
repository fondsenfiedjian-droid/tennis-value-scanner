# Aggregator 1 — commercial data-source screening update
Date: 2026-11-22
Branch: `research/aggregator1-linkage-audit`

## Executive result

No newly discovered public tennis point-by-point archive was cleared for commercial model training. The strongest current commercial candidates remain Data for Tennis and TennisData.app, but neither has yet passed a complete provenance/coverage validation and neither has been ingested.

Production, the live Worker, the deployed frontend, and the current prediction model were not changed.

## Data for Tennis — commercial-use terms confirmed; coverage remains conditional

Official sources:
- Terms: https://datafortennis.com/terms
- Coverage: https://datafortennis.com/coverage
- Point/stat data model: https://docs.datafortennis.com/data-model/points-scores-and-statistics
- Challenger release documentation: https://docs.datafortennis.com/data-model/challenger-data

Confirmed in the current Terms (last updated 2026-10-05):
- Sections 5.1–5.3 expressly permit commercial research, feature engineering, training/evaluation/operation of the user's own statistical or ML models, and use in commercial applications.
- Commercial display of relevant match facts/statistics in a substantive application is permitted.
- Raw/bulk machine-readable redistribution, a substitute feed/database, or exposing reusable API access is prohibited without express written permission.
- Lawfully acquired copies may generally be retained and used after subscription expiry, subject to the same restrictions.
- Section 7(c) allows authorized retrieval for permitted research/model training but prohibits systematic extraction/reconstruction outside the accepted entitlement.
- Crucial limitation: the provider says it does not grant third-party rights it does not hold. Its records can be incomplete, reconstructed or delayed, and it does not promise complete seasons, point sequences, every field or continuing supply from a particular source.

Coverage page snapshot dated 2026-09-11:
- 346 tournament editions across six seasons.
- 274 editions with point records.
- The table is edition-level and field-specific (PBP, rally, serve speed, match stats); the default page view shows only a paginated subset, not a downloadable full coverage census.
- These headline counts are not a match-level completeness guarantee.

Separate Challenger release `research-challenger-20261007-v1`:
- 62,213 distinct Challenger men's singles matches, main draw and qualifying, 2019 through 2026-10-07.
- 6,731,406 accepted point rows and 4,904,566 metric rows.
- Only 42 matches with observed PBP in 2020; coverage rises to 8,745/8,757 in 2022, 10,177/10,302 in 2025 and 9,688/9,736 in 2026.
- Accepted point rows do not mean complete PBP. Quality may remain partial/unknown; relative clocks are not UTC.
- This is a separate Challenger release and must not be added to or conflated with the 11,875-match / 1,669,201-point landing-page archive inventory.

Data-quality rules that matter for training:
- Distinguish `source_observed`, `derived_terminal`, and `penalty` point records.
- Nullable server/outcome/score means unresolved, not inferable.
- Metrics are versioned and may carry numerator/denominator; do not average ratios without operands.
- Presence of many points or a final score does not prove full match replay.

Assessment: keep as the leading candidate for a future, carefully scoped commercial pilot, especially serve/return and point-derived features. Before any paid purchase or account/key setup, obtain a precise release-level coverage/provenance statement and test a free sample. No account, key, API request, export or purchase has been made.

## TennisData.app — terms permit commercial ML, but retrieval/provenance blocker remains

Official sources:
- Terms: https://tennisdata.app/terms/
- Downloads: https://tennisdata.app/downloads/
- API docs: https://tennisdata.app/tennis-api/docs/

Current published Terms expressly permit lawfully obtained data to be downloaded, stored, processed, combined, transformed and analyzed for commercial purposes, including training, testing and evaluating statistical/ML models. They permit commercial exploitation of independently created model outputs and dashboards, but prohibit redistribution of raw CSVs, substantial reproductions, or a materially equivalent substitute dataset/feed. API access is subject to the selected plan and limits.

Important unresolved issues:
- The download page has previously returned HTTP 403/security challenge to the non-invasive automated request. Do not bypass it, guess hidden download URLs, or automate around the challenge.
- User has already emailed support@tennisdata.app asking for an approved bulk-download route; response is pending.
- The Terms do not transfer third-party rights that the provider does not own or license. Source-level provenance/rights for each data family still need confirmation.
- No CSV schema, checksums, actual row counts, match-level overlap or field coverage has been independently verified in this audit.
- No account, key, API request, paid plan or download was initiated.

Assessment: legally promising on the face of the provider's Terms, technically blocked pending the provider's reply and provenance clarification. Keep on hold; do not treat advertised coverage as verified.

## Newly screened exclusions

### Tennis Results / ATP Tennis Data
Terms: https://results.tennisdata.com/en/terms-and-conditions

The published terms prohibit commercial use without a licence and expressly reserve against text/data mining, scraping, and using the data to develop, train, fine-tune or validate odds feeds, statistical models or AI systems. Exclude from the commercial model pipeline unless a separate written licence is obtained.

### Live Tennis API public point-by-point archive
Dataset: https://doi.org/10.5281/zenodo.23018680
Research page: https://livetennisapi.com/data/academic

The public sample is CC BY-NC 4.0. It is useful for non-commercial research only, not the commercial Tennis Value Scanner model. The user's access request for the separate academic archive remains pending; this source stays outside the commercial pipeline.

### Sackmann Grand Slam point-by-point / Match Charting Project
Sources:
- https://github.com/JeffSackmann/tennis_slam_pointbypoint
- https://github.com/JeffSackmann/tennis_MatchChartingProject

The relevant datasets are published under non-commercial terms (CC BY-NC-SA 4.0). The Match Charting Project has unusually rich shot-level features, but its licence does not clear commercial model training. Exclude unless separately relicensed.

### TennisMyLife
Public terms restrict the datasets to personal, educational and non-commercial research. Commercial training/validation requires prior express written permission. Keep out of the commercial pipeline pending such permission.

## Current source disposition

| Source | Commercial model training | Data/technical status | Decision |
|---|---|---|---|
| Data for Tennis | Expressly permitted by its Terms, within entitlement and third-party rights | Good structured point/stat model; coverage varies by release/edition | Leading pilot candidate; validate provenance and sample first |
| TennisData.app | Expressly permitted by its Terms for lawfully obtained data | Download access blocked pending provider response; source provenance not verified | Hold pending support reply |
| AcesAPI | Terms permit internal research/model training | Selective historical match/profile/Elo data; third-party provenance caveat | Secondary enrichment candidate; no account/API use |
| Live Tennis API archive | No, CC BY-NC 4.0 | Very broad PBP match index; non-commercial archive | Research-only, excluded from commercial pipeline |
| Sackmann / Match Charting Project | No, CC BY-NC-SA 4.0 | Historical results / rich shot-level samples | Excluded unless relicensed |
| TennisMyLife | No under public terms | Strong ATP/WTA overlap; non-commercial only | Excluded unless written permission |
| Tennis Results | No without licence; TDM/AI training expressly prohibited | Website terms prohibit scraping and automated mining | Excluded |

## Next work

1. Continue screening datasets/APIs for explicit commercial training rights and identifiable data provenance.
2. Wait for the already-sent TennisData.app support reply; do not retry blocked downloads by circumvention.
3. If a no-cost Data for Tennis account/sample is desired, obtain the user's explicit approval before account creation because it requires personal details and a private key. No paid access without separate explicit approval.
4. Do not change Production or ingest any unapproved dataset.
