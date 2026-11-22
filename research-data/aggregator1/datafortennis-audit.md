# Aggregator 1 — Data for Tennis (DataForTennis) audit

**Review date:** 2026-11-22  
**Operator:** ACYCLIC LABS LIMITED (UK company no. 16816653)  
**Status:** public product, coverage, API documentation and Terms reviewed. No account created, API key requested, API call made, dataset downloaded, or purchase made.

## Official references

- Main product: https://datafortennis.com/
- Historical data / Parquet: https://datafortennis.com/historical-data
- Coverage ledger: https://datafortennis.com/coverage
- Pricing: https://datafortennis.com/pricing
- Terms: https://datafortennis.com/terms
- API docs overview: https://docs.datafortennis.com/start-here/overview
- Private exports: https://docs.datafortennis.com/workflows/private-exports
- Point/stat data model: https://docs.datafortennis.com/data-model/points-scores-and-statistics
- Challenger coverage: https://docs.datafortennis.com/data-model/challenger-data
- Contact: https://datafortennis.com/contact (support@datafortennis.com)

## Data and coverage — verified public claims

Landing page archive inventory dated 2026-09-11:
- Six seasons represented, 346 tournament editions, 274 editions with point records.
- 11,875 matches with point records.
- 1,669,201 individual point records.
- 1,041,575 point records with a serve-speed value.
- Point records include match/set/game/point state, server, scorer, serve number and outcome where available.
- Ready-made player serve/return metrics and match metrics expose eligible sample counts.

Historical product page:
- One-time Parquet export is priced at $30 per calendar month without timestamps or $50 with recorded timestamps.
- Individual months or ranges can be selected; only selected months are charged.
- Example files: points.parquet, rally.parquet and strokes.parquet where covered, plus manifest.json with period, scope, field definitions and checksums.
- Example Wimbledon 2025 final shows point-level sequence, server, winner and score state. Its point clocks are null, demonstrating that point order does not guarantee timestamps.

Separate Challenger documentation snapshot `research-challenger-20261007-v1`:
- Men's Challenger singles from 2019 through 2026-10-07, including main and qualifying draws.
- 62,213 distinct Challenger matches, 6,731,406 accepted point rows and 4,904,566 metric rows.
- Per-year matches / matches with observed PBP:
  - 2019: 5,223 / 0
  - 2020: 2,646 / 42
  - 2021: 6,256 / 2,086
  - 2022: 8,757 / 8,745
  - 2023: 9,432 / 8,681
  - 2024: 9,861 / 8,479
  - 2025: 10,302 / 10,177
  - 2026: 9,736 / 9,688
- Combined registry described as 4,050 canonical players, with historical aliases retained.
- The Challenger page explicitly warns that accepted point counts do not prove complete PBP; point quality can remain partial/unknown and Challenger point clocks are relative, not UTC.
- This Challenger release is a separate documented snapshot and must not be conflated with the six-season public landing-page inventory. The coverage ledger must be checked by release, tour, season and data family before estimating a project-wide cohort.

## Identifiers and data quality model

- Own stable IDs: `mat_` match, `ply_` player, `trn_` tournament, `edt_` edition, `drw_` draw, `pnt_` point, `met_` metric.
- IDs are UUIDv4-based. Names, slugs and provider codes are not primary keys; name-only matches do not merge player identities.
- Corrections preserve entity identity and create a new version.
- Point records distinguish source-observed points, derived terminal records and penalties. Null server/outcome/score values remain unknown rather than being guessed.
- Metrics carry versioned definitions, units and numerator/denominator where available. Do not average ratios without their operands or convert missing values into zero.
- Rally categories and reconstructed lengths are not exact observed shot trajectories. Stroke summaries are classified aggregates, not ordered shot sequences.
- Historical timestamps may be observed, received, derived, relative or estimated; they must not be treated as interchangeable.

## Licensing — strongest positive result so far

Terms last updated 2026-10-05. Sections 5–7 are unusually explicit:
- Section 5.1 expressly permits commercial research, analytics, feature engineering, training, evaluation and operation of the user's own statistical/ML models, as well as commercial applications and lawful trading analysis.
- Section 5.1 permits local processing and an internal research archive, within the acquired entitlement and extraction limits.
- Section 5.2 allows commercialization of independently created analyses, features and model parameters, provided they do not expose or enable reconstruction of the licensed dataset as a substitute feed.
- Section 5.3 permits relevant scores, match facts and statistics to be displayed to end users in a substantive application. Raw/bulk machine-readable redistribution or a substitute API/feed requires express written permission.
- Section 6.1 allows lawful acquired copies to be retained and used for permitted commercial purposes after API subscription expiry, unless the accepted Order specifically restricts this.
- Section 7(c) prohibits reconstructing a substantial protected database outside the agreed licence, but says authorized retrieval needed for permitted research/model training is not automatically a breach.
- Section 7(d) prohibits scraping outside the interfaces and permissions made available.
- The terms do not grant third-party rights the operator itself does not hold. Source-specific restrictions and provenance still need scrutiny.

**Important interpretation:** Commercial model training is expressly allowed for data lawfully obtained within the accepted entitlement. This is not a free blanket right to download the whole archive. Every acquisition must stay within the selected product/Order scope and extraction limits; raw dataset redistribution remains prohibited.

## Pricing and access

- Public page offers a one-match free onboarding sample after account/key setup. The homepage says this sample does not consume plan quota.
- API plans: Starter $39/month (100,000 requests; historical match data and player/tournament analytics); Developer $79/month (500,000); Pro $139/month (2,000,000; adds raw PBP); Scale $199/month (5,000,000; raw PBP and additional features).
- Calendar-month Parquet export is separately priced at $30/month of selected data without timestamps or $50/month with timestamps, one-time per selected month, not a recurring subscription.
- A Parquet sample and schema can be inspected before account creation. No paid plan or dataset has been acquired.
- A private export API exists, but the documentation describes it as owner-bound internal artifacts, not a general public dataset SKU; export capability is credential-gated and bounded (default job cap 250,000 rows / 256 MiB, subject to entitlement and capacity).

## Fit for Tennis Value Scanner

**High research value:** ordered points, server and winner identity, serve-speed observations, match/set statistics, serve/return metrics, canonical player/match IDs and explicit data-quality/coverage metadata. These could support future features such as serve/return strength, hold/break tendencies, pressure-point performance and surface-conditioned point models.

**Not a replacement for the current core result/odds corpus:** the public point inventory is much smaller than the headline six-season match coverage; point coverage is selective by tournament edition. Challenger documentation is substantial but PBP completeness is not guaranteed. No Winamax-equivalent odds feed is advertised in the reviewed material.

**Key due-diligence issue:** reconcile the landing-page inventory and the separately documented Challenger release, then obtain an edition-level coverage export for ATP, WTA, Challenger and ITF. Confirm whether the desired Parquet months include match metadata and all point/stat families, and identify provenance/source restrictions for each family.

## Recommended next step — no payment

1. If the user approves, create a free account and use only the free one-match onboarding route; no paid checkout and no card entry unless later explicitly authorized.
2. Obtain the sample match and inspect schema, field null rates, stable IDs, point sequence consistency and manifest.
3. Ask support to confirm the exact source provenance and rights for the point/stat families, and clarify that the proposed use is internal commercial ML research plus derived predictions/features in Tennis Value Scanner (no raw/bulk redistribution).
4. Only after free-sample quality and coverage assessment, estimate the cost of one or two carefully chosen calendar months. Do not buy anything without explicit approval.

## Production boundary

Research only. No Production code, calculations, API keys, Cloudflare Worker, Winamax scraper, or deployment was changed.
