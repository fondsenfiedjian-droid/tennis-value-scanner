# Tennis Value Scanner — Project State

Last updated: 2026-11-20
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

The Bankroll tab and its UI integration have been removed from the active PWA. Legacy bankroll/import source files and tests may remain in the repository but are not loaded by the active app.

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
- Worker reads the latest successful run dataset through Apify task `s9Des4R3jhMfA8e3s` using `/actor-tasks/{taskId}/runs/last/dataset/items?status=SUCCEEDED`; it caches responses for five minutes.
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

Preliminary 2026 chronological Elo diagnostic (19 Nov 2026):
- Analysed the user-provided Valuebetennis 2026 CSV locally; it was not committed to the repository.
- Input: 80,836 rows; 76,638 standard completed matches after outcome/player validation; no duplicate match IDs observed.
- Evaluation: 2026-10-01 through 2026-11-19 (14,496 matches; ATP 8,565, WTA 5,931); Jan-Sep 2026 used only as Elo warm-up. This is still a cold-start single-season experiment.
- Independent chronological implementation of the repository's K=32 Elo and 70/30 surface blend, with same-day batch updates, scored on the paired opening-odds sample (7,853 matches): Elo Brier 0.23392 / log-loss 0.66013 versus no-vig Pinnacle market 0.18762 / 0.55341. Paired Brier loss gap +0.04630 (approx. 95% CI +0.04274 to +0.04986); log-loss gap +0.10672 (95% CI +0.09846 to +0.11497). Closing sample (7,551): Elo 0.23375 / 0.65976 versus market 0.18646 / 0.55006.
- Surface blend did not improve on overall Elo in this holdout. These are probability-quality comparisons, not betting ROI. Do not tune EV thresholds or claim profitability from this result.
- Next validation step: add at least 2025 Valuebetennis data as warm-up, then evaluate 2026 chronologically on the same paired opening/closing odds; ideally add 2021-2024 for longer player-rating warm-up. Valuebetennis publishes these seasons under CC BY 4.0; cite the source if reused. Keep the user's 2026 CSV private and out of Git.


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
- PWA Service Worker cache advanced to `tennis-value-static-v111`; test expectations were updated to the same version.
- Added `.github/workflows/production-smoke.yml`, a manual production smoke test. It checks the Netlify PWA, Worker health, presence (not values) of both required secrets, match response shape, and odds response/diagnostics. It reports an empty odds dataset explicitly rather than treating it as valid coverage.
- Added `DEPLOYMENT_RUNBOOK.md` with the shortest safe sequence for Netlify publication, Worker deployment, smoke testing, Android PWA refresh, and real-device acceptance.
- Regression tests were updated for frontend request timeouts, PWA cache v111, and the PFE loader's timeout wrapper.
- Do not treat the launch as complete until the latest regression workflow is green and the manual production smoke workflow passes against the live URLs.

Deployment still requires operator access to Netlify and Cloudflare. No deployment credentials were added to the repository, and no secrets were exposed. Use the existing Netlify deploy integration or the manual Netlify trigger, and deploy the Worker from an authenticated Wrangler session as described in `DEPLOYMENT_RUNBOOK.md`.


## Bankroll tab removal (2026-11-19)
- Removed the entire Bankroll screen and navigation tab from `index.html`.
- Removed its UI handlers, ledger initialization/reconciliation hooks, Winamax history import controls, and portfolio-plan button from the Best Bet card.
- Removed bankroll and Winamax importer scripts from the app HTML and PWA app shell.
- PWA cache advanced to `tennis-value-static-v111`.
- Regression tests that asserted the removed UI were retired; remaining bankroll module unit tests are not loaded by the application.
- Existing localStorage records are intentionally not erased by this UI removal.


### Apify task integration preparation (2026-11-19)
- User created Apify task `s9Des4R3jhMfA8e3s` from Actor `U02iN54229fsqL4EN` ("Winamax Odds Scraper API").
- Worker `/odds` now resolves the most recent successful task run default dataset through Apify task last-run dataset-items endpoint, instead of reading fixed dataset `ZBWihC1oYU8Pq9uBo`.
- Existing `APIFY_TOKEN` secret remains required; the task ID is non-secret configuration.
- GitHub source changes do not deploy Cloudflare Worker. A successful task run and Worker deployment are still required before live odds can be verified.


### Apify live-feed integration and current verification (2026-11-19, latest)
- Apify task `s9Des4R3jhMfA8e3s` completed a successful manual run: 6 rows across 3 ATP Finals matches, two match-winner outcomes per match; displayed run cost was $0.000. This is a limited sample, not proof of broad market coverage.
- Worker `/odds` now requests `/v2/actor-tasks/s9Des4R3jhMfA8e3s/runs/last/dataset/items?status=SUCCEEDED&clean=true&format=json&limit=1000`, so it resolves the most recent successful task dataset dynamically. Apify documents this endpoint and the `status=SUCCEEDED` filter.
- Code commit `c5d80fbc8f6e7c8eae1969854545b242aa79a49f` passed GitHub Actions run `44542779184`: 303 tests passed, 0 failed.
- Deployment runbook was corrected to match the active PWA: removed obsolete Bankroll and Winamax CSV import acceptance steps.
- Current Cloudflare Worker deployment and live `/odds` response remain unverified. The verification environment could not reach the Worker endpoint, and no Cloudflare deployment action is connected here. Do not enable an Apify schedule until Worker deployment and live odds verification are complete.
- Next operator action: deploy Worker `tennis-value-api` from the repository using an authenticated Wrangler session (`npx wrangler deploy`), then run the manual production smoke workflow and inspect actual Winamax quote timestamps, event matching and two-sided coverage. Netlify frontend deployment is not required for the Worker-only change unless the PWA source also changes.


