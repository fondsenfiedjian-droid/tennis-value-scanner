# Aggregator 1 — additional tennis dataset screening

**Review date:** 2026-11-22  
**Scope:** point-by-point, serve/return and public statistical sources discovered during follow-up research.  
**Policy:** screening only; no raw data downloaded or ingested, no account created, no paid access, and no Production changes.

## 1. Tennis Abstract Match Charting Project

- Repository: https://github.com/JeffSackmann/tennis_MatchChartingProject
- Coverage: more than 5,000 user-charted professional matches; men's and women's files; point-level shot type, direction, return depth, errors and match-level aggregate statistics.
- Useful fields: serve basics/direction/influence, return outcomes/depth, rally, shot types/directions, net points, key points.
- License: CC BY-NC-SA 4.0, explicitly non-commercial; attribution and ShareAlike required.
- Decision: **not eligible for commercial model training or commercial app integration** without separate written permission. Potential research-only reference, not an approved Aggregator 1 input.
- Source reviewed: repository README and license statement.

## 2. TennisVisuals / tennis-match-data

- Repository: https://github.com/TennisVisuals/tennis-match-data
- Point-by-point documentation: https://github.com/TennisVisuals/tennis-match-data/tree/master/point-by-point
- Describes validated point sequences, including doubles, with date, start time, tour, draw, server identities, winner, score, surface, duration and IOC codes. Point coding includes server/returner won, aces, double faults and (where richer files exist) second-serve markers.
- Repository was last pushed in February 2017. The root README describes basic, point-by-point and stats CSV collections.
- No repository LICENSE file was found in the checked root path, and the point-by-point README does not grant commercial rights.
- Decision: **do not ingest**. Historical coverage may be useful, but provenance, freshness, completeness and commercial reuse permission must be clarified with the maintainer first.

## 3. ppaulojr / tennis_pointbypoint

- Repository: https://github.com/ppaulojr/tennis_pointbypoint
- Describes roughly 74,000 matches as of April 2015, mainly ATP/WTA main draws since 2012–2013, with lower-tier coverage less complete.
- One row per match; point sequence encodes server/returner wins, aces and double faults; includes server identities, winner, score and tournament/date metadata.
- README explicitly warns about omissions, duplicate matches, misclassification and parsing errors; retirements are excluded.
- No LICENSE file was found in the checked repository root. README contains no explicit data-use grant.
- Decision: **do not ingest** until the owner confirms provenance and commercial model-training rights in writing. Public GitHub visibility is not a licence.

## 4. Public Live Tennis API outcome studies

- Study page: https://blog.livetennisapi.com/open-tennis-data
- Machine-readable aggregates: https://blog.livetennisapi.com/studies.json
- License: CC BY 4.0; the provider explicitly permits commercial use with attribution.
- Corpus: 116,382 completed best-of-three singles matches and 2,239,440 service games, 2023-01-01 through 2026-09-14.
- Available only as aggregate tables: first-set comeback rates, second-set score win probabilities, service hold rates and tiebreak frequency. No per-match rows in this public CC BY release.
- Provider reports known counting drift in two breakdowns and a smaller surface-eligible corpus (113,288 matches); published rates were said to reproduce within 0.02 percentage points.
- Decision: **eligible as an attributed aggregate benchmark/prior**, not as a row-level training dataset. Could be used later to sanity-check service-hold, comeback and tiebreak priors without importing restricted raw records.

## 5. Kaggle-derived ATP 2000–2026 CC0 claim

- A recent student repository reports a Kaggle dataset named “ATP Tennis 2000 - 2026 Daily update”, 68,963 matches / 17 columns, and labels it CC0: https://github.com/PeroPeki/machine_learning_erasmus
- This is a downstream project’s licence assertion, not sufficient evidence that the original underlying match records were independently created or that all upstream source rights were cleared. The Kaggle source and source provenance need separate verification.
- Decision: **not approved for ingestion yet**. Treat CC0 as unverified until the original Kaggle dataset card, exact files, provenance and source-specific conditions are checked.

## Screening outcome

| Candidate | Commercial model use | Data value | Decision |
|---|---|---|---|
| Match Charting Project | No, CC BY-NC-SA | Very high shot/serve detail, small sample | Exclude from commercial pipeline |
| TennisVisuals | Unclear; no explicit grant found | PBP + match metadata | Hold for permission/provenance |
| ppaulojr PBP | Unclear; no explicit grant found | ~74k older PBP matches | Hold for permission/provenance |
| Live Tennis API studies | Yes, CC BY 4.0 | Aggregate priors only | Use as benchmark if needed |
| Kaggle ATP CC0 claim | Unverified upstream rights | 68,963 ATP matches claimed | Hold pending provenance check |

## Practical conclusion

The only newly identified source in this screen that is clearly reusable commercially without an account or payment is Live Tennis API's aggregate studies. They are useful for calibration checks, not for expanding the historical match-level training corpus. The more detailed PBP collections are either non-commercial or lack a verified commercial licence. DataForTennis remains the strongest candidate for a future commercial point/statistics dataset, subject to the previously documented coverage and provenance checks.

No raw datasets or personal data were added to this repository.
