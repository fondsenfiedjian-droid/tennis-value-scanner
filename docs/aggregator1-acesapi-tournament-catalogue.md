# AcesAPI tournament catalogue preflight

Research-only, no Production integration. Official endpoint: `POST /v1/list_tournaments`; costs 1 credit per call and accepts `season`, `league`, `limit`, `offset`. It returns tournament IDs, names, date range, city, country, surface, indoor/major flags, status and main-draw match count. The response has `next_offset` for pagination.

Official documentation: https://acesapi.com/docs/list-tournaments

## Bounded first page

`scripts/aggregator1-acesapi-tournament-preflight.mjs` makes exactly two requests: ATP and WTA, season 2025, limit 100, maximum expected cost 2 credits. It saves raw JSON only in the local/ephemeral output directory and emits an aggregate report. No pagination, retries or per-tournament draw calls are performed.

Run only after explicit approval:
```sh
ACESAPI_API_KEY="$ACESAPI_API_KEY" node scripts/aggregator1-acesapi-tournament-preflight.mjs --confirm-live-calls
```

The first page may not cover every tournament, especially WTA where published annual counts can exceed 100. A non-null `next_offset` means the catalogue is incomplete. Do not infer tournament tier from `major`, draw type, name or match count. This endpoint has no complete ATP 250/500/1000 vs Challenger/ITF taxonomy.

## Decision gate

1. Inspect returned count and `next_offset` for each tour.
2. Check date span, surfaces, missing core fields and major/non-major counts.
3. Only if the first page is useful, propose further paginated calls with an explicit credit ceiling.
4. Build a conservative event crosswalk using exact event names plus date/city/country/surface evidence; preserve ambiguous and unmatched events.
5. Do not claim Challenger/Futures/ITF coverage unless source records and independent event classification demonstrate it.

Never commit raw API responses or expose API keys. No paid plan, bulk crawl, model training or Production changes are authorized by this preflight.
