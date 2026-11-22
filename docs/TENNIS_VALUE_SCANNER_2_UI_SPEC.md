# Tennis Value Scanner 2.0 — approved UI redesign

Status: approved concept; implementation begins on an isolated branch.
Branch: `ui/tennis-value-scanner-2`
Production baseline: `main` remains unchanged during the redesign.

## Product objective

Turn the mobile home screen into a daily decision and stake-plan dashboard. The interface must show what the current production system recommends, why it qualifies, the recommended amount when it can be calculated safely, and the combined exposure. It must not create recommendations merely to fill the screen.

## Approved visual system

- Near-black background with graphite panels.
- Deep ruby/crimson is the primary accent; reduce pink to zero or near-zero.
- Cool cyan is reserved for system/data status.
- Amber/gold is reserved for odds, EV and financial values.
- Thin, restrained luminous outlines; subtle edge glow only.
- High readability on a phone; no heavy neon fills, excessive animation, or green theme.
- Respect reduced-motion settings.

Suggested tokens:
- background: #08090D
- panel: #14151B
- panel-raised: #1B1C23
- ruby: #8F1F2B
- ruby-bright: #B52B38
- cyan: #36B8D0
- amber: #E3B455
- text: #F0F1F4
- muted: #9DA3AE
- border: #353640

## Approved home-screen composition

1. Compact header: product name/version, dynamic API status, settings entry.
2. Daily plan summary:
   - count of strict/system-qualified recommendations;
   - total recommended stake amount;
   - bankroll value only when explicitly configured and available;
   - total planned exposure / bankroll percentage only when both inputs are valid.
3. Primary section: **Обязательные ставки** (system-qualified recommendations).
   Each item should show match, selected side, bookmaker, current quote and freshness, model probability, EV, confidence/data-quality indicators, and recommended stake amount when safely calculable.
4. Secondary section: **Дополнительные возможности** (watchlist, not yet strict-qualified).
   Each item must state why it is not in the primary plan and what confirmation/condition is missing.
5. Compact system/data status and refresh control.
6. Mobile bottom navigation: Главная, Матчи, Сравнение, Статистика, Ещё. The last item contains Лаборатория and Архив/Система.

The former separate “Ставка дня” and “EV дня / рисковый шанс” cards must not remain as duplicate top-level destinations. The best strict-qualified candidate may be highlighted within the primary plan, but the plan is the central object.

## Recommendation semantics and financial safety

- “Обязательные” means that a recommendation passed the configured strict system rules; it is not a command, guarantee, or requirement to gamble.
- “Дополнительные возможности” are not included in the strict plan total.
- Zero qualifying recommendations must render as zero; never manufacture a pick.
- Do not calculate/display current EV from stale, incomplete, mismatched, or invalid odds.
- Distinguish source retrieval, quote freshness, unique matches, complete two-sided markets, and matches actually evaluated.
- Do not invent a bankroll. If the user has not configured one, show “Банк не задан” and do not display an exposure percentage.
- Stake sizing is advisory only. No automatic bet placement, money movement, bookmaker account control, or silent stake changes.
- Do not introduce automatic stop-loss, losing-day blocks, or bankroll protection rules.
- Any future stake-sizing work must be isolated from the production prediction model and validated before use.

## Navigation / information architecture

- Главная — daily plan and concise data status.
- Матчи — all relevant upcoming matches, including matches without odds, with explicit data/odds states.
- Сравнение — independent two-player dossier, not dependent on a scheduled match or bookmaker odds.
- Статистика — prediction quality and, where properly recorded, simulated/real betting performance; keep these categories separate.
- Ещё — Лаборатория and Архив/Система.

## Migration constraints

- Preserve existing API contracts, Worker behavior, odds ingestion, Apify task/scraper, prediction calculations, Elo baseline (K=32), PFE and existing archive data.
- No production deployment from this branch during the initial UI migration.
- Audit existing DOM IDs, event handlers, local storage / IndexedDB schemas, service-worker cache behavior, and regression tests before replacing or removing UI elements.
- Prefer progressive refactoring over a full rewrite. Keep existing behavior wired to its current controls until equivalent new controls are tested.
- Keep experimental models (including K=80 and new SAS modules) out of production predictions.

## Initial implementation sequence

1. Inventory current screens, DOM IDs, event listeners, settings, storage, API calls, and tests.
2. Add the new design tokens and responsive shell on this branch.
3. Recompose the home screen while preserving existing functional IDs and behavior wherever possible.
4. Add/adjust regression tests for navigation, recommendation grouping, empty states, odds freshness, and financial display fallbacks.
5. Build the other screens incrementally after the home screen passes tests.
6. Review the diff and CI before any merge/deployment.

This document records the approved product direction. It does not authorize changes to prediction logic or automatic gambling actions.


## Player comparison view — implementation details

- The bottom navigation has five destinations: Главная, Матчи, Сравнение, Статистика, Ещё.
- Сравнение is independent of a scheduled match and bookmaker market. It compares two player profiles through the existing `/predict` endpoint using the active Elo model; it does not change the production prediction model.
- Each side accepts a player name and Live Tennis API player ID. When the player appears in the currently loaded schedule, the interface can resolve the ID from that schedule by name. For players outside the loaded schedule, the user must provide the ID manually.
- The result shows both Elo ratings, model win probabilities, fair odds, rating type and rating freshness. Surface can be selected; the default is the general Elo profile without a surface filter.
- The screen explicitly states that injuries, recent form, H2H and serve statistics are not yet included. No bookmaker EV or bet recommendation is generated by this comparison view.
- The Ещё menu opens application settings; the existing statistics/archive and laboratory diagnostics remain under Статистика for this migration stage.


