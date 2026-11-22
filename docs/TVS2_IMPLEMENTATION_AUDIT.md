# Tennis Value Scanner 2.0 — initial implementation audit

Audit baseline: `main` at commit `d66260cce60294c1b6a48451a9ef96cd1f2b6c38` (2026-11-21).
Redesign work branch: `ui/tennis-value-scanner-2`.
Scope: read-only audit; no production code or model logic changed.

## Confirmed frontend structure

- The active PWA is a single-page `index.html` with embedded CSS and application JavaScript.
- `pfe.js` is loaded separately.
- `sw.js` caches the static shell; current cache name is `tennis-value-static-v133`.
- Existing bottom navigation has Главная, Матчи, Статистика, Настройки. The archive and statistics are currently combined in one `statsView`.
- The active UI includes a settings modal and local settings storage key `tvs-settings`; tournament filters also use `tvs-tours`.
- Odds and schedule caches are stored locally; prediction archive uses existing storage helpers and must be preserved.
- Main UI regression coverage is in `tests/app-ui.test.mjs`; the repository also has dedicated Worker, PFE, archive, model-research and other test files.

## Confirmed current UI / behavior mismatches with approved 2.0 concept

1. The current home page contains separate `#bestBet` and `#highestEv` panels. This duplicates the decision surface. The new design must have one primary plan, with strict recommendations and a separate watchlist.
2. Current `selectBestBet()` returns only one candidate (the first after sorting), not a list. The approved plan needs all recommendations passing the strict filter. This requires a carefully tested selector change, without changing the underlying probability or EV calculations.
3. Current `renderMatches()` filters the calendar to matches with a complete odds pair before rendering. This hides matches without odds. The approved design requires showing all relevant upcoming matches with explicit quote/data states instead.
4. Current `renderMatches()` also uses the visible match-card index to link model details and recommendations. When changing the filter/render behavior, preserve stable match identity and re-check all open-details behavior.
5. The header, settings, archive and match-card logic are tightly coupled to existing DOM IDs. Preserve IDs or update all references and regression tests in the same change.
6. Current settings cover EV/odds thresholds, tour filters, refresh interval and skin. No verified user-configured bankroll field is present in the inspected settings UI. Therefore the redesigned summary must not invent a bankroll or stake amount. Until a valid bankroll and an approved stake-sizing rule exist, show “Банк не задан” / “Сумма не рассчитана” rather than demo amounts.
7. Current settings contain an olive skin option; the new approved default direction is black/ruby/cyan/amber. Any removal or retention of the olive option should be treated as a visual preference change, not a model change.

## Existing behavior that must be preserved

- Worker API endpoints and request shapes.
- Live Tennis API and Apify odds feed, including quote freshness fields and diagnostics.
- Quote matching rules: same event, correct player mapping, competition/date compatibility, stale-quote rejection, and pair-skew checks.
- Elo prediction and cache-key behavior.
- PFE integration and existing archive writes/results checks.
- Settings persistence and refresh behavior.
- All existing archive data and local storage keys unless a migration is explicitly implemented and tested.
- Service-worker offline fallback and API non-caching behavior.

## Proposed safe implementation order

1. Extend UI tests first to lock current API/model contracts and test new presentation states.
2. Add the new visual tokens and shell on this branch.
3. Build a presentation adapter that maps existing match/prediction/quote data into:
   - all scheduled matches with quote status;
   - strict recommendation list;
   - watchlist / additional opportunities;
   - concise system status.
4. Change strict candidate selection from single-item return to a sorted list only after verifying all candidate fields and current caller behavior.
5. Recompose home page; keep model, Worker, Apify and archive paths unchanged.
6. Add a separate Matches view without hiding matches due to missing odds.
7. Only after the home page passes regression tests, implement Comparison, Statistics, Laboratory, and Archive/System navigation.

## Explicit non-goals for this first pass

- No changes to Elo/K-factor, PFE weights, probability calculation, EV calculation, or reliability scoring.
- No production deployment or merge to `main`.
- No automatic betting, bookmaker account integration, money movement, or stop-loss behavior.
- No assumption that example amounts from mockups are actual user settings.