## 10. Operational update — 2026-11-20

### Winamax feed and deployment automation
- PR #13 merged: improved Winamax feed parsing and matching from Apify event names, including paired outcomes without relying on an event ID. Worker deployment run 44736112227 succeeded; regression tests passed.
- PR #19 merged: expanded diagnostic candidate coverage from 3 to 9 matched Winamax markets.
- Apify task remains `s9Des4R3jhMfA8e3s` (Winamax Tennis France); do not change scraper configuration. Schedule `8srAGLJOalg4DBZwo` is enabled every six hours at minute 13, Europe/Paris.
- Latest confirmed successful Apify run `CAu0k9DZixaNl4dh4`: 20 rows, representing 10 two-sided match-winner markets. Sample included Alcaraz–Cobolli 1.13/5.00 and Medvedev–Tiafoe 1.33/3.00. This is a snapshot, not a guarantee of continuous coverage.

### Live Tennis API quota protection
- PR #21 merged: cap uncached prediction work at 5 new matches per pass, reuse valid local predictions from the 7-day cache, cache explicit plan-restricted player-stat responses for 6 hours, keep diagnostic workflow manual-only, and handle transient 502 profile failures gracefully.
- PR #29 merged and Worker deployed (deployment run 44743011014): centralized live API requests through `fetchLiveTennis()`; after an upstream HTTP 429, store a shared Cloudflare Cache cooldown guard and block repeated provider calls during the cooldown, returning a local 429 with Retry-After and `X-Live-Tennis-Quota-Guard: HIT`. Regression tests passed, including the guard test.
- Regression suite after PR #29: 316/316 passed. Production smoke run 44743050063 passed: PWA HTTP 200, service worker v116, Worker health OK, Winamax feed HTTP OK, 20 quotes present, 20 valid and fresh.
- Live Tennis API free plan is 100 requests/day and 30/minute. Usage observed on 2026-11-20 around 13:17: 323 calls today, 222 errors, remaining quota 0. This exceeded the daily allowance; do not assume the API is available until a fresh usage check and a controlled request confirm reset.
- Do not run extra live diagnostics while quota is exhausted. The `/usage` endpoint is quota-exempt. The 429 circuit breaker prevents repeated upstream calls after the first 429 is observed; it does not restore quota.

### CI deployment workflow
- PR #30 and PR #31 merged. Worker deployment now runs automatically after the Regression tests workflow succeeds on main; manual workflow dispatch remains available. Deploy checks out the exact tested commit.
- Regression run 44743246328 passed (316 tests). Follow-up Worker deploy run 44743290693 and production smoke run 44743290609 were triggered but their final conclusions were not yet confirmed at the time of this update. Check these runs before claiming the automation's production execution is complete. The Worker code itself was already deployed and smoke-tested in run 44743050063; PR #31 changes workflow orchestration only.

### API subscription decision — pending, no purchase approved
- User asked whether to purchase a paid Live Tennis API plan after exhausting the free quota. No subscription or purchase has been authorized or made.
- Current recommendation: do not buy PRO ($29.99/month) yet. First reduce unnecessary requests and assess whether required player information can be derived from the user's historical match archives and other lawful data sources. Consider BASIC ($9.99/month) only after verifying its exact endpoint access and whether it covers the remaining operational need. Do not represent external historical data as a complete replacement for current player statistics without validation.
- User prioritizes keeping operating costs low. Any paid service or subscription requires explicit approval before purchase.

### Product decision: Bet of the Day
- “Ставка дня” is intended for a larger stake; reliability is the primary criterion, not maximum EV. If no candidate clears a sufficiently strict reliability threshold, show no recommendation rather than promote a speculative pick.
- Card layout requested: “Ставка дня” label/button at upper left, large visually emphasized odds in the center, player pairing at the bottom; tapping opens detailed analysis.
- Keep “Максимальный EV дня” separate from the reliability-first “Ставка дня”. EV alone must never determine the latter. Display exact selected player, odds, probability, fair odds, EV, reliability, sample size, freshness and risk notes.

### Current next priorities
1. Confirm final status of GitHub Actions runs 44743290693 (Worker deploy) and 44743290609 (production smoke).
2. Avoid Live Tennis API calls beyond quota-exempt usage checks until the daily quota resets; then perform one controlled verification.
3. Inspect and tighten the reliability gate for “Ставка дня”; verify that it can return no pick when evidence is insufficient.
4. Verify that predictions and final results are consistently recorded in the archive for later calibration.
5. Continue using existing historical datasets and validated sources before considering paid PRO. Keep all user-provided archives private; do not commit them to the public repository.

