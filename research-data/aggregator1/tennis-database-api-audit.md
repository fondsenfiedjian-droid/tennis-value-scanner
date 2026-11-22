# Aggregator 1 — Tennis Database API assessment

**Review date:** 2026-11-22  
**Provider:** DeveloperData.net / Tennis Database API  
**Status:** public product and terms reviewed; no account created, no API key requested, no API calls made, no purchase.

## Official references

- Product: https://tennisdatabaseapi.com/
- Terms: https://tennisdatabaseapi.com/terms
- API documentation: linked from product page

## Published data coverage

The provider advertises 2.3 million singles results from 1877 onward across Grand Slams, ATP/WTA, Challenger and ITF:
- Match scores, rounds, seeds and surfaces.
- Player profiles, seasons, titles and Elo.
- Weekly rankings.
- Bookmaker prices: opening/closing and price movements.
- Match statistics (up to 22 fields) and point-by-point data.
- Per-season compressed CSV exports for matches, prices, price moves, statistics and points.

Coverage depth varies by year and data family. The provider states that /meta/coverage and /freshness expose measured coverage; these have not been queried in this audit.

## Free and paid access

Free key:
- 50 calls/day, 10/minute.
- Date window yesterday through two days ahead.
- Yesterday's matches include bookmaker prices, price moves, statistics and point-by-point data.
- No card required.

Paid plans shown on the page:
- Live: $39/month, 45 days back through +2 days.
- Archive: $59/month, every season through yesterday.
- Complete: $119/month, every season through +2 days.
- Historical CSV exports are paid-only.
No plan has been purchased or trial started.

## Terms — material restriction

Terms last updated 2026-10-29:
- Section 4 allows use of API data in one's own work, apps and websites, and displaying results to one's own users.
- It prohibits reselling, redistributing or republishing the data itself in bulk or through one's own API/feed.
- It explicitly prohibits bulk downloading to rebuild the database or using the service to build a competing product.
- Section 5 prohibits scraping pages where the data is available through the API.
- Section 6 disclaims warranties of completeness and accuracy.
- Terms do not clearly grant a right to use bulk data to train a commercial predictive model. This must be clarified in writing before any model-training use.

## Fit for Tennis Value Scanner

**Technical potential is high:** broad level coverage (including Challenger and ITF), odds, price movements, match statistics, point-by-point and long historical range. It appears materially richer than AcesAPI in serve/point detail and bookmaker markets.

**Commercial and operational fit is unresolved/poor for bulk research:**
- Archive access costs $59/month and exports are paid-only.
- Bulk download to reconstruct a database is expressly prohibited.
- Building a competing product is expressly prohibited.
- Model training rights are not explicitly addressed.
- The app's intended use must be explained to the provider and approved in writing before integrating historical data into training or using the API as a core data feed.

## Assessment

**Do not use this provider as an Aggregator 1 bulk dataset or training corpus unless the provider grants explicit written permission.** It may potentially support limited in-app match enrichment under its own-app clause, but the boundary between an analytics/betting product and a competing product is not clear enough to assume permission.

No account, key, API call, subscription, code integration, or Production change was made.
