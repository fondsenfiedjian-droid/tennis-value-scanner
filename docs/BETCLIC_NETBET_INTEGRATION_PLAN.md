# Betclic + NetBet odds integration plan

Status: implementation branch; quota-free Odds API credential/sports-discovery check added on 2026-11-21. No production changes, no paid service activated.

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

The official French bookmaker catalogue currently lists:
- `betclic_fr` — Betclic (FR)
- `netbet_fr` — NetBet (FR)
- `winamax_fr` — Winamax (FR)

The API supports explicit bookmaker selection with the `bookmakers` parameter, `h2h` (match-winner) markets and decimal odds. Up to ten selected bookmakers count as one region for quota purposes. For our first validation request, select only `betclic_fr,netbet_fr`; do not request every bookmaker. This is a promising unified path, but catalogue membership does not prove that both bookmakers offer odds for every tennis event.

**Important coverage limitation discovered 2026-11-21:** the provider's public tennis coverage page names Grand Slams, ATP 1000, ATP 500, WTA 1000 and WTA 500. It does not claim comprehensive Challenger, ITF, lower-tier ATP/WTA or WTA125 coverage. The API uses competition-specific sport keys (for example `tennis_atp_french_open`), not one universal ATP key and one universal WTA key. Therefore:
- First call `GET /v4/sports` (does not consume odds quota) to discover currently in-season tennis sport keys.
- Test a small number of currently active ATP and WTA competition keys separately.
- Record tournament tier, event count, bookmaker presence, complete two-way markets, quote timestamps and credit cost.
- Do not represent The Odds API as full-tour coverage. Challenger/ITF coverage needs a separate verified source or must remain explicitly unavailable.

Official published pricing observed 2026-11-21:
- Free plan: 500 credits/month.
- A published paid tier: 20,000 credits/month for USD 30/month.
- Historical odds are a paid-plan feature.
- The sports-list endpoint does not count against quota. Odds requests consume credits based on markets and bookmaker regions; up to ten explicitly selected bookmakers count as one region.

Documentation:
- https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
- https://the-odds-api.com/sports/tennis-odds
- https://the-odds-api.com/sports-odds-data/sports-apis.html
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
   - `sport: "tennis"`, `tour` and competition tier where known
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

No The Odds API key or paid account is currently assumed. Do not commit secrets to GitHub. If using The Odds API, store its key as a Cloudflare Worker secret (for example `ODDS_API_KEY`) after the user creates it. First validate on the free tier and inspect actual credit use. Do not subscribe to a paid plan or enable a paid Apify actor without explicit approval.

The separate Live Tennis API key is not an Odds API key and cannot authenticate requests to The Odds API.

## Immediate next steps

1. The user has created a separate The Odds API key and saved it as Cloudflare secret `ODDS_API_KEY`. The branch now provides `/odds-api/sports` to discover active tennis competition keys; this call is quota-free. After preview deploy, validate the key and inspect the discovered keys.
2. Run minimal, date-appropriate ATP and WTA competition tests selecting only `betclic_fr,netbet_fr`, `h2h`, decimal odds.
3. Record actual coverage, event counts, complete markets, timestamps and credit cost. Explicitly note that Challenger/ITF coverage is not established.
4. If both sources are present and sufficiently complete for the competitions we need, implement the unified adapter. If one is absent/weak, evaluate the NetBet Apify actor for NetBet only and separately resolve Betclic permissions/source.
5. Implement and test on this branch; preserve the current Winamax path byte-for-byte where practical.
