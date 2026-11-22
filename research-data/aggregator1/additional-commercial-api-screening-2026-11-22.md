# Aggregator 1 — additional commercial API screening
Date: 2026-11-22
Branch: `research/aggregator1-linkage-audit`

## Cito API / tennisapi.dev — useful coverage, but not cleared for Tennis Value Scanner

Official pages:
- Cito historical tennis data: https://citoapi.com/historical-tennis-data/
- Cito Terms: https://citoapi.com/terms/
- tennisapi.dev product page: https://tennisapi.dev/tennis-results-api/

Published data claims:
- Cito advertises 1,779,582 match records across 58,797 tournament editions, with ATP/WTA, Challenger, WTA 125, ITF and team events.
- Men's tour-level serve statistics are described as present for most matches since 1991 and near-complete since 2016; women's tour-level serve statistics from 2016; Challenger stats from 2010 (men) and 2016 (women); ITF/team event rows are results-only.
- Match records include scores, surface, round, tier, player IDs and ranking at match time where available; player career/season serve and return statistics are also advertised.
- Bulk CSV archive is advertised on paid plans. tennisapi.dev currently describes Business CSV as $299/month; the Cito page directs users to paid plans for bulk export.

Terms updated November 2026 — material restrictions:
- Cito explicitly says it is an independent aggregator, not affiliated with or licensed by ATP/WTA/ITF or other rights holders.
- It expressly disclaims warranties of third-party data rights, provenance and non-infringement; it provides no indemnity for third-party claims.
- The terms prohibit use by or for a sportsbook, bookmaker, betting exchange or wagering operator, including odds pricing, trading/risk management and settlement.
- The terms do permit analytics/research and tools for individual bettors (including statistics, models and odds comparison), provided the product is not operated by or for a wagering operator.
- No raw data feed resale/redistribution or competing data service; data is licensed for internal use and display within the customer's own product.
- The terms do not expressly grant a clear, standalone right to train and retain an independent ML model on the full historical corpus. They permit analytics and model tools for individual bettors, but this needs written clarification before training.
- Coverage may be changed or withdrawn without notice.

Assessment:
- Potentially useful as a secondary source for results, serve/return box scores, rankings and player history.
- Not approved for ingestion/training yet: third-party rights/provenance are expressly disclaimed and the model-training permission is not explicit enough for our use case.
- Ask Cito in writing whether an individual developer may use lawfully accessed tennis records to train and retain an internal match-winner model that powers a paid/unpaid analytics tool for individual bettors in France, and whether any source-specific restrictions apply.
- Do not create an account, request a key, start a trial or purchase a plan without explicit user approval. No API calls or downloads were made.

## Live Tennis API commercial subscription — not equivalent to its academic archive

Official sources:
- Terms: https://livetennisapi.com/terms
- Historical archive docs: https://docs.livetennisapi.com/historical-results-archive.html
- Historical ML guide: https://blog.livetennisapi.com/blog/historical-tennis-data-machine-learning

The paid API advertises a licensed historical results corpus for ATP/WTA and lower tiers (1968–2022), with serve statistics where the era recorded them. Its separate point-by-point tapes include reconstructed 2013–2022 sequences without capture timestamps; docs state 97,901 matches / 14,340,663 rows for that tape.

However, the current API Terms:
- License responses for use within the customer's own applications/services.
- Prohibit republishing raw API responses as a competing feed or bulk dataset and restrict caching/storing data beyond what is reasonably necessary to operate the application.
- Do not explicitly grant model training, long-term internal training archives, or retention of model parameters trained on the data.
- State that the underlying compilation/data remains provider property and provide no warranty of completeness or accuracy.

Assessment: do not use the paid Live Tennis API archive as a model-training dataset unless the provider confirms model-training and retention rights in writing. This is separate from the academic public archive, which remains CC BY-NC 4.0 and non-commercial.

## Updated candidate ranking

1. **Data for Tennis** — best current contractual fit for feature engineering and ML training, subject to entitlement, release-level coverage, and third-party provenance.
2. **TennisData.app** — terms expressly permit commercial ML training; technical access and source-level rights are still unverified, support response pending.
3. **AcesAPI** — internal commercial research/model training is permitted by its terms, but historical coverage is selective and third-party source restrictions may apply.
4. **Cito API** — broad archive and serve statistics; individual-bettor analytics appears permitted, but training/retention rights and underlying source provenance need written clarification.
5. **Live Tennis API paid archive** — broad historical corpus, but current API terms do not clearly authorize ML training or retention of a training archive.

No source above was connected to Production or ingested. No account, API key, trial, paid subscription or purchase was created.
