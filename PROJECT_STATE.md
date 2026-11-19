# Tennis Value Scanner — Project State

Last updated: 2026-11-19  
Repository: https://github.com/fondsenfiedjian-droid/tennis-value-scanner  
Default branch: `main`

This file is the durable handoff record for future development sessions. Update it whenever architecture, deployment state, user-approved scope, or the next priority changes. Treat repository code and this document as the source of truth; do not rely on conversational memory alone.

## 1. Product purpose and scope

Tennis Value Scanner is an analytical PWA for tennis match discovery, bookmaker odds comparison, probability estimation, and value-bet research.

Primary priorities:
1. Reliable, visible bookmaker odds and clear quote freshness/provenance.
2. Probability estimates and EV calculation that do not confuse displayed odds with eligible odds.
3. Prediction quality: Brier score, LogLoss, calibration, CLV, chronological holdouts, and honest sample-size warnings.
4. Practical app usability on mobile.

Bankroll/ledger is auxiliary: record actual bets, profit, and open obligations. Winamax CSV import is for manual reconciliation only.

Explicit product constraints:
- No automatic bet placement.
- No automatic money movement or bookmaker account control.
- No automatic stake changes, daily stop-loss, or blocking bets after losing days.
- Do not imply that Winamax balance is available through an API.
- Do not migrate hosting or purchase data/services without explicit user approval.
- Keep analytical outputs separate from proof of profitability.

## 2. Repository architecture

Key files:
- `index.html` — main PWA interface, match cards, odds display, model UI, settings and skin selection.
- `worker.js` — Cloudflare Worker API proxy, including odds and player-stat routes.
- `pfe.js` — Prediction Fusion Engine.
- `bankroll.js` — ledger, bankroll and performance diagnostics.
- `winamax-import.js` — manual Winamax CSV import.
- `sw.js` — PWA service-worker shell/cache.
- `wrangler.toml` — Worker configuration.
- `scripts/backtest.mjs` — historical prediction backtest.
- `scripts/odds-backtest.mjs` — historical odds/EV/CLV backtest.
- `scripts/valuebetennis-backtest.mjs` — Valuebetennis CSV import and model-vs-market comparison.
- `tests/` — regression tests for app UI, Worker, bankroll, PFE and backtests.
- `.github/workflows/tests.yml` — GitHub Actions regression workflow.

External services:
- PWA (Netlify): https://fascinating-paprenjak-1aa9b3.netlify.app
- Netlify project: `fascinating-paprenjak-1aa9b3`
- Worker: https://tennis-value-api.fonds-enfiedjian.workers.dev
- Worker name: `tennis-value-api`
- Netlify billing/credits: https://app.netlify.com/account/billing

Historically configured Worker secrets: `LIVE_TENNIS_API_KEY`, `APIFY_TOKEN`. Never expose secret values in code, logs, documentation, or chat.

## 3. Current repository state (2026-11-19)

Latest known main commit (2026-11-19):
- `8c4c2a6e0c09f81f26a23739fb3048c74aba8e6c`
- Commit message: `Test Apify rate limits and malformed odds payloads`
- The last application-code baseline before the Apify hardening was `fbb134e4bf8002a9ff5fc03a5d21c4543be15344` (`Verify official Live Tennis match response shape`).

