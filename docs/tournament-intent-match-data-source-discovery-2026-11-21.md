# Match-level source discovery and extraction decision — 2026-11-21

## Objective

Find a reproducible source for every ATP/WTA singles main-draw match in 2026-09-21 through 2026-11-21, with stable match ID, UTC start time/date, event/draw, round, player IDs, result and explicit status. Join a ranking snapshot published before each event.

## Findings

### 1. No documented public ATP/WTA API

A technical survey dated 2 November 2026 reports that neither tour publishes a documented public developer API. It reports ATP endpoints blocked to plain scripted requests and WTA JSON routes that answer but are subject to WTA website terms restricting automated access. This is a secondary technical report, not an authorization to scrape either tour. Do not build an unattended crawler against those routes without checking terms and permissions.

Source: https://sportsapis.dev/tennis-api (last updated 2 Nov 2026).

### 2. ESPN tennis JSON / Apify actor — promising structured candidate, not yet run

The Apify actor `getdatagrit/tennis-stats-scraper` documents match records with:
- stable ESPN match ID and tournament edition ID;
- tour, singles/doubles draw, round, qualifying flag;
- UTC start time and whether it is confirmed;
- player IDs and seeds;
- statuses including finished, retired, walkover, postponed, cancelled and suspended;
- score consistency and per-set scores;
- optional ranking rows, but the documented ranking output is the current top 150, not a historical pre-event snapshot.

The actor says it reads ESPN's public undocumented tennis JSON and provides ATP/WTA matches; Challenger and ITF are not covered. Its documentation describes date-range filters and oldest-first output. This is a third-party actor, not an official WTA/ATP feed. Before use, inspect current actor pricing, data rights, terms and the user's available Apify balance. **No actor run was triggered and no credits were spent in this audit.**

Sources:
- https://github.com/getdatagrit/tennis-stats-scraper
- https://sportsapis.dev/tennis-api

### 3. AcesAPI — structured alternative, paid/credit-gated

AcesAPI documents match retrieval by date, tournament, season, round and status, with match IDs, tournament IDs, UTC timestamps, player IDs, scores, sets and status. Its results page describes coverage back to 2007 and notes that incomplete ESPN records are marked incomplete. Its current documentation says a match lookup costs 2 credits; the comparison page advertises 500 free monthly credits. It is a commercial third-party provider, not an official tour feed. No account was connected and no API call was made.

Sources:
- https://acesapi.com/docs/get-matches
- https://acesapi.com/data/tennis-results-api
- https://acesapi.com/compare/tennis-api

### 4. Secondary draw archive — useful only as a cross-check

TennisRaptor exposes archived draw snapshots sourced from Flashscore, with recorded match dates and scores. Its own page warns snapshots may be partial and are not a complete archive. It must not be the sole denominator source. Use only to flag discrepancies against the primary match feed.

Source: https://tennisraptor.com/en/tournaments/draws

### 5. Seoul discrepancy: official draw rendering was incomplete

The WTA official event page confirms Seoul was completed 21–27 September 2026, WTA 250, singles draw 32. A separate results tracker reports 43 singles records, comprising 31 main-draw matches plus 12 qualifying matches, and gives the final result. This shows why the previously inspected official draw-page rendering (24 score-bearing rows) was incomplete as an extraction view. The tracker is secondary and its count is a cross-check only; the final denominator must come from match-level records and official status validation.

Sources:
- https://www.wtatennis.com/tournaments/1024/seoul/2026
- https://www.wtaschedule.com/tournaments/2026/korea-open-seoul-kor

### 6. Singapore confirmation

The official WTA event page confirms Singapore was completed 21–27 September 2026, WTA 500, with a 28-player singles draw. The official WTA news article reports Leylah Fernandez won the final. The previously inspected draw-page rendering showed two walkovers and an empty final slot; this is another case where the draw rendering alone cannot be treated as complete match history.

Sources:
- https://www.wtatennis.com/tournaments/1152/singapore/2026
- https://www.wtatennis.com/news/4578150/singapore-411-dates-draws-schedule-prize-money-and-more

## Extraction decision

Preferred low-friction path for the WTA/ATP Tour stratum:
1. Evaluate the documented ESPN-based Apify actor as the primary structured candidate, after checking its current cost/terms and obtaining explicit approval before any paid run.
2. Alternatively, use AcesAPI only after explicit approval to connect a key or consume credits.
3. Use official WTA/ATP pages and independent draw snapshots to validate event, round, result and disputed status. Do not describe third-party data as official.
4. Keep qualifying out of the declared main-draw sample. Keep doubles out. Exclude walkovers/BYEs from played-match observations; retain retirements as played matches with a retirement status. Exclude postponed/cancelled/unplayed matches.
5. Join a genuinely historical weekly ranking snapshot from before each event. Current top-150 rankings are not a substitute. If historical ranking snapshots cannot be sourced, report ranking-join failures and do not silently infer eligibility from seeds.
6. Keep Challenger, WTA 125 and ITF in separate strata; the ESPN actor documented here does not cover them.

## Decision gate

No scraper/API was run, no external credits were consumed, and no source was added to Production. Next action requiring user authorization: choose whether to run the Apify actor after reviewing its cost/terms, or connect an API provider. The repository research can continue with public cross-checks without spending credits, but a complete auditable match denominator requires structured match-level data and historical rankings.

## Current status

- Seoul and Singapore: secondary cross-checks identified; official draw-page extraction views are incomplete.
- Remaining WTA events and WTA Finals: not yet match-level extracted.
- ATP events: not yet match-level extracted.
- Historical pre-event ranking joins: not yet complete.
- Final denominator: **not established**.
- No intent labels, classifier weights, probabilities, EV, bet selection, live UI or Production behavior changed.
