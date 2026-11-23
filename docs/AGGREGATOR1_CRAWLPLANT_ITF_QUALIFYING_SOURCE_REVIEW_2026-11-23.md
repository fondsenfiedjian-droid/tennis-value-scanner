# Candidate source review: CrawlPlant ATP/WTA/Challenger/ITF match dataset

Date: 2026-11-23  
Status: research only — not approved for use, no API call or purchase made.

## Why it is relevant

The Apify actor `crawlplant/tennis-match-dataset` advertises:
- ATP/WTA history from 1990, Challenger from 2008, ITF from 2011.
- Separate tour selectors including `itf-men` and `itf-women`.
- Qualifying rounds represented in match rows as Q1–Q3.
- Match, tournament and player identifiers from Flashscore.
- `tourney_date` represents the Monday of the main-draw week, so date matching needs a tournament-week-aware window.
- Price shown: $1.00 per 1,000 matches on Apify Free plan; paid tiers lower the per-result rate.

Official actor page: https://apify.com/crawlplant/tennis-match-dataset  
Developer page: https://crawlplant.com/tennis-match-dataset/

## Provenance and rights risk

The actor states it is independent and not affiliated with Flashscore, ATP, WTA or ITF. It says its records are built from public Flashscore match data and official ATP/WTA ranking lists and player profiles. It also states that the legality and publication of the data are the user's responsibility and advises checking the source terms.

This is not a rights clearance. The public actor page does not provide a clear written grant for:
- persistent storage of the extracted third-party match data;
- training or validation of a private predictive model;
- use in a commercial-facing betting-analysis product;
- redistribution or publication of derived data.

The fact that the actor advertises prediction/betting-model use does not establish that Flashscore or other underlying rights holders authorize that use.

## Comparison to current gap

This is a potentially relevant candidate because it explicitly covers ITF men and says qualifying rounds are included. However, the advertised ITF tier and Q1–Q3 output do not establish complete coverage of ATP ITF qualifying or prove that the rows map to Valuebetennis round codes 1–3. The Flashscore IDs are a separate namespace and require a distinct crosswalk. The tournament-week date semantics must be handled separately from exact match dates.

## Decision

1. Do not call the actor, create a task, purchase credits, or ingest data without explicit user approval and written rights clarification.
2. Ask the developer for written details of source provenance and the exact rights they can grant for persistent private retention, model training/validation, commercial use in Tennis Value Scanner for individual bettors, and derived model parameters/features.
3. Separately require confirmation of any applicable Flashscore/ATP/ITF terms and rights; a developer's own permission cannot grant rights they do not hold.
4. If rights are satisfactorily documented and the user authorizes a capped test, compare a small sample in an isolated source namespace, never merging Flashscore IDs with Valuebetennis/Sackmann IDs by assumption.
5. Do not treat this as a cleared alternative to Cito or as an immediate fix.

## Other note

TennisMyLife publicly lists separate ATP Tour qualifying CSVs, but its current public terms restrict use to personal, educational and non-commercial research and require express written permission for commercial model training/validation. Therefore it is not a cleared commercial-model source either.

No raw match rows, player names, IDs, API responses, or downloaded data are included in this report.
