# AcesAPI preflight findings — 2025 first-page sample

Date: 2026-11-23  
Workflow run: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45089497322  
Artifact: `aggregator1-acesapi-preflight-report`  
Scope: exactly two live `get_matches` requests (ATP + WTA), 100 rows each, expected cost 4 credits. No raw match payloads were retained in the artifact.

## Observed results

| Tour | Rows | Date range returned | Main | Qualifying | Surface |
|---|---:|---|---:|---:|---|
| ATP | 100 | 2024-12-28 to 2025-01-05 | 56 | 44 | Hard 100 |
| WTA | 100 | 2024-12-27 to 2024-12-31 | 40 | 60 | Hard 100 |

All 11 reported core fields were present on all 100 rows for each tour: match_id, tournament_id, match_date, player1_id/name, player2_id/name, surface, draw, score and sets.

Both pages returned `next_offset: 100`. Therefore each response is only the first page, not a complete 2025 season. The observed dates cluster around the year boundary and do not provide a representative seasonal sample. The fact that every sampled row is hard must not be interpreted as a surface-coverage result.

## What this establishes

- The key works and both ATP/WTA requests succeeded.
- The REST response contains the expected `data.matches` shape.
- Player IDs, tournament IDs, dates, surfaces, draw labels and score fields were populated in this sample.
- Pagination is available: subsequent pages use the returned `next_offset` as the next request's `offset`.

## What it does not establish

- Full-year or multi-year coverage, total match counts, or coverage by surface.
- Coverage of Challenger, Futures or ITF tournament tiers.
- Match linkage quality against Valuebetennis/Sackmann. The CI workflow deliberately deletes raw sample payloads and retains only aggregate statistics, so no row-level comparison can be made from this artifact.
- Complete qualification coverage. The published source scope says qualifying from 2022, but this must be audited empirically by year and draw.
- A reliable tier label. The match schema exposes tournament_id, tournament name and draw; it does not expose an explicit ATP 250/500/1000, Challenger or ITF category. The tournament catalogue exposes dates, surface and a Grand Slam boolean, but not a full tournament-tier taxonomy.

## Documentation findings

- `get_matches` costs 2 credits and accepts `season`, `league`, `limit` and `offset`; response includes `next_offset`.
- `list_tournaments` costs 1 credit and exposes tournament ID, name, dates, city/country, surface, indoor flag, major flag and main-draw match count. This helps map events but does not provide a full tour-level category.
- Public coverage statement: singles main draws from 2007 and qualifying from 2022; no explicit comprehensive Futures/Challenger/ITF guarantee.
- The source's published volume is approximately 124,000+ finished singles matches across both tours. This is a provider-wide headline figure, not a verified year/tier coverage table.

## Audit/code review conclusions

1. Do not use the first-page sample to calculate coverage percentages or to infer a season's surface mix.
2. A proper coverage audit requires bounded, paginated season pulls or event-level slices, with hard caps set before any live run.
3. To link rows with Valuebetennis, run the exact-name-pair + exact-surface + date-window audit inside the same ephemeral CI job while raw files exist. Export only aggregate linkage metrics; do not upload raw source data.
4. For event tier, first build a separate event catalogue crosswalk. Do not infer tier from `draw=main/qualifying`, tournament name alone, or Grand Slam boolean.
5. Before any broader acquisition, estimate the number of pages/cost from an initial bounded count and ask for approval. No additional API requests were made as part of this review.

## Decision

AcesAPI passes the technical connectivity and basic schema preflight. It remains a **candidate supplementary source**, not yet an approved historical archive or a demonstrated solution for the ATP Challenger/Futures and ITF gaps. Keep Production unchanged and do not begin model training from this sample.
