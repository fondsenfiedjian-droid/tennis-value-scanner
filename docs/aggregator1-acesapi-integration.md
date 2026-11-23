# Aggregator 1 — AcesAPI source assessment

Status: research only. This source is not connected to Production and no API key is stored in this repository.

## What the provider documents

- ATP and WTA singles main draws from 2007; qualifying draws from 2022.
- Match rows include player IDs/names, match date/time, tournament edition, surface, draw, round, result and set scores.
- Elo is stored before and after each completed match, overall and by surface.
- Weekly ranking lists are partial: the provider says only 35–49 lists per tour/year are retained.
- No serve statistics and no point-by-point feed.
- Odds coverage is limited to Grand Slams from mid-2020 and ATP Masters/WTA 1000 from August 2024.
- Results refresh daily; the current year is reread for corrections. No per-record revision history is kept.

Official references:
- https://acesapi.com/
- https://acesapi.com/docs/get-matches
- https://acesapi.com/docs/get-tournament
- https://acesapi.com/docs/timing-and-rights
- https://acesapi.com/data/tennis-results-api

## Fit against the current archive gap

AcesAPI is a potentially useful independent source for cross-checking ATP/WTA main-draw results, exact match dates, player IDs, surfaces and historical Elo. Its published scope does **not** explicitly promise comprehensive ATP Futures, Challenger or ITF coverage. Do not count it as an ATP ITF / WTA ITF gap solution unless a real coverage audit proves those records are present.

The provider's 2021 season page reports 2,775 ATP and 3,125 WTA singles matches. Those figures are not evidence of full lower-tier coverage. They reinforce the need to audit by draw, event level and year rather than infer coverage from the API's headline total.

## Rights and account conditions

The provider's published data-rights page says customers may store retrieved data while the account is open and use it for internal research, backtesting and training their own models. Stored data may continue to be used internally after cancellation, but a product that continues serving users from the data requires an active account. Redistribution of the underlying dataset/feed/export is prohibited. The provider is independent and does not grant ATP/WTA league rights or endorsement.

No attribution is stated as required by the provider's summary, but keep source provenance in our internal manifests. Recheck the provider's live terms before any commercial deployment.

## Cost and safe acquisition

- Free allowance: 500 credits/month, no card according to the current public site.
- `get_matches`: 2 credits per request; endpoint supports season, league, limit and offset/next_offset.
- `get_tournament`: 2 credits per tournament draw request.
- A default page is 100 matches; do not assume a larger page limit without testing.
- Never start a full multi-year crawl on the free allowance. First measure actual pagination and records returned with a strictly bounded sample.
- No paid plan, wallet top-up or recurring subscription without explicit approval.

## Integration gate

1. User creates/verifies a free account and stores the key only as GitHub Actions secret `ACESAPI_API_KEY`; never paste it into chat or commit it.
2. First live test is limited to one small ATP sample and one WTA sample, with a hard cap of 4 credits.
3. Save responses only in ephemeral CI workspace; emit an aggregate report, not raw API payloads, to the artifact.
4. Run `scripts/aggregator1-acesapi-audit.mjs` against exported sample JSON and Valuebetennis rows. Exact normalized player pair + exact surface + match date within +/-1 day; ambiguous candidates stay unlinked. No fuzzy names or forced tournament aliases.
5. Compare coverage by year, tour, category and draw. Check date quality, duplicates, retirement/walkover treatment, missing surfaces and player-ID consistency.
6. Only then propose a bounded acquisition plan. Do not train the production model until source coverage and chronology are reviewed.

## Local audit harness

Expected filenames:
- Valuebetennis: `valuebetennis-matchs-YYYY.csv`
- AcesAPI: `acesapi-atp-YYYY.json` or `acesapi-wta-YYYY.json`

Run:
```sh
node scripts/aggregator1-acesapi-audit.mjs --valuebet-dir research-data/aggregator1/valuebetennis --aces-dir research-data/aggregator1/acesapi --out aggregator1-acesapi-audit.json
```

The audit writes only aggregate counts. It does not create a match-level crosswalk or alter Production.
