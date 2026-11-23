# MatchStat Tennis API — source and rights preflight (2026-11-23)

## Scope

Read-only review of public documentation and public terms. No API calls, RapidAPI subscription, account creation, data downloads, or provider contact were made.

## Potential coverage

The MatchStat Tennis API documentation describes ATP and WTA datasets across supported levels, including Challenger and ITF. Its results schema includes completed qualifying matches in tournament results, and round IDs 0–3 are identified as qualifying rounds. The tournament result object exposes player IDs, tournament-season IDs, round IDs, dates and scores.

Relevant public documentation:
- https://tennisapidoc.matchstat.com/results/
- https://tennisapidoc.matchstat.com/tournaments/
- https://tennisapidoc.matchstat.com/getting-started
- RapidAPI listing: https://rapidapi.com/jjrm365-kIFr3Nx_odV/api/tennis-api-atp-wta-itf

This is a potential technical fit for investigating the ATP ITF qualifying coverage gap. It is not yet evidence that every historical ATP ITF qualifying season is complete. The docs also warn that for lower-level events in 2005–2015, the date may be the tournament start date rather than the match date. IDs must be treated as provider-specific; the docs describe multiple identifier namespaces across core, live and point-by-point services.

## Rights and restrictions — unresolved

Matchstat's public Website Terms and Conditions say:
- site materials are protected by copyright and trademark law;
- materials are for personal information/use;
- use of any part of the site's content for commercial purposes requires a licence from Matchstat or its licensors;
- downloaded copies must not be modified, and copies made in breach may need to be returned or destroyed.

Source: https://matchstat.com/predictions-tips/terms-and-conditions/

The API is distributed through RapidAPI, but the public API documentation reviewed does not clearly answer whether an API subscription separately authorizes:
1. persistent storage of historical match records;
2. private internal analytics and model training/validation;
3. retention of derived Elo parameters, features, coefficients and model weights after subscription ends;
4. use inside a private tool used by an individual bettor, with no resale, public feed or sportsbook operation;
5. use of data sourced from third parties and the provider's authority to license those underlying rights.

A third-party provider directory also reports commercial use as requiring a licence and marks storage/caching rights as unverified; this is secondary evidence only and is not treated as authoritative.

## Decision

**Do not call the API, subscribe, download samples, or ingest data yet.** The API looks technically relevant, but the public terms are insufficient to clear persistent historical storage and private model training. The website's personal-use language and commercial-licence requirement make written clarification necessary.

If the user later authorizes contact, ask Matchstat/API support to confirm the five rights points above and identify the underlying data provenance and any third-party restrictions. No contact is authorized by this review.

## Relevance to the current audit

If written permission is obtained, run a small capped linkage audit in a separate provider namespace. Preserve provider event/player/match IDs as source-specific identifiers; compare by player pair, surface, tournament edition, round and event-start-date semantics. Do not merge records into production or use the provider's model predictions as training labels.
