# TennisData.App — updated commercial ML rights and access review

**Review date:** 2026-11-22  
**Terms version reviewed:** Last updated 2026-11-15  
**Status:** Public terms/docs reviewed. No account created, no card submitted, no API key obtained, no data downloaded, no payment made.

## Key finding: express commercial ML permission

Section 18 of the current Terms expressly permits a user to download, store, process, combine, transform and analyze lawfully accessed data for personal, academic, research, professional or commercial purposes.

It specifically permits:
- statistical and machine-learning model training, testing and evaluation;
- use of third-party AI/LLM tools;
- commercial exploitation of the user's own analyses, models, charts, conclusions and other original outputs;
- retention of lawfully downloaded files for those permitted analytical uses;
- continued use of lawfully downloaded data and original derived outputs after subscription expiration.

Sections 18 and 20 prohibit redistribution, sublicensing, sale, public hosting or systematic republication of original CSV files, raw datasets, substantial database reproductions or a materially equivalent substitute dataset/service. The Terms expressly distinguish independent analytical models, reports, dashboards and commercial products from a substitute data service.

Official terms:
https://tennisdata.app/terms/

Relevant sections:
- Section 18, lines 229–238: https://tennisdata.app/terms/
- Section 20, lines 242–253: https://tennisdata.app/terms/
- Section 21, lines 255–262: third-party data dependencies.
- Section 26, lines 296–300: permitted retention after expiration.

## Important residual rights risk — third-party provenance

The permission is strong as between TennisDataApp and the customer, but it does not transfer third-party intellectual property rights that TennisDataApp does not own or license to sublicense (Section 18).

Section 21 says the service relies on third-party providers for sports data and that TennisDataApp does not control their licensing decisions or guarantee uninterrupted access. The Terms do not provide a detailed source-by-source rights register or a warranty/indemnity that every upstream match record, statistic, odds field or point sequence is cleared for commercial ML training.

Therefore:
- The customer-facing contract expressly authorizes commercial ML use of lawfully accessed data from the service.
- Upstream provenance and third-party rights remain a due-diligence question.
- Before relying on the data at scale, ask TennisDataApp to identify the source/licensing basis for each data family (results, player IDs, rankings, match statistics, point-by-point, bookmaker odds and odds movements) and confirm it has authority to grant the Section 18 use permission for those fields.
- Preserve the exact Terms version, acquisition date, plan, endpoint/export and source provenance with every acquired batch.
- Do not redistribute raw data or publish substantial portions of it.

## Access and cost facts

Current Terms (Section 6):
- Website Stats & Predictions plans: Starter €9.99/month (500 research/CSV actions); Plus €26.99/3 months (1,500); Pro €49.99/6 months (3,000); Premium €89.99/12 months (6,000).
- API Starter €24.99/month, 150,000 request units; API Pro €39.99/month, 250,000 units.
- Website memberships and API plans are separate products.
- Website trial: 3 days, card-backed, 150 actions; unless cancelled before trial ends, selected subscription starts and card is charged.
- API free credits: 300 units after successful debit/credit card verification and eligibility checks; not a subscription and no scheduled charge. This is not a no-card free tier.
- API rate limit up to 3 calls/second; endpoint unit costs vary.

No account or card was created/submitted. User approval would be required before doing so.

Official terms: https://tennisdata.app/terms/  
API docs: https://tennisdata.app/tennis-api/docs/

## Data/technical value

The API documentation exposes distinct endpoints for match identity/details, bookmaker odds, match statistics, point-by-point progression and odds movements. Point-by-point fields include set/game progression, server, break-of-serve side and last scorer. Endpoint calls have separate request-unit costs.

This may be useful for:
- match-result and player identity enrichment;
- bookmaker odds history / odds movement research;
- match-statistics and point-progression features;
- training/evaluation with a clear release and source record.

The actual season-by-season coverage, missingness and point-by-point completeness still need measurement from a legally obtained sample. Do not infer full historical PBP coverage from endpoint existence.

## Practical acquisition blocker

A prior automated discovery attempt against the downloads area returned HTTP 403/bot protection. Do not bypass CAPTCHA, access controls or hidden URLs. User has already emailed support asking for an authorized bulk-download route and is awaiting a response.

A documented API route may be an alternative, but it is not automatically a bulk export and its cost/unit budget must be checked before any paid use.

## Decision

**Best current contractual fit for commercial ML training among the reviewed accessible providers, subject to upstream provenance confirmation and lawful acquisition.**

It is materially stronger than providers whose terms prohibit model training or long-term storage. It is not yet a fully cleared corpus because upstream data rights are not itemized and the authorized bulk acquisition route remains unresolved.

Next gates:
1. Receive provider response to the user's existing bulk-download inquiry.
2. Obtain source-by-source provenance and confirmation of upstream rights for commercial ML training/retention.
3. Obtain a small authorized sample (no account/key creation or paid access without explicit user approval).
4. Audit sample coverage, duplicate rate, IDs, surface, timestamps, PBP completeness, stats availability and bookmaker-odds coverage.
5. Only then estimate cost and recommend whether to acquire.

## Production boundary

Research only. No Production code, calculations, API keys, Cloudflare Worker, Winamax scraper or deployment changed.
