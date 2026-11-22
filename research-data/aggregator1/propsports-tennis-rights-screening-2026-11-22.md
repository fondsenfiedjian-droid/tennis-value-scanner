# Aggregator 1 — PropSports / PropTechUSA tennis archive screening

**Review date:** 2026-11-22  
**Decision:** Not cleared for historical model ingestion or permanent archive under standard plans. Written data-license agreement required.  
**No account, key, API request, download or purchase was made.**

## Why it was screened

PropSports advertises a tennis archive spanning 2000–2026 and 689,427 singles/doubles matches. Its tennis coverage page describes a point-by-point API, including server, score, serve speed, rally length and court position where recorded. It cites a verified sample of 327 Australian Open 2026 matches, but this is not a broad point-coverage guarantee.

Sources:
- https://propsports.proptechusa.ai/coverage
- https://propsports.proptechusa.ai/tennis
- https://propsports.proptechusa.ai/terms

## Product and data claims

- Tennis archive: 2000–2026, 689,427 singles and doubles matches.
- Point-by-point API: historical point sequence where published, including score, server, serve speed, rally length and court position where recorded.
- One explicitly verified point archive sample: 327 Australian Open 2026 matches.
- Live ATP point score and server are not uniformly available: the coverage page distinguishes observed WTA point score from ATP game-level live score.
- Tennis single-sport plan is advertised at $29/month; this is an access price, not a historical retention/model-training licence.

The 327-match example is a limited verified PBP cohort; do not extrapolate it to the full 689,427 match archive.

## Licensing blockers

PropSports Terms last updated 2026-10-28:
- Standard plans allow commercial applications, analytics and derivative products within the plan, subject to source-specific restrictions.
- Standard plans allow temporary caching up to one hour only.
- Standard plans do not grant permanent archival storage of match records, PBP, boxscores or statistics.
- Standard access/use rights end when the subscription ends; continued use of retained data requires an executed Enterprise/data-license agreement.
- The agreement must expressly identify eligible records, permitted uses and retention rights.
- The terms do not expressly grant general model-training rights under standard plans.
- Underlying data comes from multiple public, official, permitted, third-party and internally derived sources; source-specific restrictions remain.
- The terms explicitly say that a standard subscription, including self-service Enterprise, is not by itself a permanent data licence.

The provider states that historical storage and broader rights may be negotiated separately in writing. Contact: sales@proptechusa.ai.

## Decision for Tennis Value Scanner

Do not use PropSports standard API output to build a persistent training archive or train the commercial model unless a signed written agreement expressly authorizes:
1. permanent retention of historical tennis match and point records;
2. internal commercial ML feature engineering, training and evaluation;
3. continued use of derived features/model parameters after subscription termination;
4. the relevant third-party source families and their rights;
5. the intended display of match facts/statistics inside Tennis Value Scanner.

The source may be worth revisiting only if the provider offers a written, affordable licence covering those points. No paid plan should be purchased on the assumption that standard commercial-app permission includes archival or model-training rights.

## Production boundary

Research only. No Production code, calculations, API keys, Cloudflare Worker, Winamax scraper or deployment changed.