## Comparison dossier — data-access audit (2026-11-22)

The official Live Tennis API contract was checked before expanding the comparison view:

- `GET /players?search=...` is FREE and supports player-name lookup. The TVS2 Worker proxy validates input and caches successful searches for 15 minutes.
- `GET /players/{playerId}` is FREE and returns the player's bio, current official singles ranking, tour/country metadata, profile completeness and cached profile statistics. The existing comparison already fetches these profiles through `/predict` to obtain Elo; future ranking/profile fields should be exposed from that same response rather than triggering duplicate profile requests.
- `GET /players/{playerId}/stats` is PRO-only. It provides completed-match W/L records, surface splits, set-based records and recent matches (2023 onward); its optional `serve_return` block is ULTRA-only. The Worker currently has a guarded proxy route, but the free plan must not assume this endpoint is accessible. A 403 must be represented as “тариф не предоставляет данные”, not as zero statistics or a player failure.
- The API's player statistics are computed from the provider's own completed singles-match coverage, not a complete career record. Any UI must show the period, source, sample size and coverage limitation.
- Injury / medical-retirement analysis is not established by the current free profile response. Do not infer an injury from a withdrawal, missing match or stale profile. Add a dedicated source only after its endpoint, tier and coverage are verified.

Implementation order for the comparison dossier:
1. Expose FREE profile fields already fetched by `/predict` (official singles rank, tour, country, profile completeness and rating as-of date) without a second API request.
2. Display recent-form / W-L data only if the existing plan actually returns it; otherwise show an explicit tier/coverage limitation and keep the Elo comparison usable.
3. If PRO access is ever enabled, use the existing `/player-stats` proxy for recent results and surface splits; keep ULTRA-only serve/return fields separately labelled and optional.
4. Treat H2H, injury status, motivation and protected ranking as independent evidence modules. No empty value may be converted into a neutral score or a fabricated zero.

The current implementation remains on the draft branch. This audit changes no production endpoint, prediction calculation or API subscription.


## Historical-form access boundary — BASIC subscription confirmed 2026-11-22

The user has confirmed that the active Live Tennis API subscription is BASIC ($9.99/month). The earlier FREE-only assumption in this document is superseded. The exact live key entitlement should still be confirmed through the quota-exempt `GET /usage` response before any historical data workflow is activated.

BASIC unlocks:
- `GET /history/matches`: completed matches from January 2023 to the present, filterable by player roster ID, tour, draw and date range.
- `GET /history/coverage`: measured completeness by tour and draw.
- `GET /h2h`: head-to-head across the 1968–2022 results archive and the provider's completed matches from 2023 onward.
- `GET /history/archive/matches`, `/history/archive/players` and `/history/archive/career`: historical results and career aggregates for 1968–2022.
- `GET /history/matches/{matchId}`: match-level point-by-point tape where available.

PRO-only:
- `GET /players/{playerId}/stats`: prebuilt player W/L records, surface splits, set-based records and recent matches (2023 onward).
- Match events, market prices and bulk history packages.

ULTRA-only:
- Serve/return aggregates and advanced live/statistical feeds.

Implementation decision:
1. Use BASIC `/history/matches?player={id}&draw=singles&limit=...` to build the last 5, 10 and 20 completed-match form windows. Derive wins/losses from the published winner field and show the actual sample size, date range, tour and surface. Never fill missing matches or infer a result.
2. Use BASIC `/h2h?p1={name}&p2={name}` for head-to-head. Because the endpoint resolves name fragments, verify that the returned player names match the selected comparison players before displaying the result. If ambiguous or mismatched, show unavailable rather than a misleading H2H.
3. Use `/history/coverage` to qualify the completeness of the source. Do not present the 2023+ provider history as a complete career record.
4. Cache history and H2H responses, avoid routine polling, and keep API errors / 403 / 429 visible as access or availability states.
5. Keep form, surface form and H2H as separate evidence modules. They do not alter the production Elo K=32, its probabilities, EV, PFE or reliability calculations.
6. Keep `/player-stats` dormant on BASIC. A PRO-only 403 must not be translated into zero values or a missing-player error.

This correction supersedes the earlier FREE-only tier assumption. It does not authorize a subscription change, production deployment, PR merge or modification of the production model.

## BASIC completed-match proxy — implementation note (2026-11-22)

The TVS2 Worker now exposes `GET /player-history?id={playerId}&limit=20&tour={optional}` as a cached, read-only proxy to BASIC `GET /history/matches`.

- It always requests `draw=singles`; supports optional `tour=atp|wta|challenger|itf|juniors`.
- `limit` defaults to 20 and is capped at 50 for the comparison use case; provider maximum is 200.
- Successful responses are cached for six hours and preserve the provider's `data` and `meta`, with source and period labels (2023–present).
- 403 is reported as `basic_history_not_entitled`; 401, 429, invalid query and malformed payloads remain distinct.
- The endpoint deliberately returns source rows rather than manufacturing derived statistics. The next layer must validate participant identity and winner mapping before deriving last-5/10/20 form or surface splits.
- The proxy is on the TVS2 draft branch only. No Production Worker deployment, PR merge, frontend wiring or Elo/model change has occurred.
