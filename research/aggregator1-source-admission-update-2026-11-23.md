# Aggregator 1 — source admission update (2026-11-23)

This addendum supersedes any earlier statement in the corpus design that AcesAPI has not been account-tested. It does not change the historical findings recorded in the original design document.

## AcesAPI status

- A free AcesAPI account and API key now exist; the key is stored only as the GitHub Actions secret `ACESAPI_API_KEY`.
- Official documentation and current account terms were reviewed. The published terms permit internal research and model training while the account is active, subject to third-party restrictions and prohibitions on raw/bulk redistribution.
- The API was sampled through bounded GitHub Actions preflights. Do not treat these first-page samples as a complete historical archive.
- AcesAPI match preflight (2025, one 100-row page per tour): ATP 100 rows and WTA 100 rows, both with `next_offset=100`; this is only a first-page sample. The sample had all required core fields, but does not establish annual or tier completeness.
- Tournament catalogue preflight (2025): ATP 61 rows with no next offset; WTA 100 rows with `next_offset=100`. ATP's returned page is not proof of full season or lower-tier completeness. WTA is demonstrably paginated.
- The tournament sample includes four major-flagged events per tour; the boolean `major` field is not a competition-tier taxonomy. Do not infer ATP 250/500/1000, Challenger, Futures, WTA 125 or ITF tiers from it.
- The WTA first page has nine missing surface values and 91 rows meeting the preflight's core-field completeness predicate. One WTA row reports `live` status in the 2025 catalogue. These are observed anomalies, not yet diagnosed defects.
- Two identical tournament preflight workflow runs were accidentally submitted. Actual tournament catalogue request cost was four credits total (two per run), not two. No further AcesAPI calls are authorized by that execution; request additional credits only after a separately approved ceiling.

## Current admission decision

**AcesAPI: conditional candidate for internal historical research/model training, not yet admitted to the canonical corpus.**

Admission remains blocked until the following are independently demonstrated:

1. Sufficient year-by-year ATP/WTA coverage, with main draw and qualifying separated.
2. Competition-tier coverage explicitly verified from source records or independent event classification; no inferred tiers from `major`.
3. Paginated coverage quantified without assuming that the first page is representative.
4. Match-date precision and event-start dates kept distinct.
5. Player/match identity and duplicate conflicts audited against existing sources.
6. Elo-before values are timestamp-safe for pre-match features; Elo-after values are post-match only and excluded from pre-match features.
7. Third-party restrictions are checked for the actual upstream records, not only AcesAPI's general terms.

## Current no-call / no-training boundary

- No more AcesAPI requests without explicit approval of a bounded credit budget.
- Do not use Live Tennis API Basic archive records for persistent training storage until written permission is obtained.
- Sackmann remains CC BY-NC-SA 4.0; no commercial-use assumption.
- TennisMyLife remains non-commercial/personal-educational unless separately licensed.
- Valuebetennis CC BY 4.0 attribution must be preserved.
- No raw licensed source records or provider responses in Git commits or public workflow artifacts.
- No Production integration, deployment, API secret changes, or main model training as part of this research update.

## Next offline task

Use the already downloaded public Valuebetennis and Sackmann datasets in the existing bounded full-audit workflow to produce year/tour/category coverage tables and a reproducible source manifest. Keep all raw downloads in ephemeral runner storage and upload aggregate reports/checksums only. AcesAPI remains excluded from the numerical completeness denominator until a sufficiently broad, authorized sample exists.
