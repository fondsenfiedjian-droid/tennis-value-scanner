# Aggregator 1 — point-by-point API and licensing review
Date: 2026-11-22
Branch: `research/aggregator1-linkage-audit`

## Tennis Database API — current terms checked (29 October 2026)

Official sources:
- Terms: https://tennisdatabaseapi.com/terms
- Serve/return and PBP documentation: https://tennisdatabaseapi.com/documentation/statistics
- Pricing: https://tennisdatabaseapi.com/pricing

Data surface confirmed in the docs:
- Match-level and set-level serve/return statistics.
- Point-by-point sequence with game, server, point winner, breaks, break points and set points.
- Player serve/return statistics aggregated across matches.
- Results, player profiles, rankings, Elo, odds and historical records.
- Advertised historical scope: matches since 1877; actual field coverage varies.

Current Terms, last updated 29 October 2026:
- Section 4 permits use of API data in the customer's own work, apps and sites and display of results to users.
- Section 4 prohibits bulk download to rebuild the provider's database, competing products, and resale/redistribution of data itself in bulk or via another API/feed.
- The Terms do not explicitly grant a right to train, retain or commercially operate an independent ML model using the full historical API corpus. They also do not contain an express blanket model-training prohibition in the sections reviewed.
- Accuracy/completeness is not warranted (Section 6).
- One account per person/business; no multiple free accounts or key rotation to bypass plan limits (Section 3).

Decision:
- Not cleared for Aggregator 1 ingestion or model training yet.
- The provider's own database-rebuild/competing-product prohibition makes a bulk historical model-training project especially sensitive.
- Written clarification is required: may a customer use lawfully accessed per-match/per-player results and statistics to train and retain an internal match-winner ML model, and use the model in an independent tennis analytics application for individual users, without distributing raw records or a substitute feed?
- No account, key, API call, export, trial or purchase was made.

## Tennis API / tennis-api-atp-wta-itf (RapidAPI) — technical feature, licence not established

Documentation:
- https://docs.tennis-api.com/results
- https://docs.tennis-api.com/

The public documentation describes:
- ATP/WTA results across supported levels, including Challenger and ITF.
- Match-winner pre-match Marathonbet prices where available.
- Point-by-point progression since 2010, with variable match coverage.
- Historical odds archive for Pinnacle and Marathonbet from 2010, with variable bookmaker/match coverage.
- Match and player IDs, surface, tournament and round context.

The API documentation is not itself a data licence. No sufficiently clear commercial model-training grant or source-provenance statement was established in this screening. Treat as unapproved until the provider/RapidAPI terms and upstream rights are confirmed. Do not scrape the docs or endpoints, create a key, or purchase a plan as a substitute for rights clarification.

## Other candidate review — Live Tennis API public academic dataset

The public academic sample remains CC BY-NC 4.0 and is not suitable for commercial training. The current public dataset description reports 173,571 matches (2023-01-01 to 2026-08-13), with point sequences for 170,527 (98.2%). The point layer distinguishes 22,031 live-observed matches / 3.18m point states from reconstructed post-match sequences; reconstructed records have no capture timestamps. This is valuable research material but stays outside the commercial model pipeline.

Sources:
- https://livetennisapi.com/data/academic
- https://github.com/livetennisapi/livetennisapi-data
- https://doi.org/10.5281/zenodo.23018680

## Practical conclusions

1. Data for Tennis remains the best contractual candidate for commercial feature engineering and model training, subject to release entitlement, source provenance and coverage validation.
2. TennisData.app remains a promising candidate under its published commercial-ML terms, but automated download is blocked and support/provenance clarification is pending.
3. AcesAPI remains a secondary selective enrichment candidate; its public terms allow internal commercial model research but third-party source restrictions need attention.
4. Cito requires written confirmation of training/retention and provenance.
5. Tennis Database API has excellent documented PBP and serve/return fields, but its current Terms do not clearly grant independent model-training rights and prohibit bulk database reconstruction.
6. The RapidAPI tennis API documents useful point-by-point and historical odds endpoints, but its commercial data licence and provenance were not established.

No new dataset has been downloaded or ingested. No Production files, Worker, frontend, API keys or model parameters were changed. No paid service or account was activated.
