# Aggregator 1 — Cito / tennisapi.dev updated rights review

**Review date:** 2026-11-22  
**Status:** Product scope and current Terms reviewed. No account, key, API request, export or purchase.

## Identity and product scope

The tennisapi.dev documentation identifies its API base as `https://api.citoapi.com/api/v1/tennis`; this is the tennis product of Cito API, not an unrelated provider.

Official references:
- https://tennisapi.dev/
- https://tennisapi.dev/docs/
- https://tennisapi.dev/tennis-api-coverage/
- https://tennisapi.dev/tennis-point-by-point-api/
- https://citoapi.com/terms/
- https://docs.citoapi.com/terms/

## Product facts verified

- Advertises 2.1M+ ATP/WTA matches since 1968, plus Challenger/ITF results coverage.
- Point-by-point coverage is from matches carried live, consistently since June 2026; no old-season PBP archive is promised.
- 90-day measured sample (12 Aug–10 Nov 2026) lists main-draw point-by-point availability around 98–99% at tour and Challenger level, with lower ITF coverage; completeness is lower than mere availability.
- The measured coverage page reports serve statistics for ATP/WTA and Challenger at high levels in that recent sample; it is not a historical season-by-season guarantee.
- Full historical archive, point-in-time Elo, live scores and prediction-market odds on Pro; no traditional bookmaker odds are advertised on the current tennis product pages.
- Free evaluation: 500 calls/month and a 3-day odds/Elo trial; 30-day match history. Starter Tennis $15/month (90 days); Pro $59/month; Scale $100/month; Business CSV $299/month for full archive baseline/delta CSV exports.
- Business CSV advertises 2.1M+ matches with Elo, serve/return stats and opening/closing prediction-market odds. It does not advertise bulk point-by-point historical tapes; PBP is documented for matches carried live.
- Do not confuse prediction-market odds with Winamax, Pinnacle or bookmaker prices.

Sources:
- https://tennisapi.dev/
- https://tennisapi.dev/tennis-api-coverage/
- https://tennisapi.dev/tennis-point-by-point-api/
- https://tennisapi.dev/tennis-csv-dataset/

## Current Terms — material clarification

The current Terms at https://docs.citoapi.com/terms/ and https://citoapi.com/terms/ say:

### Permitted use
- Paid plans license commercial use of the API/service inside the user's own commercial product.
- The terms explicitly list analytics and research, tools for individual bettors (including statistics, models and odds comparison), daily fantasy and prediction-market applications as permitted, provided the service is not operated by or for a sportsbook, bookmaker or wagering operator.
- This is relevant to a standalone Tennis Value Scanner used by individual bettors, but does not cover an operator or supplier working for a sportsbook/bookmaker.

### Prohibited use
- No use by or for a sportsbook, bookmaker, betting exchange or wagering operator, including pricing, odds setting, trading/risk management, bet settlement or live/in-play betting markets.
- No resale or onward supply to data vendors, aggregators or odds/feed providers.
- No resale, sublicensing or redistribution of the API/data as a data feed/API.
- No use to build, train or improve a competing data service without a separate written reseller agreement.
- Automated access must stay within the plan's rate and usage limits.

### Rights and provenance caveat
- Cito describes itself as an independent aggregator of factual data from publicly accessible sources and public feeds.
- It expressly says it is not affiliated with, endorsed by or licensed by ATP, WTA, ITF, tournament organizers or other rights holders; it does not provide official or rights-cleared feeds.
- It gives no warranty that third-party data does not infringe third-party rights and gives no indemnity. It says the customer is responsible for obtaining any additional rights needed.
- Paid commercial-use permission is a licence to use Cito's service inside a product; it is not a licence to third-party rights in underlying data.
- The terms describe internal use and display in own products, but do not expressly settle permanent local archival of bulk response data or independent model training that is not a competing data service. The competing-service prohibition is material and should be clarified in writing before training or long-term retention.

## Decision for Tennis Value Scanner

**Conditional application candidate, not a cleared historical training corpus.**

The permitted-use wording appears compatible with a commercial analytical tool for individual bettors, assuming the product is not operated by/for a bookmaker or wagering operator and does not resell raw feeds.

However:
1. Do not use it for sportsbook/bookmaker operations, odds setting or bet settlement.
2. Do not redistribute raw API records, bulk data or a data feed.
3. Obtain written clarification that internal commercial model feature engineering/training/evaluation for a bettor-facing analytics application is not considered building a competing data service.
4. Obtain written clarification on whether lawfully retrieved data can be retained in an internal research archive after subscription cancellation.
5. Request source provenance and rights information for ATP/WTA/Challenger/ITF result, stats, Elo, point-by-point and prediction-market odds families.
6. Do not treat prediction-market odds as Winamax odds or bookmaker closing lines.
7. Check historical coverage and field-level completeness before paying. PBP is recent/live-captured, not a 1968-onward point archive.

No account/key/API request, download or purchase was made. No production integration is approved.

## Production boundary

Research only. No Production code, model calculations, API keys, Cloudflare Worker, Winamax scraper or deployment changed.