Latest GitHub Actions runs:
- Project-state documentation commit `c50e91b491320337b14dfeaf2279c003b8270527`: run `44505644676` completed successfully.
- Manual-refresh/cache change commit `00329d4fa805e8cdb247f7a7bed63ebaffbf6d59`: run `44507070552` completed successfully.
- UI regression test commit `38ae43dc38c509429bdde9d051e5c659e03ba8d1`: run `44507092712` completed successfully.
- Fallback timestamp validation commit `be304ca21f403dbf9235c7c3fd7e2dde8bea58af`: run `44507118462` completed successfully.
- Added assertions commit `b43f2c559a2c780cdcdb9a1e213582a8f56ccfdf`: run `44507127578` completed successfully.
- Worker odds endpoint validation commit `d03d984c36312a000557b898b426cb3c1e535474`: run `44507715902` completed successfully; 295 tests passed, 0 failed.
- Odds-to-match matching commit `3529145e5f164dfbe81b72e3abad04e301d74a7a`: run `44507849997` completed successfully; 298 tests passed, 0 failed.
- Odds timestamp display commit `4aa34b6186416cc18c91877d8c8097f96ecd51fc`: run `44508513931` completed successfully; 299 tests passed, 0 failed.
- Empty-schedule handling commit `b098eb73e861a74ab60fe50ed4c31944993f355d`: run `44508716312` completed successfully; 301 tests passed, 0 failed.
- Schedule cache-bypass and rate-limit commit `0f806d1233e04e0d01df9a785442165df9a592ef`: run `44509212122` completed successfully; 305 tests passed, 0 failed. README documentation update `c03cbe55430833d9104e9f219486cda03e8f463d` followed.
- Cache transparency commit `bc4eecb1a13c4cc0a760e519423a92ee278850f1`: run `44509477732` completed successfully; 306 tests passed, 0 failed.
- Current head `8c4c2a6e0c09f81f26a23739fb3048c74aba8e6c`: run `44510888159` completed successfully; 309 tests passed, 0 failed.
- Apify retry/JSON handling commit `6496a41f591533611be7714aaad73361fead062f`: run `44510880700` completed successfully.
- An earlier cache-bump commit run `44503164672` failed because ten tests asserted older service-worker cache-version strings after the cache advanced. The immediately following commit updated the expected version and passed. This was a sequencing mismatch, not a persistent test failure.

Recent app changes in GitHub:
- Worker `/odds` now rejects non-array Apify dataset responses with HTTP 502 instead of treating them as a successful empty feed; malformed data is not cached.
- Worker `/odds` now forwards Apify `Retry-After` on upstream failures (including 429) while returning only a sanitized error and upstream status, not the upstream response body.
- Worker `/odds` now distinguishes invalid JSON from a non-array JSON payload; neither failure is cached. Regression tests cover retry timing, sanitized errors, malformed JSON and cache-write prevention.
- Worker `/odds` response includes `retrievedAt` separately from each quote's `scrapedAt`; the former records Worker retrieval time and must not be substituted for quote scrape time.
- Regression tests cover missing Apify secret, method validation, successful array payload, cache MISS/HIT behavior, and malformed dataset rejection.
- Frontend odds-matching tests execute the real matching functions and verify reversed player order, same-event pairing, tournament mismatch rejection, stale-quote rejection and the 30-minute pair-skew rule.
- Manual refresh button and Matches navigation now force a fresh schedule request through both cache layers: the PWA bypasses its recent schedule cache and passes Worker-only `fresh=true`; the Worker skips its 15-minute Cloudflare cache, fetches Live Tennis and refreshes the canonical cache entry. Initial startup can still reuse a valid recent browser cache or Worker cache.
- Worker `/matches` responses now expose `X-Data-Cache: HIT|MISS`; upstream `Retry-After` is forwarded for rate-limit handling. The `fresh` flag is validated and never forwarded to Live Tennis.
- Match-list UI now reports whether the schedule came from a fresh upstream response (`MISS`), Cloudflare cache (`HIT`) or an unknown cache state; the local browser-cache path is labelled separately.
- Match-cache timestamps are now validated for finite, non-future values before reuse, including offline fallback. Expired or future-dated caches are not treated as valid.
- UI regression tests cover manual/scheduled refresh bypass and both cache fallback validation paths.
- Best available bookmaker quote is displayed directly on the match card, without expanding details.
- Displaying an odds quote is separate from EV eligibility: EV still uses only quotes inside configured minimum/maximum odds filters.
- Missing odds and odds outside the EV range have distinct explanatory states.
- Odds feed status reports quote count and quote freshness from `scrapedAt`, separately from the Worker/Apify dataset retrieval timestamp `retrievedAt`; this distinction persists in local cache and remains visible during offline fallback. Missing retrieval timestamps are shown as unknown, not inferred from local browser time.
- Service-worker static shell cache is v107, so the updated PWA shell replaces older cached copies.
- Match schedule parsing now distinguishes a valid empty schedule (`[]` or a recognized empty `matches`/`data`/`results`/`events` array) from an unrecognized API payload. Empty schedules render as no matches and are cached/reused; they no longer trigger a false format error or silently fall back to stale matches.
- Regression tests now include the official Live Tennis response shape (`data` list, `players.p1/p2.name`, `tour`, and UTC `scheduled_time`) as well as a valid empty `data` list.
- API connection state is dynamic rather than a permanently optimistic “connected” label.
- Prediction cache lookup uses the same versioned, surface-specific key as prediction storage.
- Service-worker cache version is v107.
- Regression coverage added for odds display, EV filtering, cache-key consistency, API status and odds freshness.

