# Aggregator 1 — AcesAPI source assessment

**Review date:** 2026-11-22  
**Status:** public documentation and terms reviewed; no account created, no API key requested, no API calls made, no paid plan purchased.

## Official references

- Product and coverage: https://acesapi.com/
- Data atlas: https://acesapi.com/docs/atlas
- Terms of Service: https://acesapi.com/terms
- Pricing: https://acesapi.com/ (pricing section)

## Published coverage

AcesAPI advertises 124,000+ completed ATP/WTA singles matches from 2007 to current:
- Main draws from 2007; qualifying from 2022.
- Match sets and tiebreak scores, tournament/draw information, player profiles, H2H, surface splits.
- Weekly rankings, but only 35–49 ranking lists per tour/year (partial coverage).
- Provider-computed overall and surface Elo before and after each completed match.
- Surface reference coverage: 99.6% ATP and 96% WTA; remaining surfaces may be null.
- No doubles, no serve statistics, and no point-by-point feed.
- Sportsbook pre-match moneylines are limited to Grand Slams from mid-2020 and ATP Masters/WTA 1000 from August 2024. Other tournaments have no odds. Prices are refreshed hourly.

The service documents 14 endpoints. Published endpoint costs range from 1 to 5 credits. The homepage states 500 free credits monthly, no card required; paid subscriptions start at $19/month. Free credits are a monthly allowance, not a bulk-download grant.

## Terms and permitted use

Terms effective 2026-10-17, last updated 2026-11-12:
- Section 7 permits personal projects, research, analysis, commercial apps, websites and tools.
- Section 7(3) explicitly allows displaying data (including individual odds) to end users in one's own app, storing it, deriving values and using it for research/model training.
- Section 7(3) prohibits reselling/repackaging/redistributing the data as a standalone product, feed, file, dataset or API, or building a competing service.
- Section 7(4) separately prohibits redistributing odds/lines/prices as a raw or bulk feed, API, export, file or dataset.
- Section 7(5) prohibits scraping the website or automated access outside the API/MCP.
- Section 9 says underlying data comes from public websites, open datasets and paid providers; third-party source restrictions may apply and must be passed through where applicable.
- Account requires verified email. Free tier is 500 credits/month without a card. No API calls or account actions were performed for this audit.

## Fit for Tennis Value Scanner

**Potentially useful:**
- Persistent player IDs and match IDs, current results, draw/tournament context.
- Provider Elo overall and by surface could be compared against our own Elo as an independent benchmark.
- H2H and surface split endpoints could be used as cross-checks.
- Commercial internal model use and displaying individual odds in our own app are expressly permitted by the published terms, subject to third-party restrictions.

**Important limitations:**
- Odds coverage is far too narrow to replace Winamax: only Grand Slams and ATP Masters/WTA 1000 (from Aug 2024), not the broad Challenger/ITF coverage needed.
- No serve statistics or point-by-point data.
- 500 free monthly credits are suitable for a limited pilot, not an assumed full historical export/backfill.
- Do not redistribute raw odds or bulk data; do not treat this API as a replacement feed for third parties.
- Terms disclaim accuracy/completeness/timeliness guarantees; verify against independent sources.

## Assessment

AcesAPI is a promising **selective validation/enrichment API**, not a replacement for Valuebetennis, Sackmann, TML, TennisData.app, Live Tennis API archive, or Winamax odds collection.

Recommended next step, only if approved: create a free account (no card required) and run a tightly scoped pilot against a small sample of known matches. Compare match identity, player IDs, surface, result, Elo and odds coverage. Do not subscribe, buy credits, or connect it to Production without explicit approval.

## Aggregator 1 safety boundary

This is research documentation only. No Production files, calculations, API keys, Worker configuration, scraper, or deployment were changed.