### Documentation rule
- Update this `PROJECT_STATE.md` after every material architecture, product-scope, data-source, subscription, deployment, validation or priority decision. Record commit/PR/run identifiers and distinguish confirmed facts from pending checks. Read this file at the start of each work session and update it before reporting the session as complete.


### Automated project-state documentation guard (2026-11-20)
- Added `.github/workflows/project-state-guard.yml` (commit `2c1b09d3e478bb4147a7628777c73b093bae95d3`).
- On every pull request targeting `main`, GitHub Actions compares the PR base and head file lists. If implementation/configuration files changed, the same PR must also modify `PROJECT_STATE.md`; otherwise the check fails with a clear error.
- Documentation-only changes are allowed without a second state-file edit.
- This is an enforcement check for pull requests, not an AI summarizer: it ensures the state file is included but cannot independently infer and write accurate technical decisions. The developer/assistant must add the substantive update in the same PR.
- Direct pushes to `main` do not pass through this PR guard. Prefer pull requests for all implementation changes; branch-protection enforcement of this check has not been configured/verified.


### Human-factor baseline (2026-11-20)
- Added `human-factor.js` as an isolated, dependency-free module for objective workload/recovery measurements: match counts in rolling 72-hour and 7-day windows, elapsed rest hours/days, consecutive calendar days with matches, and known match-duration minutes.
- Added explicit duration-coverage reporting. Missing durations remain unknown; invalid/future timestamps are excluded and counted; duplicate match IDs are deduplicated.
- Added descriptive player-to-player workload deltas. The module intentionally emits no human-factor score and makes no probability adjustment.
- Added `tests/human-factor.test.mjs` covering time windows, rest, consecutive days, incomplete duration data, invalid/future timestamps, epoch timestamps, empty history and descriptive comparisons.
- This is an experimental foundation only: it is not yet wired into live predictions or the PWA because the current live feed does not provide a complete, verified per-player recent-match history with reliable duration data. Do not infer player fatigue or psychology when source data is absent.
- Next: identify a lawful, reliable recent-results feed; build a strictly pre-match history adapter; run chronological ablation tests (baseline vs workload features) on a held-out period. Only then consider learning coefficients and allowing any probability adjustment. Psychological proxies remain deferred until they can be measured without subjective labels.


### Human-factor workload baseline — merged (2026-11-20)
- PR #32 merged: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/pull/32
- Merge commit: `56539a07a53103abc670a9d2368314a3676db2ce`.
- Regression workflow run `44745619099`: 325 tests passed, 0 failed. The project-state guard also passed.
- Added module `human-factor.js` and tests `tests/human-factor.test.mjs`; README and this journal document its experimental status.
- This is a backend-independent source module, not a frontend or Worker change; no Netlify/Cloudflare deployment is required or claimed.
- Probability and EV calculations remain unchanged. Next engineering step is to inspect what reliable pre-match player-history fields are already available in the local prediction/result archive, then determine whether a strictly pre-match workload adapter can be built without extra API quota. Do not assume match durations exist.


### Archive workload adapter (2026-11-20)
- Added `calculateArchiveWorkloadProfile()` to `human-factor.js` on branch `feat/archive-workload-adapter`.
- Uses only archive rows marked `resultOutcome=completed`, requires consistent A/B sides with distinct numeric player IDs and matching scheduled date, deduplicates by match ID, and excludes the target match plus all same-day matches to avoid uncertain within-day ordering/data leakage.
- Reports counts in the previous 3 and 7 UTC calendar days and distinct playing days. It explicitly returns null for rest hours and match duration because the archive stores scheduled match dates, not actual completion timestamps or reliable duration.
- Coverage is labelled `partial_prediction_archive_not_complete_tour_history`; archived prediction rows are a sparse, selection-biased sample and cannot establish total player workload.
- Added tests for valid counts, same-day exclusion, non-completed exclusions, incomplete/contradictory identities and invalid targets.
- This adapter remains descriptive only; it is not connected to probability or EV. Before model integration, test archive coverage and incremental value on strictly chronological held-out predictions. Never present archive counts as complete tour history.


### Archive workload adapter — merged and validated (2026-11-20)
- PR #33 merged: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/pull/33
- Merge commit: `a62d9f426cc95bd2f532cb33d1a82ddfe31a4f20`.
- Regression workflow run `44746104205`: 328 tests passed, 0 failed.
- Project-state guard run `44746104347`: passed.
- The adapter reads the app's archived prediction/result row shape, but no production archive was uploaded or inspected; it is a pure function tested against representative rows. It is not wired into the live prediction pipeline.
- Important limitation: archive rows are sparse and selection-biased; scheduled dates do not establish match completion time. The adapter only counts earlier calendar days and explicitly leaves rest hours/duration unknown. No probability/EV changes and no production deploy required.
- Next: evaluate archive completeness using a private export locally (never commit it), then create a chronological holdout experiment. If archive coverage is too sparse, use a separate lawful historical results source rather than treating the archive as complete player workload.
