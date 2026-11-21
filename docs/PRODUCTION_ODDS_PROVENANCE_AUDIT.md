# Production probability, EV and odds-provenance audit

Audit date: 2026-11-22  
Audited baseline: `main` at `d66260cce60294c1b6a48451a9ef96cd1f2b6c38`  
Scope: source-code behavior only. This is not a live production smoke test and does not prove that current external feeds are available.

## 1. Probability source

The Worker `GET/POST /predict` path requires both player IDs for live player data. It retrieves both profiles from Live Tennis API and selects an Elo rating through `findEloForSurface(profile, requestedSurface)`. A surface-specific rating is used when available; otherwise the selection falls back to the overall rating. The response identifies the method as `Elo` and reports the rating source/type, date and plausibility checks.

The match probability is the standard Elo logistic transform:
`pA = eloProbability(ratingA, ratingB)`; `pB = 1 - pA`.

The Worker response explicitly notes that the model does not account for injuries or recent form. Recent-form, serve/return and score-simulation research modules do not alter this Worker probability in the audited production path.

## 2. EV source and formula

The frontend computes each side's expected value from the Elo probability and the selected side's decimal quote:
`EV% = (probability × decimalOdds − 1) × 100`.

The exact probability field is preferred; the rounded percentage is only a fallback. Fair odds are the reciprocal of the Elo probability. The configured minimum/maximum odds range filters eligible value candidates separately from whether a quote is displayed.

## 3. PFE relationship

The frontend builds a PFE diagnostic from:
- `general-elo-v2`: the Elo probability;
- `market-consensus`: a no-vig probability calculated from a complete two-sided quote pair from the same bookmaker and event.

PFE's fused probability is displayed as a diagnostic and its status is used by the value-quality gate. The audited frontend does not feed `pfeAssessment.probability` back into the EV formula. EV remains Elo probability × selected quote. A conflict can block eligibility; a provisional state does not by itself block the basic value gate. The separate reliability gate requires at least two independent groups and stronger data-quality conditions.

A UI-label correction is tracked separately in PR #154 so the Elo probability used for EV is visibly distinguished from the fused PFE diagnostic. No production probability weights are changed by that work.

## 4. Odds ingestion and validation

Worker `GET /odds`:
- reads the latest successful run dataset from the configured Apify Winamax task;
- rejects non-JSON and non-array payloads;
- returns the raw dataset items plus retrieval/run metadata and aggregate diagnostics;
- caches the response for five minutes;
- does not substitute Worker retrieval time for the per-item `scrapedAt` value.

Frontend quote matching requires an enabled French bookmaker source, tennis sport, match-winner market, no handicap/line, home/away outcomes, matching player identities, compatible tournament, and a future event start within 36 hours of the Live Tennis schedule time. Quote `scrapedAt` must be parseable, not more than five minutes in the future, and no older than six hours.

Quotes are grouped by bookmaker and event ID (or a fallback composite key). The latest quote per outcome is selected. A two-sided pair is accepted only when the two scrape timestamps differ by no more than 30 minutes.

The frontend then selects the highest available decimal price for each player side across all matched bookmaker pairs. The bookmaker is retained and displayed for each selected side. PFE market consensus is stricter: it is available only when both selected sides are from the same bookmaker and event.

## 5. Confirmed strengths

- Probability, odds and EV are kept as separate inputs.
- The Worker does not claim that an Apify scrape timestamp is an exact bookmaker quote-change timestamp.
- Invalid market types, line markets, mismatched players/tournaments, non-prematch events, stale quotes and incomplete two-sided pairs are excluded from the matched quote set.
- Cross-bookmaker event IDs are not incorrectly treated as shared IDs.
- PFE does not silently overwrite the Elo probability used by the EV calculation.
- The selected quote's bookmaker is carried into the match card and prediction archive.

## 6. Remaining operational and product risks

1. **Bookmaker actionability:** the best quote for a side may come from Betclic or NetBet rather than Winamax. The code displays the source, but a user who can place bets only at Winamax must not assume every highest-EV recommendation is available there. A preferred-bookmaker filter would make this explicit.
2. **Scrape-time uncertainty:** `scrapedAt` is an observation time from the scraper, not proof of the exact time the bookmaker changed or published the price.
3. **Pair skew:** a 30-minute maximum difference between the two outcomes is a broad ceiling for volatile markets. It is a data-integrity limit, not proof that both prices were simultaneously executable.
4. **Six-hour freshness ceiling:** this permits quotes that may be too old for a practical betting decision. The stricter reliability tier and visible freshness label mitigate but do not eliminate this risk.
5. **Live status unverified:** this audit reads repository code only. Current Worker, Apify task, bookmaker coverage and Netlify deployment must be checked separately before asserting live availability.
6. **Model quality:** correct EV arithmetic does not imply that Elo probabilities are calibrated or profitable. Continue paired chronological model-vs-market evaluation and paper ROI collection; do not infer ROI from hit rate.

## 7. Recommended next steps

1. Add a persistent preferred-bookmaker setting, defaulting to Winamax for a Winamax-only workflow, while retaining an explicit all-books comparison mode.
2. Make the bookmaker used for each EV calculation prominent on every recommendation and export.
3. Consider a tighter pair-skew threshold after measuring real quote coverage; do not silently relax matching to increase quote count.
4. Record the actual selected quote's source, scrape time and retrieval time in every prediction snapshot.
5. Validate against real upcoming matches and independently check several prices at the bookmaker before using the scanner operationally.

## 8. Non-changes

This audit does not change the model, EV formula, bookmaker registry, quote-matching thresholds, Worker, API credentials, Apify task, production deployment or betting behavior.
