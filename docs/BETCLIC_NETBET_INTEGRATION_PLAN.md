# Betclic + NetBet odds integration plan

Status: implementation branch; no production changes, no credentials added, no paid service activated.

## User decision

Add Betclic and NetBet beside the existing Winamax feed. All three bookmakers must price the same model probability:
- PFE/ACE/SMA produce one match probability.
- Each bookmaker's decimal odds are evaluated independently against that probability.
- EV is bookmaker-specific: `EV = p_model * decimal_odds - 1`.
- Never train a separate probability model per bookmaker and never average bookmaker odds into the model probability.

## Current production architecture (verified on main 2026-11-21)

- Cloudflare Worker `worker.js` owns `GET /odds`.
- `/odds` currently reads the latest successful Apify task run for fixed task ID `s9Des4R3jhMfA8e3s`, caches for five minutes, and returns the raw dataset items plus diagnostics.
- That task is the existing Winamax France scraper. It must remain unchanged.
- The response currently labels its source as `Apify Winamax task`; the endpoint is a single-source feed, not a bookmaker-agnostic odds service.
- Frontend and worker tests already exercise the existing Winamax raw-row schema and matching. Any expansion must preserve this behavior and add multi-bookmaker coverage without regressing it.
- The current six-hour freshness limit is a separate application-level odds gate; each new source must retain its own scraped/observed timestamp and must not inherit a timestamp from another source.

## Source assessment

### Preferred unified provider: The Odds API

Official bookmaker catalogue lists these French bookmaker keys:
- `betclic_fr`
- `netbet_fr`
- `winamax_fr`

The API supports tennis sport keys and featured `h2h` (match-winner) market requests. Its API allows selecting explicit bookmaker keys; up to ten selected bookmakers count as one region for quota purposes. This is a promising single integration path for Betclic and NetBet, and could later be used as an independent Winamax cross-check. It does not replace the current Winamax Apify task in this first release.

Official published pricing observed 2026-11-21:
- Starter: free, 500 credits/month.
- 20,000 credits/month: USD 30/month.
- Historical odds are a paid-plan feature.
- Live odds requests consume credits based on markets and regions; empty responses do not consume credits.

Before implementation, validate with a real API key that ATP and WTA sport keys return both `betclic_fr` and `netbet_fr` for French tennis events. Catalogue membership alone does not prove coverage for every tournament, event, or market.

Documentation:
- https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
- https://the-odds-api.com/sports/tennis-odds
- https://the-odds-api.com/liveapi/guides/v4/
- https://the-odds-api.com/

### NetBet direct alternative: Apify actor

Apify actor `oddsfrance/netbet-odds-scraper` advertises NetBet France tennis main-match-winner prices, decimal odds, competition, event names, UTC start time, and per-row timestamps. It is pay-per-row / launch-free as of the observed listing. It reads public pages, respects robots.txt, throttles requests, and stops if blocked; it does not promise full market coverage or historical prices. It may be used as a fallback if the unified API does not return NetBet reliably.

Do not create or activate a task until the actor's current input, output, cost and terms have been checked and the user approves any paid usage.

Reference: https://apify.com/oddsfrance/netbet-odds-scraper

### Betclic direct alternative

An unofficial public GitHub client describes Betclic's French offering API (gRPC-web) and tennis support. This is not an official Betclic developer API and its own disclaimer limits use to personal, educational and research purposes and warns against automated/commercial services without explicit permission. Do not make this the production integration path without a terms/permission review.

Reference: https://github.com/TapsHTS/betclic-api

A third-party Betclic API product also advertises French pre-match/live tennis markets, but its coverage and commercial terms must be independently verified before use.

## Implementation design

1. Keep `GET /odds` behavior and the current Apify task unchanged.
2. Add a separate multi-bookmaker endpoint or source-specific sub-endpoints. Do not make the current Winamax endpoint depend on new provider credentials.
3. Normalize every quote to a common schema:
   - `bookmaker` (`winamax`, `betclic`, `netbet`)
   - `bookmakerCountry: "FR"`
   - `sport: "tennis"`, `tour` where known
   - `eventId` and `sourceEventId` (provider-specific; never treated as cross-bookmaker IDs)
   - `eventName`, `homeTeam`, `awayTeam`
   - `startTime` (UTC ISO-8601)
   - `marketType: "match_winner"`
   - `outcome` / `outcomeName`
   - `oddsDecimal`
   - `scrapedAt` / `lastUpdate` (source timestamp)
   - `source` and `sourceUrl`
4. Match events across sources using normalized player names + unordered pair + event date/time tolerance; do not use provider event IDs as shared IDs. Quarantine ambiguous matches.
5. Keep bookmaker-specific quote freshness and market status. Reject suspended, invalid, non-decimal, stale, or incomplete two-outcome markets. Never interpret missing prices as zero.
6. Preserve all individual bookmaker quotes. Show best available price and its bookmaker, but retain the full source-by-source list for audit and CLV/backtesting.
7. Calculate EV independently for each bookmaker's price using the same model probability. Do not blend prices or change PFE/ACE/SMA based on the bookmaker.
8. Add tests for provider normalization, name/order matching, event-time tolerance, duplicate quotes, missing outcomes, suspended markets, stale timestamps, malformed prices, and no-regression of existing Winamax fixtures.
9. Add source status/diagnostics: rows received, tennis rows, match-winner rows, complete two-way markets, fresh quotes, linked events, ambiguous links, and last successful retrieval.
10. Deploy only after tests and real-data smoke checks pass. Keep this branch separate and open a draft PR; do not merge or deploy production without explicit user approval.

## Credentials and cost gate

No API key or paid account is currently assumed. Do not commit secrets to GitHub. If using The Odds API, store its key as a Cloudflare Worker secret (for example `ODDS_API_KEY`) after the user supplies/creates it. First validate on the free tier and inspect actual credit use. Do not subscribe to the USD 30/month plan or enable a paid Apify actor without explicit approval.

## Immediate next steps

1. Obtain or create a The Odds API key and run one minimal ATP and one WTA test request selecting only `betclic_fr,netbet_fr`, `h2h`, decimal odds.
2. Record exact returned bookmaker names, event counts, coverage and credit cost.
3. If both sources are present and sufficiently complete, implement the unified adapter. If one is absent/weak, use the NetBet Apify actor for NetBet only and separately resolve Betclic permissions/source.
4. Implement and test on this branch; preserve the current Winamax path byte-for-byte where practical.
