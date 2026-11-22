# TennisData.app — historical odds, statistics and point coverage assessment

**Review date:** 2026-11-22  
**Branch:** research/aggregator1-linkage-audit  
**Scope:** Public download page and current API documentation. No account, API key, endpoint request, data download or purchase.

## Executive result

TennisData.app offers a potentially valuable combination of historical match results, match-winner and first-set-winner odds, match statistics, point-score progression, odds movement observations and player performance aggregates.

However, the public documentation does **not** establish:
- consistent Winamax coverage;
- bookmaker-by-bookmaker historical odds completeness;
- season-by-season point-by-point completeness;
- a frozen historical pre-match snapshot of player form/statistics;
- a way to reconstruct all historical player-statistics values exactly as they were known before each past match.

Therefore it is promising for a controlled sample audit, but not yet approved as a complete historical odds/PBP training corpus.

## 1. Season CSVs — confirmed scope

Official page: https://tennisdata.app/downloads/

- ATP and WTA season CSV files are listed for 2021–2026.
- Each season file covers main tour and Challenger events.
- Free export: 49 columns; member export: 65 columns.
- Each player has a persistent unique ID across seasons.
- Match-winner odds and first-set-winner odds are included when available, usually closing-line odds.
- Provider says overall match coverage is above 95%, but does not publish a season-by-season denominator or an odds-coverage percentage in the page.
- Current-season CSV is updated hourly; live matches are excluded.
- Performance CSVs include published player rankings/totals for selected metrics and periods.
- Page explicitly says that not every match is guaranteed to be present.

Important distinction: the page confirms the presence of odds columns, not the percentage of matches with valid odds, the bookmaker/source behind each price, or a full historical odds movement tape.

## 2. API bookmaker odds — confirmed behaviour

Official API docs: https://tennisdata.app/tennis-api/docs/

Endpoint:
`GET /v1/{circuit}/match/{local_id}/odds`

- Pre-match odds only; no live/in-play odds.
- Updated a few times per hour.
- Grouped by market, stage, group, bookmaker and selection.
- Returns bookmaker display name and availability, but no stable provider bookmaker identifier.
- Decimal odds plus fractional/American formats where recorded.
- Markets/bookmakers vary by match; absent sections return 404.
- No query filters on this endpoint.
- The API describes odds as current match data, not a frozen historical snapshot.

Odds movement endpoint:
`GET /v1/{circuit}/match/{local_id}/odds-movements`

- Chronological pre-match observations for match-winner and first-set-winner markets.
- Includes Unix timestamp, price, market probability and movement direction.
- The documentation explicitly warns that the endpoint reads the current match movement history, including observations after prediction evaluation; it is not a frozen historical snapshot.

### Winamax-specific conclusion

No public documentation reviewed confirms Winamax is present consistently, historically or for a defined percentage of ATP/WTA/Challenger matches. The API returns bookmaker names but no stable bookmaker ID. A sample would need to establish:
- whether Winamax appears at all;
- exact display-name variants;
- coverage by tour, season, event level and surface;
- whether both sides are available;
- whether odds are pre-match and timestamped;
- whether the CSV odds columns identify their bookmaker or only provide generic prices.

Until verified, do not treat TennisDataApp as a Winamax historical odds source. It may still provide a comparison-market benchmark if the bookmaker is identified and coverage is sufficient.

## 3. Match statistics — useful feature family

API endpoint:
`GET /v1/{circuit}/match/{local_id}/stats`

- Available after the match ends, not live.
- Returns only recorded stages and metrics; missing sections can return 404.
- Includes parsed values/percentages and made/attempted ratios when recorded.

Player season / last-52-week / last-10 reports contain surface and competition-level splits and document metrics including:
- aces and double faults;
- first-serve-in percentage;
- first- and second-serve points won;
- service points won;
- service games won/played;
- first- and second-serve return points won;
- return points and return games won/played;
- break-point chances and conversions;
- break points faced and saved;
- pressure points and match points saved/faced;
- winners, unforced errors and net points where recorded;
- match duration and other performance patterns.

The aggregate reports expose sample counts. Metric coverage can be smaller than the report's total match count. Null/missing values must not be treated as zero.

### Critical temporal-leakage issue

The API offers saved season, last-52-week and last-10 player reports, but its public documentation does not provide a historical as-of date query or point-in-time snapshot archive for these reports. Reports have a `generated_at` field and source-match count; that does not prove that a 2024 report can be reconstructed exactly as it existed before each 2024 match.

For a valid historical backtest:
- do not attach today's player profile, current season aggregate, last-52-week or last-10 report to old matches;
- do not use post-match statistics as pre-match predictors for that same match;
- only derive rolling features from raw completed matches with strict timestamp cutoffs, or use documented point-in-time snapshots;
- preserve report generation timestamps and source windows if using provider aggregates for live inference.

The 65-column member export may have additional fields, but its exact historical time semantics must be inspected before use.

## 4. Point-by-point — narrower than full point data

Endpoint:
`GET /v1/{circuit}/match/{local_id}/points`

The docs describe clean point-score progression grouped into sets and games. Fields include:
- set and game number;
- cumulative game score;
- serving side;
- side that lost serve;
- last-scoring side;
- point-score strings (0/15/30/40/advantage).

The provider says only recorded clean points are returned and missing sequences are not reconstructed from the final score.

This is useful for score-state, serve-order, break and momentum features, but it is **not** a full shot-by-shot or tracking feed. No serve speed, rally length, ball coordinates or ordered shot trajectory is documented in this endpoint.

The public docs do not state a historical completeness percentage for this endpoint. Treat PBP coverage as unknown until measured from a sample.

## 5. Cost and request-budget implications

The API docs currently state:
- match list/basic match/odds/stats/points/odds movements: 1 unit per call;
- player statistics, direct H2H and prepared predictions: 30 units per call;
- successful responses and authenticated 404 responses consume units;
- rate limit: up to 3 calls per rolling second.

A full match record plus odds, stats, points and movements costs 5 calls / 5 units when all sections are present. Missing sections can still incur a unit. Player-statistics reports are much more expensive at 30 units each.

Do not estimate acquisition cost from the nominal match count alone. First sample availability and decide which endpoints are actually necessary.

## 6. Recommended sample audit — only after explicit user approval

A small, authorized sample should measure:
1. ATP and WTA separately.
2. Main tour vs Challenger.
3. Each year from 2021 through 2026.
4. Surface and tournament level.
5. Odds availability for match winner and first set.
6. Exact bookmaker-name variants, especially Winamax.
7. Both-side price completeness and timestamp availability.
8. Match-statistics availability and metric-level null rates.
9. Point-by-point availability, point counts and complete-game/set progression.
10. Player IDs, duplicate matches and linkage to Valuebetennis/Sackmann.
11. Whether member CSVs contain any time-stamped pre-match features.
12. Whether historical odds and player features are point-in-time safe.

No sample request should be made until user explicitly authorizes account/key creation or supplies a lawfully obtained sample.

## Decision

**TennisData.app is a strong candidate for historical results, odds columns, player IDs and post-match statistical enrichment. It is not yet verified as a Winamax archive or a complete point-by-point corpus.**

For the current value-betting model, its most immediate potential value is:
- historical generic match-winner / first-set closing odds;
- stable player IDs and match joins;
- serve/return aggregates built from prior matches;
- selective score-progression features.

The main blocker is not the advertised feature list; it is measured coverage, source/bookmaker identity and point-in-time correctness.

## Production boundary

Research only. No Production code, model calculations, API keys, Cloudflare Worker, Winamax scraper or deployment changed.
