# Aggregator 1 — Data for Tennis coverage gate review

**Review date:** 2026-11-22  
**Branch:** `research/aggregator1-linkage-audit`  
**Scope:** public coverage page, API coverage contract, terms and current product boundaries. No account, credential, API request, download or purchase.

## Verified public coverage inventory

The public coverage page reports an inventory snapshot updated 2026-09-11:
- 346 tournament editions across six seasons.
- 274 editions with point records.
- The ratio is 79.2% of editions, **not** 79.2% of matches and not a point-sequence completeness rate.
- Edition-level fields include PBP, rally, serve speed and match statistics.
- The page defaults to an ATP 2026 view and does not expose a complete unauthenticated machine-readable export in the inspected page.

Official source: https://datafortennis.com/coverage

## Authenticated coverage contract

The documented `GET /v1/coverage` endpoint accepts optional:
- `release`
- `category` (exact canonical category)
- `season`
- `discipline` (singles/doubles)

The response exposes family-level census, available, missing, unknown, not-applicable, known-applicable, missing-assessment, partial, usable-row and derived-row counts, plus release ID, epoch, schema version and quality version. Pagination uses a cursor.

The endpoint requires an authorized Bearer credential. Documentation also states that counts are measured only within the declared census and do not prove a full calendar or verified-complete PBP.

Official source: https://docs.datafortennis.com/api-reference/get-coverage

## Critical release and denominator distinction

The historical research release is described as a selected singles/doubles corpus. A release name does not imply that every data family reaches the same latest date. Coverage must be reported by release, category/tour, season, discipline, family and grain.

The Challenger snapshot `research-challenger-20261007-v1` is separate from the public six-season edition inventory. Its 62,213 match records and 6,731,406 accepted point rows are not a guarantee of complete PBP; per-match quality may remain partial or unknown. Challenger relative elapsed clocks are not UTC timestamps.

Official sources:
- https://docs.datafortennis.com/start-here/overview
- https://docs.datafortennis.com/data-model/coverage-and-time-evidence
- https://docs.datafortennis.com/data-model/challenger-data

## Terms and access implications

Terms last updated 2026-10-05 expressly permit commercial research, feature engineering, training, evaluation and operation of the user's own statistical/ML models, subject to the accepted entitlement and extraction limits. Lawfully acquired data may be retained after subscription expiry unless an accepted Order specifically restricts retention. Raw/bulk redistribution and substitute data feeds remain prohibited. The operator does not grant third-party rights it does not hold.

Official source: https://datafortennis.com/terms

The service is described in its docs as an authenticated beta. The one-match onboarding sample is free, but account/key creation is required. No account or key has been created and no API request has been made.

## Gate decision

**Do not estimate usable training volume from the 346/274 public edition counts.** They are inventory-level indicators only.

Before any paid acquisition, the following must be completed through an explicitly authorized free sample/account:
1. Capture exact release ID, epoch, schema version and quality version.
2. Export coverage separately for ATP, WTA, Challenger and ITF; by season, singles/doubles and family.
3. Measure complete, partial, missing and unknown records against the declared match census.
4. Calculate PBP density and serve-speed availability only using known-applicable denominators.
5. Validate a stratified sample of point sequences against final scores and set/game states.
6. Obtain source-provenance and rights confirmation for each third-party-sourced family.

## Production boundary

Research only. No Production code, calculations, API keys, Cloudflare Worker, Winamax scraper or deployment changed.
