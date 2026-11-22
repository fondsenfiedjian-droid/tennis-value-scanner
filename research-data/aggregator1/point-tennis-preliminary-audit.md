# Aggregator 1 — point.tennis preliminary source screen

**Review date:** 2026-11-22  
**Operator shown on site:** Setpoint Data Labs / GFI AI Software  
**Status:** public product page reviewed only. No account, API key, API calls, or paid plan.

## Official reference

- Product/API page: https://point.tennis/api
- Russian page: https://point.tennis/ru/api
- Documentation link is exposed on the product page, but the linked documentation did not resolve to a separate readable reference during this screen.

## Published coverage and features

The provider advertises:
- Match history since 1877.
- ATP, WTA, Challenger, ITF and team events.
- Final results and schedules, live scores and point-by-point updates.
- Player profiles, season statistics, career aggregates and H2H by surface.
- Current and historical weekly ATP/WTA rankings.
- Match statistics including aces, serve percentage, winners and break points.
- Historical point-level data for analytics/model use.
- Provider-generated TSR ratings/forecasts, which are proprietary and should not be treated as independent labels for validating our own model.

## Public pricing

- Free: 100 requests/day, final results and schedule.
- Startup: $49/month, 10,000 requests/day and live scores polled every 30 seconds.
- Pro: $199/month, 100,000 requests/day, live WebSocket and point-by-point data.
- Enterprise: custom.
No purchase or signup performed.

## Data-rights warning

The product page states that raw sporting facts are not copyright-protected in the provider's view, but explicitly says its merged/cleaned database, biographies, tournament descriptions, player portraits, TSR rating, probabilities and analytics are protected. This is not a substitute for reviewing the API terms, database rights, source restrictions, retention rights, commercial model-training permission and redistribution limits.

The public page markets a legal way to use the data in one's product and names analytics/model use cases, but the detailed contract was not verified in this review. Therefore this source is **not yet approved** for Aggregator 1 ingestion or commercial model training.

## Assessment

Technically promising because it advertises broad tour coverage, long match history, stats, rankings and point-by-point data. However, the free tier appears to provide only final results and schedule; deeper live/PBP features are on paid plans. The licensing position is not sufficiently documented in the material reviewed.

Next step if worthwhile: obtain and inspect the complete API terms and ask the provider in writing whether internal historical model training, persistent storage, commercial use in Tennis Value Scanner, and any derived feature retention are permitted, plus measured coverage by year/tour. Do not pay or integrate before written clarification.

No Production files, API keys, Worker configuration, scraper, or deployment were changed.
