# ATP ITF qualifying source lead — Cito API review

**Date:** 2026-11-23  
**Status:** public-documentation review only; no account created, no API calls, no data imported, no purchase.

## Executive finding

Cito API is the strongest newly identified *coverage lead* for the ATP ITF qualifying gap. Its public changelog says qualifying results were added for men's ITF World Tennis Tour events from 2014 onward, and women's ITF qualifying for 2014–2018 and 2026. It also added qualifying results for ATP Challenger events from 2010–2015. This directly overlaps the missing ATP early-round coverage, unlike the ATP Tour qualifying CSVs listed by TennisMyLife.

However, Cito is **not currently cleared as a historical model-training source**. Its own Terms of Service say it is an independent aggregator, not an official or rights-cleared feed; paid commercial-use permission covers use of its service, not third-party data rights. The terms also prohibit using its data to build, train, or improve a competing data service without a separate written agreement. Whether a private model used inside Tennis Value Scanner is covered by that restriction is not defined clearly enough to assume permission.

## Coverage evidence

The Cito changelog states that qualifying rows were added for:
- men's ITF World Tennis Tour events from 2014;
- women's ITF events from 2014–2018 and 2026;
- ATP Challenger events from 2010–2015.

It says qualifying rows carry round labels Q1–Q4, set scores, seeds and entry codes, and that the event start date is used rather than an individual match date. This means any linkage test must account for event-start-date semantics and must not compare those dates as if they were exact match dates.

Sources:
- Changelog: https://dashboard.citoapi.com/docs/changelog/
- Tennis API documentation: https://www.citoapi.com/docs/api/tennis/
- Historical tennis data overview: https://citoapi.com/historical-tennis-data/

## Rights and commercial constraints

Cito's Terms of Service (last updated November 2026) state:
1. Cito is an independent aggregator and is not affiliated with or licensed by the relevant rights holders; it does not supply official or rights-cleared data feeds.
2. A paid plan licenses commercial use of the Cito service, but does not grant third-party data, media, or trademark rights.
3. Permitted use includes analytics and research and tools for individual bettors, provided the service is not operated by or for a sportsbook/bookmaker.
4. The terms prohibit using the data to build, train, or improve a competing data service without a separate written reseller agreement.
5. Redistribution of the data as a feed/API is prohibited.

The user's project is a tennis analytics/value-betting tool, not a sportsbook. Nevertheless, the model-training restriction and underlying-source rights need written clarification before any persistent archive or training use. Do not infer that a commercial subscription alone clears these rights.

Sources:
- Terms of Service: https://docs.citoapi.com/terms/
- Pricing: https://docs.citoapi.com/pricing/

## Cost and access

Published pricing lists:
- Free: $0, 500 API calls/month, 30-day in-depth historical window; dashboard sandbox advertises up to 50 historical lookups/day.
- Starter: $15/month, 90-day in-depth history.
- Pro: $59/month, full archive.
- Scale: $100/month, full archive.
- Business CSV: $299/month for full archive baseline and daily delta CSVs.

A multi-year qualifying backfill would therefore not be available through the ordinary Free API history window. The full archive requires a paid tier, and Business CSV is far beyond the current no-purchase constraint.

No subscription, API key, API call, sandbox lookup, or download was made.

## Comparison with other candidate

### TennisMyLife

The public database page lists ATP Tour qualifying CSVs from at least 2017 onward, but this is tour-level qualifying, not evidence of ATP Futures/ITF qualifying coverage. Its page also links to an MIT licence, while separate published usage terms previously reviewed for this project restrict the relevant data use to personal/educational/non-commercial use and require written permission for commercial model training. Treat it as not cleared until the exact applicable licence and rights are confirmed.

Source: https://stats.tennismylife.org/tennis-match-database

### Jeff Sackmann archive

The current ATP Futures files do not establish a separate ATP Futures qualifying feed. The archive is CC BY-NC-SA 4.0 and is not cleared for the project's potentially commercial model.

Sources:
- https://github.com/JeffSackmann/tennis_atp
- https://github.com/JeffSackmann/tennis_wta

## Recommended next steps

1. Do not purchase Cito or call its API.
2. If the user later authorizes provider contact, ask Cito in writing whether the intended use is allowed: private historical storage, model training/validation, retaining learned parameters/features after source deletion, and use in Tennis Value Scanner as a tool for individual bettors.
3. Ask Cito to identify the underlying source/provenance for ATP ITF qualifying records and confirm whether it has rights to authorize persistent storage and model training.
4. If written permission is satisfactory, run a small, capped sample linkage audit before considering a full import. Keep Cito records in a separate source namespace and account for tournament-start-date semantics.
5. Until then, retain the current ATP ITF early-round coverage limitation. Do not synthesize missing match records or silently merge unlicensed data.

## Scope and safety

This review changed no production code, Worker, Netlify deployment, secrets, or production data. It made no paid API calls and imported no raw data.
