# Source review: Matchstat Tennis API (ATP/WTA/ITF)

Date: 2026-11-23  
Status: research only — no account, API call, subscription, or provider contact.

## Coverage fit

The Matchstat Tennis API is distributed through RapidAPI and documents ATP and WTA result archives spanning ATP Tour, Challengers and ITF. Its tournament-result response has a separate `qualifying` collection; round identifiers 0–3 represent qualifying rounds, and rows expose player IDs, tournament IDs, round IDs, winner, score and event context. The documentation also describes Q1–Q4 round vocabulary.

This is a strong structural fit for the ATP ITF qualifying gap found in the Valuebetennis ↔ Sackmann audit. It is not yet evidence of complete historical coverage: coverage varies by competition, season and record type, and no season-by-season qualifying completeness table was confirmed.

Official documentation:
- Results: https://docs.tennis-api.com/results
- Tournament results/draws: https://tennisapidoc.matchstat.com/tournaments
- Getting started: https://tennisapidoc.matchstat.com/getting-started
- RapidAPI product: https://rapidapi.com/jjrm365-kIFr3Nx_odV/api/tennis-api-atp-wta-itf/details

## Important data caveats

1. For lower-level events (ITF $10K and Challenger/ITF >$10K) from 2005–2015, the `date` field is the tournament start date for every match in that draw, not the match date. Round IDs should be used for ordering; this weakens exact-date linkage.
2. Completed archive `matchId` values can be renumbered after archive reloads. The docs recommend retaining `liveMatchId` (player1Id-player2Id-tournamentId-roundId) for linkage.
3. The API's player/tournament identifiers are a separate namespace. They must not be equated with Valuebetennis or Sackmann IDs without a separately validated crosswalk.
4. The API describes ATP and WTA datasets; no separate ITF endpoint exists. ITF is a competition tier within ATP/WTA.
5. Advertised coverage and round fields do not prove every ITF qualifying draw is present. A bounded coverage/sample audit would still be needed after rights clearance.

## Pricing and access

RapidAPI product page currently lists:
- BASIC: $0/month, 50 requests/day.
- PRO: $29/month, 150,000 requests/month.
- ULTRA: $59/month, 1,200,000 requests/month.
- MEGA: $99/month, 3,800,000 requests/month.

Historical results endpoints appear available on BASIC; higher tiers primarily increase quotas and add model/streaming features. No paid plan is necessary for an initial limited technical evaluation if free access remains available, but any evaluation must be explicitly authorized and stay within the free quota.

Pricing page: https://rapidapi.com/jjrm365-kIFr3Nx_odV/api/tennis-api-atp-wta-itf/details

## Rights and provenance status

The public API documentation and RapidAPI listing describe endpoints, quotas and intended application use, but the reviewed pages do not provide a sufficiently clear data licence granting all of the following:
- persistent retention of raw historical match records;
- internal model training and validation;
- commercial use inside Tennis Value Scanner;
- retention and use of derived features/model parameters after subscription expiry;
- redistribution or display of raw match records.

The underlying data provenance is not sufficiently disclosed in the reviewed API documentation to independently establish the rights chain. API access or a paid subscription must not be treated as a data-rights licence.

Matchstat's public contact page offers business/custom-data enquiries, but no contact was made. Written clarification from the provider and, where relevant, the underlying rights holders would be required before ingestion.

Contact page: https://matchstat.com/predictions-tips/contact-us/

## Assessment against the current project

Potential value:
- Explicit qualifying collection and Q1–Q4 support.
- Structured player, tournament and round IDs.
- ATP and WTA data in one interface.
- A free BASIC quota could permit a small technical evaluation after explicit authorization.

Limitations:
- 2005–2015 ITF/Challenger date semantics are coarse.
- Historical coverage completeness is not proven.
- Rights to persist and train are not confirmed.
- Separate identifiers require new crosswalk validation.
- Free quota is only 50 requests/day, so exhaustive archive acquisition is not practical.

## Decision

1. Keep Matchstat on the candidate list, but mark it **not rights-cleared**.
2. Do not subscribe, create an account, call the API, or ingest any data without explicit user approval.
3. Before any trial, obtain written answers on source provenance, storage duration, private model training/validation, commercial product use for individual bettors, derivative model outputs, attribution, and post-cancellation retention.
4. If approved later, first request season-level counts for ATP men's ITF qualifying (Q1–Q4), compare a small sample in an isolated namespace, and report coverage by season/round before considering any integration.
5. Do not merge provider IDs with existing IDs by name alone and do not use tournament start date as if it were an exact match date.

No API responses, player names, IDs, match rows, or raw data are included in this report.
