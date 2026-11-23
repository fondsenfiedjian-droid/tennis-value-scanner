# Source review: TennisData.App API and dataset terms

Date: 2026-11-23  
Status: research only — no account, card verification, API call, download, or purchase.

## Why it was reviewed

TennisData.App publishes unusually explicit terms on model training and commercial analytical use. Section 18 permits lawful users to store, process, combine, transform and analyze legitimately obtained data for commercial purposes, including training/testing/evaluating statistical and machine-learning models. It also permits commercial exploitation of original models and derived outputs and retention of lawfully downloaded files after subscription expiry.

Official terms: https://tennisdata.app/terms/

## Important qualification: third-party rights are not granted

The same terms expressly state that the permission does not transfer third-party intellectual-property rights that TennisData.App does not own or have a right to sublicense. Section 21 says the service depends on third-party sports-data providers and does not control their licensing decisions.

Therefore, this is materially clearer than providers whose terms are silent about model training, but it is not a complete rights clearance. We would still need to identify the underlying data sources and confirm that the provider is authorized to grant the relevant commercial retention and model-training permissions.

Relevant terms:
- Section 18: lawful retention, commercial analysis and model training, derived output rights, restrictions on raw-data redistribution.
- Section 20: prohibits scraping except through the official API and prohibits raw dataset redistribution/substitute feeds.
- Section 21: third-party data dependencies and licensing caveat.

## Coverage fit for the current ATP ITF qualifying gap

The reviewed API documentation is not a fit for the specific ATP ITF qualifying gap:
- The commercial API is documented for ATP and WTA circuits.
- Its tournament categories are ATP, ATP Challenger, WTA and WTA Challenger.
- The only qualifying indication found is a generic `round = Qualifier` value.
- The documentation contains no ITF competition category or separate Futures/ITF qualifying tier.
- No season-by-season ITF qualifying archive or coverage table was found.

Official API docs: https://tennisdata.app/tennis-api/docs/

Accordingly, it should not be treated as a replacement source for ATP men's ITF qualifying. It may be worth a separate future review for its ATP/WTA tour-level data and explicit derived-model permissions, but only after third-party provenance is clarified.

## Pricing and operational caution

The current terms list API Starter at €24.99/month for 150,000 request units and API Pro at €39.99/month for 250,000 units. Eligible accounts may receive 300 non-expiring free API units after debit/credit card verification and eligibility checks. That verification requires a payment card, so it is not a no-payment/no-risk free trial in the ordinary sense; no account or card action was taken.

Website CSV membership plans are separate from API access. New card subscriptions renew automatically; the terms say general refunds are not offered once a paid period begins.

## Decision

1. Do not use this provider to close the ATP ITF qualifying gap: documented coverage does not show ITF/Futures.
2. Do not create an account or verify a card without explicit user approval.
3. If ever considered for a different ATP/WTA dataset role, first obtain written identification of upstream data sources and confirmation that TennisData.App has rights to authorize commercial retention and model training for those sources.
4. Do not interpret the Section 18 model-training permission as overriding third-party rights or as permission to redistribute raw match rows.

No raw data, match rows, player names or IDs are included in this report.
