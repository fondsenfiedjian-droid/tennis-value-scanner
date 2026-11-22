# Aggregator 1 — commercial point-data provider update (2026-11-22)

**Branch:** `research/aggregator1-linkage-audit`  
**Scope:** Live Tennis API commercial historical product and MatchStat Tennis API. Public product/docs/terms only. No account, key, API call, download or purchase.

## 1. Live Tennis API — much larger commercial archive, but rights are not cleared

Official sources:
- Product: https://livetennisapi.com/historical-tennis-data-api
- Terms: https://livetennisapi.com/terms
- About / dated coverage: https://livetennisapi.com/about
- API reference: https://docs.livetennisapi.com/point-by-point-history.html
- Historical results archive: https://docs.livetennisapi.com/historical-results-archive.html
- Academic sample: https://livetennisapi.com/data/academic

### New product facts verified 2026-11-22

The provider now offers a separate paid Historical Data API:
- History Starter: $29/month, per-match reads.
- History Pro: $99/month, bulk monthly JSONL/CSV downloads and yearly 2013–2022 archive files.
- Business: $299/month, year-scale exports.
- One-off package: $49 per month of history or $399 per year.
- 2023+ tape covers ATP, WTA, Challenger and ITF, singles and doubles.
- 2013–2022 reconstructed archive covers ATP, WTA and Challenger; not ITF.
- 2013–2022 archive: 97,901 matches and 14,340,663 point rows, reconstructed with no capture timestamps and no model values.
- 2023+ product: more than 204,000 matches and over 32 million point states (provider count as of 2026-11-12).
- About page count as of 2026-11-18: 207,148 of 219,943 completed matches carry a tape (94%); measured point-complete share 55.4%.
- Observed live-captured rows carry timestamps; reconstructed rows do not. Most tapes should not be assumed complete. Per-match coverage flags and the measured /history/coverage endpoint must be used.
- PRO adds per-point market-price history for mapped matches; the provider measured price tapes for 3,718 of 9,741 matches completed from 2026-08-16 (38%) on 2026-09-15.
- The historical archive is useful for a future independent backtest/point-model study, but reconstructed 2013–2022 rows must be treated separately from observed live records.

### Terms review — current blocker

Terms of Use (provider JSB Holdings LLC) reviewed 2026-11-22:
- Section 1 grants a limited, non-exclusive, non-transferable, revocable license to access API responses and use them **within the user's own applications and services**.
- Section 3(a) prohibits raw response resale, redistribution, sublicensing, republishing as a competing feed or bulk dataset.
- Section 3(b) prohibits building a product whose primary purpose is to replicate/substitute for the API.
- Section 3(c) prohibits scraping, caching or storing data beyond what is reasonably necessary to operate the application.
- Section 4 says the API, its data compilation, live feed, model outputs, win probabilities and analysis are the provider's property; terms grant an application-use license and do not transfer ownership.
- No express right to permanent historical data archiving, independent commercial ML training, derived feature/model retention after cancellation, or use of raw point tapes as a training corpus was found.
- No blanket statement that model training is forbidden was found either. The written terms are simply insufficient to clear the intended use; the storage restriction is especially material.

**Decision:** Do not ingest into a permanent research archive or train Tennis Value Scanner's commercial model under standard terms. Ask the provider for written permission explicitly covering (a) persistent internal archive, (b) commercial feature engineering/training/evaluation, (c) retention of derived features and model parameters after cancellation, (d) source provenance and third-party rights, and (e) display of derived match statistics/predictions in the app. The user previously emailed the provider regarding academic archive access; that request remains separate and does not grant commercial rights.

Official terms: https://livetennisapi.com/terms

## 2. MatchStat — strong historical coverage candidate, rights unclear

Official documentation and RapidAPI listing:
- Docs: https://docs.tennis-api.com/
- Results and PBP: https://docs.tennis-api.com/results
- RapidAPI product: https://rapidapi.com/jjrm365-kIFr3Nx_odV/api/tennis-api-atp-wta-itf/details
- Support: api@tennis-api.com (docs); provider listing also gives https://sportsapi365.com/rapid/support

### Product facts

- Historical match results archive advertised as far back as 1930.
- Detailed match statistics from 2003.
- Point-by-point scoring records from 2010, but coverage varies by competition/year/match and some matches have gaps.
- Historical odds records from 2010, including Pinnacle and Marathonbet snapshots.
- Match-level stats, player profiles, H2H, rankings, tournaments/draws, Challenger and ITF coverage.
- Historical results route includes Marathonbet pre-match prices; detailed odds route can return both archived bookmakers.
- Point-by-point records provide scoring progression, server and score after each point.
- Lower-level Challenger/ITF matches from 2005–2015 may only have tournament start date, not exact match date.
- RapidAPI listing advertises FREE/BASIC at 50 requests/day; PRO $29/month, ULTRA $59/month, MEGA $99/month. Verify current quotas and endpoint entitlements on the actual checkout page before any decision.
- The provider's docs are hosted on tennisapidoc.matchstat.com; the API is distributed through RapidAPI.

### Rights decision

The reviewed public documentation and RapidAPI product listing explain API functionality and pricing, but no sufficiently clear provider data-use terms or express commercial ML training / permanent storage grant was located. RapidAPI subscription access is not, by itself, proof of underlying data rights.

**Decision:** Promising for historical PBP + odds validation, but not cleared for ingestion, persistent archive or model training. Ask MatchStat/SportsAPI365 in writing to confirm:
1. commercial use inside Tennis Value Scanner;
2. persistent storage of lawfully retrieved historical results, statistics, PBP and odds;
3. internal commercial feature engineering, ML training and evaluation;
4. retention of derived features/model parameters after subscription cancellation;
5. source-level rights and any bookmaker restrictions;
6. whether PBP and historical odds can be exported in bulk or only queried per match.

No RapidAPI key was created and no endpoint was called.

## Updated shortlist

| Provider | Data potential | Commercial ML / retention status | Decision |
|---|---|---|---|
| Data for Tennis | Point records, serve/return metrics, selective PBP | Terms expressly permit qualifying commercial ML; actual coverage/provenance still needs sample validation | **Best cleared candidate, gated on entitlement/sample** |
| TennisData.app | ATP/WTA/Challenger season CSVs, odds and player IDs | Terms permit commercial ML; automated download blocked; user has emailed support | Await approved access |
| AcesAPI | 124k+ ATP/WTA matches, Elo, H2H, limited major-event odds | Internal model training permitted; source provenance caveat | Selective enrichment candidate |
| Live Tennis API paid history | 2013–2026 PBP, 14.3m reconstructed pre-2023 point rows, 32m+ recent point states, partial market tape | Application-use licence; storage only as reasonably necessary; no explicit ML/archive grant | **Written permission required** |
| MatchStat | 2010+ PBP, 2010+ Pinnacle/Marathonbet historical odds, 1930+ results | Rights and model-training permission not established | **Written permission required** |
| Cito / TennisAPI.dev | 1.779m advertised matches, PBP from live/recent coverage | Analytics/tools for bettors allowed; training/retention unclear, provenance caveat | Written permission required |

## Production boundary

Research only. No Production code, model calculations, API keys, Cloudflare Worker, Winamax scraper or deployment changed. No subscriptions, accounts, keys, API requests or downloads were created or purchased.
