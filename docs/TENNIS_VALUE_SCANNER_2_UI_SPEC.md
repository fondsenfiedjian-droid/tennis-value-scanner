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
