# Historical serve/return data sources — 2026-11-22 update

## Executive finding

A new review of Live Tennis API's current public documentation shows that its historical archive contains per-match serve statistics from 1991 onward, not merely results. This is potentially useful for a future serve/return model. It does not change the rights decision: current Terms restrict storage beyond what is reasonably necessary to operate an application and do not expressly grant persistent research archiving or independent commercial ML training.

Tennis Database API documents per-match and player-level serve/return statistics, point-by-point data and opening/closing bookmaker prices. Public materials do not establish sufficient commercial ML and retention rights. It remains unapproved pending written permission.

Cito API advertises per-match serve/return/break-point stats and player splits/rankings as they stood on match day, back to 1968, but its archive-career endpoint documents per-match serve data only from 1991. This discrepancy needs provider clarification.

## 1. Live Tennis API — strong historical feature coverage, rights blocker

Official references:
- https://docs.livetennisapi.com/reference.html
- https://docs.livetennisapi.com/historical-results-archive.html
- https://livetennisapi.com/terms

Archive results span 1968–2022 and cover ATP/WTA main draws, qualifying, Challenger and futures tiers. Records include final score, round, seeds, player ranks at the time and per-match serve statistics where recorded.

The provider explicitly states that the corpus records per-match serve statistics from 1991 only. Earlier matches can have results but no serve-stat block; missing stats are not synthesized. The career endpoint exposes a matches-with-stats count so coverage can be measured.

Fields include aces, double faults, serve points, first serves in, first-serve points won, second-serve points won, service games, break points saved and faced, plus derived percentages.

The archive date is tournament start date, not each match's actual date. This limits precise time ordering for rolling features and must be handled conservatively.

2023 onward uses a separate point-state archive. The current product page reports 207,148 of 219,943 completed matches with tape, but only 55.4% point-complete in the prior assessment. Reconstructed 2013–2022 tapes are score-sequence reconstructions without capture timestamps; they are not serve-speed or shot-tracking data.

### Rights blocker

Current Terms:
- grant a limited, revocable licence to use API responses within the user's own application;
- prohibit resale/redistribution of raw responses as a competing feed or bulk dataset;
- prohibit building a product substituting for the API;
- prohibit storing data beyond what is reasonably necessary to operate the application;
- state that the API compilation, data, feed and model outputs remain provider property;
- do not expressly authorize a permanent research archive or independent commercial ML training/feature retention.

**Decision:** Do not ingest into the permanent Aggregator 1 archive or train the commercial model under standard terms. Ask the provider for written permission covering persistent internal archive, commercial model feature engineering/training/evaluation, derived features and model parameters retained after cancellation, and upstream provenance/rights.

This is an especially attractive source to ask about because it could provide historical match-level serve features back to 1991 and continuous results from 1968.

## 2. Tennis Database API — rich technical surface, rights unclear

Official references:
- https://tennisdatabaseapi.com/
- https://tennisdatabaseapi.com/documentation/statistics

Public documentation advertises per-match serve and return stats, including match and set splits; point-by-point sequences with server, point winner, breaks and break-point markers; player serve/return aggregates across matches and opponents; match opening and closing odds from bookmakers and timestamped price moves; and results since 1877, with coverage varying.

This could support rolling serve/return strength, opponent-adjusted features, break-point performance, point-state models, market calibration and odds-movement analysis.

However, public pages reviewed do not provide a sufficiently clear, express grant for commercial ML training, permanent internal retention, derived-feature/model-parameter retention, or source-by-source upstream rights. A prior rights review also found no adequate training/retention grant.

**Decision:** Not cleared. Do not create an account, call API, download or pay. Request written terms clarification before any data use.

## 3. Cito API — useful as-of claims, verify source coverage

Official references:
- https://tennisapi.dev/tennis-stats-api/
- https://docs.citoapi.com/terms/
- https://citoapi.com/terms/

The current stats page advertises per-match serve, return and break-point stats, player splits, recent form, H2H and rankings "as they stood on match day", back to 1968. It also states that no odds are sold.

The historical archive's career endpoint separately says per-match serve statistics exist from 1991. This may mean results/rank history reach 1968 while serve/return data starts later. Obtain an explicit season-by-season coverage matrix before relying on the headline "back to 1968".

Cito terms allow paid commercial use in an individual's bettor-facing analytics application, but exclude sportsbook/operator use, redistribution and building a competing data service. They also disclaim third-party provenance/rights and do not clearly settle permanent bulk archive and independent model-training retention. See the separate Cito rights review.

**Decision:** Conditional app candidate; not a cleared persistent commercial training corpus.

## 4. Feature-engineering recommendation for Tennis Value Scanner

When lawful point-in-time data becomes available, promising incremental features to test are:

1. Serve strength: rolling first-serve points won, second-serve points won, service games held, aces and double faults.
2. Return strength: return points won, return games won, opponent-adjusted break chances created.
3. Pressure performance: break points saved and converted, with strong shrinkage due to low sample sizes.
4. Surface-specific splits: rolling hard/clay/grass indoor/outdoor performance, with minimum sample thresholds.
5. Opponent adjustment: compare a player's serve/return performance to the opponent's return/serve baseline, not raw percentages alone.
6. Recency: exponentially weighted rolling windows, strictly using matches completed before the prediction timestamp.
7. Calibration: test whether features improve out-of-sample Brier score and log loss separately for ATP/WTA, surface and odds bands; keep only stable gains.

### Leakage controls

- A match's own statistics must never be used to predict that same match.
- Current career/season/last-10 aggregates cannot be retroactively attached to old matches unless the provider supplies an as-of snapshot.
- If match dates are only tournament start dates, same-event match ordering may be uncertain. Exclude ambiguous same-tournament histories or use round/schedule evidence with conservative cutoffs.
- Null statistics remain missing, not zero.
- Use sample-count shrinkage or Bayesian priors for low-volume players.
- Evaluate feature gains against the current Elo baseline using chronological walk-forward splits, not random splits.

## 5. Next legal and technical gates

1. Ask Live Tennis API whether it will license the archive for persistent internal research and commercial ML training, including derived feature and parameter retention after cancellation.
2. Ask Tennis Database API for the same explicit permissions and a source-provenance statement.
3. Ask Cito to reconcile its "back to 1968" stats wording with the 1991 serve-stat coverage statement and provide an as-of/retention explanation.
4. Do not create accounts, API keys, make API calls, download data or purchase plans without the user's explicit approval.
5. Once a provider gives written permission and the user approves acquisition, inspect a small authorized sample and measure per-season, per-tour, per-surface and metric-level completeness before considering integration.

## Production boundary

Research only. No Production code, Elo calculations, feature weights, API keys, Cloudflare Worker, Winamax scraper or deployment changed.