Important deployment distinction:
- Code commits to GitHub do not mean the live Netlify PWA has been updated.
- Netlify production deploys were previously paused due operational credits. Current deployment status must be checked before saying that new UI/code is live.
- A successful GitHub Actions run validates repository tests, not the live Netlify site or live bookmaker feed.
- Live Worker/API and quote feed have not been conclusively verified in the latest session. Do not claim live odds are currently arriving until checked.


### Settings reliability fix (2026-11-19)
- Fixed a real UI defect: selecting a skin previously persisted the value but did not apply it until a page reload. The Save handler now applies the committed skin immediately.
- Skin selection now previews immediately; Cancel or tapping the modal backdrop restores the last saved skin.
- Tournament-filter storage writes now catch localStorage failures and show a user-facing message instead of an uncaught exception.
- Service-worker shell cache advanced to v108 so clients install the corrected HTML/JS after the next deployment.
- Regression tests added for live theme preview, Save application, Cancel rollback, persisted settings and service-worker cache invalidation.
- Final code/test head: `8621d326e7a9c4e4963f4ca5156f80474ada25e6`; GitHub Actions run `44512296529` executed 312 tests: 312 passed, 0 failed (job test step successful).
- The intermediate full-suite failures were stale test expectations for cache v107 after the deliberate v108 bump; all ten assertions were updated and the final test step passed.
- This is a GitHub code change only; production deployment has not yet been confirmed.

## 4. Odds and feed rules

- Worker odds route requires `APIFY_TOKEN`.
- Worker reads Apify dataset `ZBWihC1oYU8Pq9uBo` and caches responses for five minutes.
- App freshness logic uses `scrapedAt` as scrape-time evidence, not as the exact bookmaker quote-publication or quote-change timestamp.
- App treats quotes as fresh for up to 90 minutes and requires the two sides of a bookmaker pair to be within 30 minutes of each other.
- Never present stale, incomplete, mismatched-bookmaker or unverified quote pairs as valid value opportunities.
- Keep source provenance visible; distinguish scrape time, observation time, model calculation time and archive time.

## 5. Prediction Fusion Engine (PFE)

Implemented:
- General Elo and bookmaker-market consensus are active model sources.
- Correlated model inputs are grouped to avoid double counting.
- PFE status distinguishes provisional, conflict and consensus.
- Seeded Monte Carlo with configurable simulation count and uncertainty interval.
- Historical model evaluation uses verified pre-match records and chronological holdout; candidate weights are diagnostic and are not automatically applied.
- Recent-form and serve/return adapters require strict validation and sample thresholds.
- Exact hold, tiebreak, set and match probabilities are calculated only when format/input requirements are verified; scenario outputs are diagnostic and must not silently alter EV or stakes.
- Market comparison uses same-bookmaker paired quotes and strict match/result/time identity checks.
- Brier, LogLoss, calibration and segment diagnostics are available.

Cautions:
- Elo trained from a cold start in 2026 is exploratory without prior-season warmup.
- Heuristic Elo variants are not trained production models.
- A market benchmark is not proof that a user can obtain that exact price.
- Never claim a model is profitable based only on retrospective fit or a small sample.

## 6. Historical data and licensing

Valuebetennis:
- Source: https://www.valuebetennis.com/en/donnees.htm
- Licence: CC BY 4.0; attribute the source when reusing.
- Annual CSVs contain ATP/WTA singles history and Pinnacle opening/last pre-match odds.
- Dataset has one bookmaker and no complete quote-timestamp history; it is useful for descriptive market/model benchmarking, not a complete multi-bookmaker execution/CLV proof.

Uploaded 2026 file previously validated:
- 80,836 rows, 2026-01-01 through 2026-11-19.
- 76,638 standard completed matches; 4,198 nonstandard outcomes excluded from standard benchmark.
- 45,599 valid two-sided opening odds; 43,296 closing odds.
- Parsed and diagnosed with Python; the full file was not run through the Node CLI at that time. Do not claim otherwise.
- Do not commit user-provided historical archives to the public repository unless explicitly approved.

