# Aggregator 1 full audit — findings and next actions (2026-11-23)

## Run and provenance

- GitHub Actions run: 68
- Run ID: 45091504800
- Result: success
- Branch: research/aggregator1-linkage-audit
- Commit audited: f72a1e8ec685bc037cacf528229b4ca26777a27b
- Artifact: aggregate reports and source checksums only; raw source files were not uploaded.
- Download timestamp: 2026-11-23T00:54:54Z

## Corpus inventory

The run processed 478,606 Valuebetennis rows from 2021–2026 and the downloaded Sackmann ATP/WTA match and player-registry files. Five Valuebetennis rows failed the core player-pair validity check. No invalid dates, unknown tours, or unknown surfaces were reported.

Sackmann match-source rows in this run:
- ATP main: 16,105
- ATP Futures: 88,988
- ATP qualifying/Challenger: 56,740
- WTA main: 14,780
- WTA qualifying/ITF: 160,487

These are downloaded source row counts, not official schedule denominators. No year is certified complete. 2026 is a partial snapshot.

## Match linkage

Conservative linkage uses exact normalized unordered player-name pair, exact normalized surface, and a date window of ±14 days around Sackmann event-week date. Tournament names resolve multiple candidates but are not required for a unique candidate. No fuzzy or initials matching is used.

Totals:
- Valid Valuebetennis rows: 478,601
- Candidate rows: 289,039
- Unique links: 282,821 (59.09% of valid rows)
- Ambiguous: 6,218
- No candidate: 189,567
  - Pair absent from downloaded Sackmann source: 178,460
  - Surface absent: 2,870
  - Outside date window: 8,232
- Date offset among unique links: median 2 days; 90th percentile 4 days; range −14 to +14 days.
- Accepted links with exact event-name match: 252,996
- Accepted links with event-name mismatch: 29,825

By tour:
- WTA: 198,351 valid; 141,422 unique links; 71.30%.
- ATP: 280,250 valid; 141,399 unique links; 50.45%.

By Valuebetennis category:
- Grand Slam: 82.63% (9,183 / 11,113)
- Masters: 80.96% (8,775 / 10,839)
- Main tour: 80.20% (18,518 / 23,091)
- Challenger: 74.41% (112,653 / 151,393)
- ITF: 47.76% (132,901 / 278,278)
- Davis/BJK Cup: 67.64% (790 / 1,168)
- Empty category: 0.04% (1 / 2,719)

By year:
- 2021: 66.52%
- 2022: 68.34%
- 2023: 67.24%
- 2024: 68.40%
- 2025: 62.16%
- 2026: 22.63% — partial snapshot; not comparable as a completed season.

Event-name mismatch is diagnostic, not automatically a failed link. The largest recurring differences include location suffixes, sponsor/event branding, and category naming (for example M15 Naples vs M15 Naples FL, St Tropez vs Saint Tropez, and WTA 125 naming). Do not expand aliases without collision checks and evidence.

## Player-ID crosswalk audit

The audit compared normalized full names in Valuebetennis with Sackmann ATP/WTA player registries. It did not use initials or fuzzy matching.

- Valuebetennis player observations: 957,212
- Missing source player IDs: 0
- Missing player name: 1
- ATP distinct source IDs: 14,185; resolved 6,942 (48.94%); ambiguous 134; unmapped 7,109.
- WTA distinct source IDs: 9,790; resolved 7,472 (76.32%); ambiguous 630; unmapped 1,688.
- Registry name collisions: ATP 1,900; WTA 3,703.

A name-only hit is not an authoritative identity assertion. Before any crosswalk is admitted, independently validate DOB, country/IOC, and hand where available. Preserve all source-native IDs; never overwrite them. The unexpectedly high collision counts make a blind name-based merge unsafe.

## Duplicate and integrity audit

- All 478,606 rows have a match_id.
- No repeated match_id groups or duplicate match_id rows.
- 54 composite fingerprint groups (108 rows; 0.01%).
- Two groups have material score conflicts.
- Ten groups have winner-field differences, but the winner maps to the same player side.
- No unresolved winner identity conflicts.
- Five invalid core rows.
- Do not automatically delete or collapse fingerprint matches; inspect event/round/provenance and source revisions first.

## Interpretation and decision

1. The overlap is useful for cross-source validation, but it is not a complete canonical match corpus.
2. ATP ITF/Futures coverage and the missing WTA ITF main-draw source are structural limitations of the downloaded Sackmann files, not necessarily matching-code defects.
3. The 29,825 accepted links with event-name mismatches justify a separate alias-diagnostics pass. They do not justify broad fuzzy event matching.
4. The player-ID audit is a candidate crosswalk only. Resolve collisions using independent attributes before joining player histories or Elo timelines.
5. The duplicate audit found a small number of cases requiring manual/source-level review; no deduplication should be automatic.
6. Do not train the main ATP/WTA model yet. First improve source-tier coverage, validate player identity, inspect score conflicts, and enforce strict as-of chronology.
7. Do not merge any research output into Production. No raw datasets are retained in the repository or uploaded as artifacts.

## Next offline work

- Build an aggregate-only player identity diagnostic that quantifies how many ambiguous registry name collisions can be separated by DOB, IOC/country, and hand, without exporting names or IDs.
- Produce a ranked event-alias candidate report with counts and collision risk; aliases must be explicit and reviewed.
- Add focused fixtures for player crosswalk collisions and event-alias collision handling.
- Keep all work in this research branch and use only already-downloaded/offline data. No paid API calls or provider requests.