Tennis-Data.co.uk terms were found to restrict use to private individuals and prohibit commercial product/model-training use without written permission. Do not ingest/train on that source without permission.

## 7. UI design decisions

- Default black skin remains unchanged.
- Experimental “Olive Court” skin: matte olive/felt background, no leaf graphics or patterns; yellow, terracotta and burgundy accents; neutral chrome borders.
- Settings include a skin selector; selection persists after Save.
- The selector is in repository code; do not claim it is live until Netlify deployment is confirmed.
- Financial green/red semantics remain reserved for financial results, not general decoration.

## 8. Next actions — ordered

1. Verify current production Worker `/health` and `/odds`, including the actual Apify item field names, `scrapedAt` coverage, timestamp distribution, bookmaker coverage and two-sided market completeness. Live endpoint access was unavailable during the latest session, so production feed remains unverified; do not infer live data quality from synthetic tests.
2. Verify Netlify credit/deploy state and production deployment without changing hosting or spending money. The current browser-access checks for both Netlify and Worker endpoints failed, so deployment and live service state are unknown.
3. Once production access is confirmed, deploy the current tested `main` build and verify the live PWA displays real odds, both timestamp types, freshness and API errors correctly.
4. Run a small monitored operational trial: compare several upcoming matches against Winamax manually, record missing/mismatched/stale quotes, and verify probabilities/EV against independently checked inputs before using outputs for decisions.
5. Improve usability based on observed live behavior, not speculative feature construction.
6. Continue prediction-quality work only with verified data, chronological splits and honest uncertainty/sample warnings.

## 9. Development protocol

For each work session:
1. Read this file and inspect current `main` before changing anything.
2. Identify one concrete next task and its acceptance criteria.
3. Inspect relevant source and tests; avoid editing based only on remembered summaries.
4. Make a focused change.
5. Run relevant tests or GitHub Actions and inspect failures.
6. Update this file with commit SHA, validation result, deployment state and next action.
7. Report clearly what changed in GitHub, what passed, and what is not deployed/verified.

Never invent test results, data availability, live API status, deployments, URLs, or file contents. Keep secrets out of documentation.

### Settings and Winamax diagnostics hardening (2026-11-19)
- Settings modal now reloads persisted values each time it opens, and the Save handler verifies all numeric thresholds plus refresh rate and skin after writing local storage.
- Skin preview remains immediate; Cancel restores the saved theme.
- Winamax /odds response diagnostics are now retained in the local odds cache and displayed in the empty/error status: dataset record count, bookmakers, home/away outcome counts, valid decimal odds and fresh scrape timestamps.
- PWA cache advanced to v109.
- Latest verified code head: 0060d79691c41d72838e9392d62dc67630b6a1ff; CI run 44514147745: 314 tests passed, 0 failed.
- The repository currently has only a test workflow, no Netlify/Cloudflare deployment workflow. Live Netlify and Worker endpoints could not be reached from the verification environment; production deployment and live odds feed remain unverified.


## Launch-readiness work (2026-11-19, afternoon)

Latest launch-preparation changes:
- Frontend API calls for odds, matches, results, player statistics, and predictions now use a 15-second abort timeout and show a readable timeout message. This prevents the UI from waiting indefinitely on a stalled API request.
- PWA Service Worker cache advanced to `tennis-value-static-v110`; test expectations were updated to the same version.
- Added `.github/workflows/production-smoke.yml`, a manual production smoke test. It checks the Netlify PWA, Worker health, presence (not values) of both required secrets, match response shape, and odds response/diagnostics. It reports an empty odds dataset explicitly rather than treating it as valid coverage.
- Added `DEPLOYMENT_RUNBOOK.md` with the shortest safe sequence for Netlify publication, Worker deployment, smoke testing, Android PWA refresh, and real-device acceptance.
- Regression tests were updated for frontend request timeouts, PWA cache v110, and the PFE loader's timeout wrapper.
- Do not treat the launch as complete until the latest regression workflow is green and the manual production smoke workflow passes against the live URLs.

Deployment still requires operator access to Netlify and Cloudflare. No deployment credentials were added to the repository, and no secrets were exposed. Use the existing Netlify deploy integration or the manual Netlify trigger, and deploy the Worker from an authenticated Wrangler session as described in `DEPLOYMENT_RUNBOOK.md`.
