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
1. Verify deployment of the temporary six-hour Winamax freshness allowance and confirm the live PWA/Worker versions.
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
- Next: evaluate archive completeness using the app's **JSON backup** (`Статистика → Резервная копия JSON`), not the CSV export. Code inspection confirmed the CSV column list omits `playerId`/`opponentId`, while the JSON backup preserves full archive records required by `calculateArchiveWorkloadProfile()`. Analyze the JSON privately and never commit it. Then create a chronological holdout experiment. If archive coverage is too sparse, use a separate lawful historical results source rather than treating the archive as complete player workload.


## Local-only archive workload coverage audit (2026-11-20)
- Regression follow-up exposed two stale `worker.test.mjs` assertions still expecting v116; both now track v117. The first run failed only on those stale expectations (all other tests passed); rerunning after this correction.

- Local archive workload audit merged in PR #35, merge commit `6b2c465ed54580024c98d9219fc46a8c790ebe8d`; regression run `44747445182`: 329 tests passed, 0 failed; project-state guard run `44747445296` passed.
- Follow-up cache correction: advance PWA shell cache to v117 and precache `human-factor.js`, the local audit module, so clients update the interface and the module is available offline. Production Netlify deployment is not yet verified.

- Added a local PWA diagnostic in the Statistics view. It reads the existing browser archive and displays record/match/player-ID coverage plus the number of target matches where either/both players have archived history in prior 3/7 UTC calendar days.
- The archive is read in-browser only; the audit makes no network requests, exports no archive, and does not alter predictions, EV or stakes.
- Added pure helper `analyzeArchiveWorkloadCoverage()` in `human-factor.js` and regression coverage for completed pairs, missing IDs and prior-day availability.
- The diagnostic remains descriptive: the prediction archive is a partial sample, not a complete tour history. Same-day records are excluded.
- Next: run regression workflow; after deployment is confirmed, ask the user to open Statistics → «Аудит нагрузки игроков» and share only the small numeric report. Then decide whether archive coverage is sufficient for a chronological experiment.

### Production smoke-check version assertion correction (2026-11-20)
- The first production smoke check after PR #36 reached the Netlify app successfully (HTTP 200) and found the expected title/Bet of the Day UI, but failed because `.github/workflows/automatic-production-smoke.yml` still hard-coded service-worker cache v116.
- Main now ships cache v117 with `human-factor.js` precached. This is a stale smoke-test assertion, not evidence that the PWA itself failed to load.
- Follow-up PR replaces the brittle fixed cache-version check with validation that a versioned service worker is present and that `human-factor.js` is precached. The rerun will confirm the live deployed version.
- No production archive data is accessed; this correction affects CI verification only.


### Temporary Winamax quote-freshness window (2026-11-20)
- User declined the paid hourly Apify schedule; the existing six-hour schedule remains unchanged.
- Temporary app allowance increased from 90 minutes to six hours, aligned with that existing schedule. This affects quote freshness summaries, eligibility for match pairing, data-freshness classification, reliability inputs and market input inclusion in PFE.
- A quote older than six hours remains stale; future timestamps remain rejected. The 30-minute maximum difference between the two sides of a bookmaker market pair is unchanged.
- The interface labels these as quotes "не старше 6 ч"; this is a freshness allowance, not proof that the bookmaker price has remained unchanged.
- Worker diagnostics use the same six-hour threshold. Service-worker cache advanced from v117 to v118 so installed PWAs can receive the change.
- This is a temporary operational compromise. Restore the stricter threshold when a more frequent, affordable feed is available. Do not treat six-hour-old odds as suitable for large stakes solely because they pass this freshness window.


### EV of the Day — risk-aware independent selection (2026-11-20)
- User clarified that «EV дня» should favor a genuinely high positive expected value even when the estimated win probability is lower; this is intentionally distinct from the reliability-first «Ставка дня».
- Implemented a separate candidate pool for EV day. It respects the scanner's existing hard minimum odds floor of 1.90 and maximum of 15.00; no general odds-filter setting is bypassed.
- Selection ranks by EV descending, then data reliability and model probability as tie-breakers. It requires positive EV, valid probability, reliability index >=65/100, good or medium freshness, and an explicit positive value-data gate. Stale, conflicted, invalid-rating or insufficient-quality candidates are excluded.
- The card now shows the exact selected side, odds, EV, model probability, fair odds, reliability index and freshness. It explicitly warns when data quality is below the strict «Ставка дня» filter, when odds may be up to six hours old, or when model win probability is below 50%; it states EV is not a guarantee of profit.
- «Ставка дня» selection and its strict calibration/reliability gate are unchanged. EV day is not described as a large-stake recommendation.
- Candidate discovery and both recommendation pools continue to respect the existing >=1.90 scanner floor; EV day applies its separate risk-aware ranking, not a lower odds threshold.
- PWA service-worker cache advanced from v118 to v119. Regression tests added for high-EV preference and all exclusion gates.


### EV-day odds-floor consistency correction (2026-11-20)
- Follow-up review found that the initial EV-day implementation had widened candidate discovery below the app's established 1.90 minimum-odds floor. This could bypass the existing user-facing scanner filter.
- Corrected candidate discovery and EV-day selection to preserve the existing 1.90–15.00 range. The two cards now differ by selection objective and risk disclosure, not by silently overriding the global odds floor.
- PWA cache advanced to v120; regression expectations updated.


### EV day — small-stake risk positioning (2026-11-20)
- User clarified that «EV дня» is a small-stake, high-upside/bingo-style opportunity, not a large-stake recommendation. It should represent a non-blind chance grounded in the model's estimated probability and the quote, while retaining quality gates.
- UI update: card title is «EV ДНЯ · РИСКОВЫЙ ШАНС». The detail view explicitly labels the play as a small-stake opportunity, not a recommendation for a large amount.
- Added implied market probability (100 / decimal odds) and the model's probability edge in percentage points, alongside model probability, fair odds, EV, reliability and freshness. Existing candidate filters remain unchanged: positive EV, odds 1.90–15.00, reliability >=65, good/medium freshness and positive value-quality gate.
- «Ставка дня» remains reliability-first and unchanged. No stake sizing, staking advice or bankroll automation was added.
- Service-worker shell cache advanced to v121.
- First PR regression attempt: 327/330 passed; three failures were stale test expectations still pinned to cache v120 (one app UI assertion and two Worker assertions), not runtime behavior. Updated all three expectations to v121. Rerun pending.
- PR #41 merged: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/pull/41; merge commit `50a42b3bd615a4ae7d87f5f6f3ba065f63c97385`.
- Regression workflow after merge: run `44753964348`, passed. PR-head regression rerun before merge also passed (run `44753719394`).
- Cloudflare Worker deploy completed successfully (run `44754021840`); Workers Builds production check passed.
- Production smoke check passed (run `44754019633`): Netlify PWA HTTP 200, service-worker cache v121 confirmed live; Worker health OK; Winamax `/odds` HTTP 200 with 20 items, 20 valid decimal odds and 20 fresh scrape timestamps at check time. Apify task-run metadata diagnostic still reports HTTP 403; dataset feed itself returned the 20 fresh rows. This is a successful technical smoke check, not a guarantee that every quote remains available at the bookmaker.


### Strict reliability gate for «Ставка дня» (2026-11-20)
- Code review found that the prior reliability gate allowed a «Ставка дня» when the archive had only 30 calibration matches and Brier score as high as 0.26, provided the normalized composite score still reached 85. That was too permissive for a feature explicitly intended to prioritize reliability for larger stakes.
- Tightened eligibility independently of the composite score: at least 50 verified pre-match calibration matches and Brier score <=0.22 are now required. The existing requirements remain: normalized reliability >=85/100, good freshness (ratings <=14 days and odds <=30 minutes), no Elo/market conflict, valid value signal, and at least two independent PFE groups.
- The diagnostic reliability score still reports component quality, but cannot override the explicit calibration gate. If the calibration evidence is insufficient or weak, «Ставка дня» must show no pick. «EV дня» retains its separate risk-tolerant threshold and is unchanged.
- Regression assertions updated to guard the minimum sample and Brier threshold. First CI attempt exposed one existing score expectation (13) that correctly changed to 10 after the stricter Brier penalty; expanded tests now cover 40 vs 50/60-match samples and the 0.22 Brier boundary. PR-head regression and main regression run 44755209108 passed (330 tests). PR #42 merged as c5611727acb74931a4042cd42d094a06ce7a12f6; Worker deploy run 44755251259 succeeded and Workers Builds production check passed; production smoke run 44755251379 passed with PWA HTTP 200, Worker health OK, and 20/20 Winamax odds records carrying fresh scrape timestamps. Service-worker cache bump to v122 is being handled separately because this release changed the precached app shell but retained v121.


### PWA cache refresh for strict reliability gate (2026-11-20)
- PR #42 changed the precached index.html, but code review after production smoke found the service-worker cache name was still v121. Since the worker caches the app shell and updates on a cache-name change, existing installed PWAs could retain the previous shell until a navigation fetch refreshed it.
- Follow-up PR advances the service-worker cache to v122 and updates the corresponding regression expectations. No application logic changes in this follow-up.
- First regression attempt exposed one stale cache-version assertion in tests/app-ui.test.mjs still pinned to v121; updated it to v122. PR-head regression run 44755686832 failed only on that stale expectation; rerun 447557... passed. PR #43 merged as b6a9fb79ab0ed9294b3e942f972bf20957ad3c67. Main regression run 44755965832 passed; Cloudflare Worker deploy run 44756011508 and Workers Builds production check passed; production smoke run 44756011478 passed. Smoke confirmed Netlify PWA HTTP 200, service-worker cache v122 live, Worker health OK, and Winamax /odds HTTP 200 with 20 items, 20 valid decimal odds and 20 fresh scrape timestamps.


### Current production release status (2026-11-20)
- Reliability gate PR #42 is merged and production smoke passed. The «Ставка дня» selection now requires >=50 verified pre-match calibration matches and Brier <=0.22 in addition to the pre-existing quality gates. The «EV дня» selection remains unchanged.
- PWA cache follow-up PR #43 is merged; current production service-worker shell cache is v122, ensuring installed clients detect the updated precached app shell.
- PR #43 regression workflow run 44755965832 passed; Cloudflare deployment run 44756011508 passed; Workers Builds production check passed; automatic smoke run 44756011478 passed.
- Smoke evidence: Netlify PWA HTTP 200; service worker v122; Worker health OK; Winamax feed HTTP 200 with 20 items, all 20 valid decimal odds and all 20 with fresh scrape timestamps at check time. These are point-in-time feed diagnostics, not a guarantee that quotes remain available at bet placement.
- Live Tennis API quota remains separate; do not call quota-consuming endpoints until quota reset is confirmed via /usage.


### Archive result-checker counter fix (2026-11-20)
- Code review found that the Statistics → Check Results handler still referenced the removed bankroll UI's bankrollUpdates object and an undeclared settled counter. Result rows were persisted before the final alert, but a successful response could then throw a ReferenceError and prevent a clean completion report.
- Replaced the stale references with a local statusesUpdated counter and removed bankroll settlement text from the alert. Result persistence, identity validation, result-version handling and retry intervals remain unchanged.
- Added a regression test asserting the handler initializes its counters and contains no references to removed bankroll state.
- Advanced PWA service-worker shell cache from v122 to v123 because index.html changed. PR #45 merged as 2b4ced694bbd48bed8a781e66ae4e13cff9079c7; PR-head regression run 447... and main regression run 44757420389 passed. Cloudflare deploy run 44757455851 and Workers Builds production check passed. Production smoke run 44757455675 passed: Netlify PWA HTTP 200, cache v123 live, Worker health OK, and Winamax feed 20/20 valid odds with fresh scrape timestamps.


### Archive result-checker fix — production verified (2026-11-20)
- PR #45 merged: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/pull/45; merge commit 2b4ced694bbd48bed8a781e66ae4e13cff9079c7.
- Regression run 44757420389 passed; Worker deploy run 44757455851 passed; Workers Builds production check passed; automatic smoke run 44757455675 passed.
- Production smoke confirmed PWA HTTP 200 and service-worker cache v123, Worker health OK, and Winamax feed HTTP 200 with 20 valid odds and 20 fresh scrape timestamps.
- Result-check handler now uses a defined statusesUpdated counter and no longer refers to removed bankrollUpdates state. The result checker still verifies player identities and result versions, retries unresolved/pending matches on the existing schedule, and checks at most 10 match IDs per manual run. No API polling was added, so this fix does not increase Live Tennis API usage.


### Model-version-isolated calibration (2026-11-20)
- Calibration used by the reliability gate and segment diagnostics is now restricted to the active prediction model version (modelVersion "2"). Older or unversioned archive rows remain preserved and exportable but cannot inflate the current model's sample size or improve its Brier score.
- The calibration function retains its unfiltered default for explicit historical/diagnostic use; the active PWA paths pass the current version explicitly.
- The Statistics calibration panel identifies the active model version and reports how many archived rows from other versions were excluded. Segment calibration uses the same version filter.
- Added regression coverage for version filtering, legacy/unversioned exclusions, Brier calculation and active-version wiring.
- PWA shell cache advanced from v123 to v124 so installed clients can receive the changed calibration logic and labels.
- PR #46: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/pull/46. Regression workflow run 44759547826 passed (333 tests, 0 failed); project-state guard run 44759547883 passed. The first test attempts exposed stale cache-version and segment-call assertions; those test expectations were corrected, with no production logic rollback required. No archive records are migrated or deleted, and no API calls or bookmaker settings are changed.


### Archive snapshot identity hardening (2026-11-20)
- Snapshot de-duplication now requires the archived model name/version to match the active model (general-elo-v2, version 2), as well as the existing quote, probability, rating and bookmaker fields.
- Scheduled match date and capture status must also match before a recent snapshot is considered a duplicate. This preserves material schedule/status revisions and prevents a model-version change from silently suppressing a new forecast snapshot.
- Added regression tests proving an otherwise identical v1 snapshot does not suppress v2, and a schedule/status revision is retained.
- PWA shell cache advanced from v124 to v125.
- No existing archive rows are rewritten or deleted; no API calls or bookmaker configuration changes.

### Archive snapshot identity hardening — merged (2026-11-20)
- PR #47 merged to main as `fca6e956c7ba5dcba6b1512215db8a5c867d4a6a`.
- Regression tests passed on the PR and again on main (workflow run 44760469768); project-state guard passed (PR workflow run 44760394483).
- Cloudflare Worker deployment passed (workflow run 44760515056). Production smoke check is still running; PWA cache v125 publication is not yet confirmed.

- Production smoke check for v125 passed (workflow run 44760515033). The later v127 release was also deployed successfully: Worker deploy and automatic production smoke checks passed (runs 44761992642 and 44761992349); the deployed PWA and production API were reachable.

### Calibration leakage guard — earliest scheduled start (2026-11-20)
- Calibration now compares every candidate snapshot against the earliest known scheduled match start across all archived snapshots for that match, not the first date among only `upcoming` rows.
- This prevents a later schedule revision from reclassifying a snapshot taken after the original start as a valid pre-match forecast.
- Added regression coverage for a match rescheduled after its original start; the later snapshot must not enter calibration. Post-start exclusions are counted once per match, not double-counted.
- PWA shell cache advanced from v125 to v126. Existing archive data remains unchanged; no external API calls.

### Archive import snapshot identity (2026-11-20)
- Archive import/merge identity now includes match ID, model name/version, scheduled match date and capture status in addition to quote and prediction fields.
- This prevents an import from collapsing distinct model versions or schedule/status revisions into one historical snapshot.
- Added regression coverage for importing a new model version and a rescheduled/live revision of the same match.
- PWA shell cache advanced from v126 to v127. Existing local archive data is not rewritten; no API calls or bookmaker changes.

- Archive import identity hardening merged as PR #49 (`6b3bccfb89e98cbc2db2370a0c45d9420c30095b`); regression tests and project-state guard passed on the PR. Import deduplication now preserves model-version and schedule/status revisions while retaining the legacy `imported` default.

### Result provenance in prediction archive (2026-11-20)
- Verified match results now explicitly record `resultSource: live_tennis_api` alongside result version, status and provider restatement timestamp.
- Import normalization preserves only the recognized provider identifier; result revisions update provenance consistently across every snapshot for the match.
- CSV archive export includes the result source. Regression coverage verifies provenance and revision metadata survive result application and archive import.
- PWA shell cache advanced from v127 to v128. No historical archive rows are rewritten and no external API calls are made.

- Result provenance hardening merged as PR #50 (`e17f3d0e1faee640c284c29285da27fc7f385afe`): regression tests and project-state guard passed. Verified result records now retain `live_tennis_api` provenance through archive import and CSV export; PWA cache is v128.


### Match list filtered to available Winamax pairs (2026-11-20)
- The main match list now displays only upcoming matches with a complete, fresh Winamax match-winner quote pair (both player outcomes).
- Matches without odds, with only one side quoted, or with stale/mismatched quotes are hidden instead of occupying the list with a “odds not found” label.
- The visible match counter and filter summary now count only qualifying pairs. Empty states distinguish no scheduled matches from no complete Winamax quote pairs.
- The filter does not use the EV odds-range setting: all complete matched pairs remain visible, while the existing range continues to affect value-bet eligibility only.
- Prediction loading receives only the displayed matches. No scraper settings, API polling, or Live Tennis API quota usage changed.
- PWA shell cache advanced from v128 to v129.


### Launch verification after PR #51 (2026-11-20)
- PR #51 merged to main as `a817bb60796be6bd394c891462308cb94f08b0df`.
- PR regression and project-state guard passed; main regression run `44765152451` passed.
- Cloudflare Worker deploy run `44765205019` passed.
- Automatic production smoke run `44765204894` passed: Netlify PWA HTTP 200; service-worker cache v129 published; Worker health and required configuration flags OK; Winamax `/odds` HTTP 200 with 20 records, 20 valid decimal odds and 20 fresh scrape timestamps.
- The smoke run's `/usage` check confirmed Live Tennis API free quota exhausted: 328 calls against 100/day, 227 errors, 0 remaining. Do not call quota-consuming match/result/prediction endpoints until the provider quota resets or the user explicitly authorizes a paid plan.
- Apify task-run metadata diagnostic remains HTTP 403, but the dataset endpoint returned 20 fresh odds records. Do not alter scraper settings based on this metadata-only 403.
- Remaining launch acceptance: after quota reset, perform one controlled schedule fetch, refresh the installed PWA, confirm only upcoming matches with complete fresh Winamax pairs appear, then manually compare a small sample against Winamax and verify prediction/archive/result workflow. No feature expansion before acceptance.

### Live Tennis API quota protection — defer optional player statistics (2026-11-20)
- Code audit found that every automatic prediction scan fetched two optional player-statistics profiles for each eligible match, even though those PRO/ULTRA diagnostics do not affect the active Elo probability, EV, or bet-selection calculation.
- With five eligible matches and the default hourly refresh, this could generate up to 10 avoidable Live Tennis API requests per hour (up to 240 per day), in addition to schedule and any uncached Elo profile requests.
- Automatic scans now mark player statistics as not requested; the loader remains available for a future explicit on-demand feature. Elo ratings, Winamax odds, EV, reliability gates, archive snapshots, and the two bet recommendations are unchanged.
- Regression test ensures the optional player-statistics loader is not called automatically. PWA shell cache advances from v129 to v130.
- This reduces a clear source of quota consumption but does not prove it was the only cause of the 328-call day. Do not resume quota-consuming API checks until the provider's daily counter resets.


### Workload archive conflict hardening (2026-11-20)
- Code review found a defensive-validation bug in `calculateArchiveWorkloadProfile`: after detecting contradictory repeated rows for one side, the side was marked invalid (`null`), but a third duplicate/conflicting row could dereference that null marker and throw instead of rejecting the archive group.
- The adapter now keeps contradictory sides invalid without dereferencing the marker. A regression case includes three conflicting rows for the same side and verifies the malformed match is rejected without crashing.
- PWA shell cache advanced from v130 to v131 because the precached workload module changed. No prediction probabilities, EV, recommendation gates, archive records, API calls, or scraper settings are changed.
- Validation and deployment status: PR validation pending; production deployment not yet confirmed.


### Workload archive conflict hardening — merged (2026-11-20)
- PR #53 merged to main as `f7c6200a82b6a5bd7b2e0d4ad5808498a2af7fff` after both regression tests and the project-state documentation guard passed.
- The archive adapter safely rejects a match group after repeated contradictory player-side rows, including a third conflicting duplicate, rather than throwing. Regression coverage verifies the malformed group is rejected without crashing.
- PWA shell cache advanced to v131. The change does not alter prediction probabilities, EV, recommendation gates, archive records, external API calls, or scraper settings.
- Automatic production smoke run `44769210321` started after merge; deployment verification is pending. Do not claim v131 is live until this run completes successfully.
- Next Human Factor research task: use Valuebetennis CC BY 4.0 match data to test measurable workload proxies (matches in prior 3/7 days, rest interval, playing days, known match duration) against baseline Elo using chronological training/evaluation. The 2025–2026 CSV files are public source data and must not be committed to the repository. Missing duration remains unknown; no factor enters production probabilities without out-of-sample improvement.


### Human Factor research preparation — duration provenance (2026-11-20)
- Valuebetennis CSV includes `duree_min` (completed match duration in minutes; blank when unknown). The historical importer previously discarded this field, preventing workload research from testing cumulative court time.
- The importer now preserves only plausible duration values (1–600 minutes); missing, malformed, zero, negative, or implausible values remain null. Duration is included in duplicate identity so conflicting source records are not silently merged.
- Backtest prediction diagnostics expose the completed match duration as a separate observed field. It is not used to predict that same match and does not modify Elo, probabilities, EV, or production recommendations.
- Regression coverage checks valid and unknown duration handling. Next step: calculate strictly pre-match rolling workload features from prior calendar days, with same-day matches excluded because their actual completion order is unknown, then evaluate chronologically.

### Human Factor workload research pipeline — in review (2026-11-20)
- Public Valuebetennis seasonal CSVs are directly downloadable from `https://www.valuebetennis.com/datasets/valuebetennis-matchs-2025.csv` and `https://www.valuebetennis.com/datasets/valuebetennis-matchs-2026.csv`; the source page lists them under CC BY 4.0. Do not commit the CSV files or upload them to public artifacts.
- PR branch `research/pre-match-workload-backtest` adds `scripts/workload-research.mjs` and a GitHub Actions research workflow. The workflow downloads the two source files only into its ephemeral runner, runs chronological research, and publishes only a JSON summary artifact (30-day retention).
- Feature construction uses prior 3/7 UTC calendar days, distinct prior-week playing days, rest days (capped at 30), known prior-week minutes, and duration-data coverage. Same-day matches are excluded; all matches on a UTC date are scored before that date is added to player histories.
- The research trains a regularized logistic correction to baseline Elo on 2025 only and evaluates it on 2026 only, reporting paired Brier/LogLoss differences and approximate 95% intervals. It is research-only; no production probability, EV, recommendation, Worker, PWA or API behavior is changed.
- The CSV files are not stored in the repository or public artifact. Source attribution required: `Valuebetennis, Tennis results and odds since 2021, https://www.valuebetennis.com/en/donnees.htm`.
- Next: validate tests and workflow on PR, inspect ATP/WTA report and coverage, then decide whether any Human Factor signal merits further investigation. No model integration without out-of-sample evidence.

### Human Factor workload backtest — preliminary OOS result (2026-11-20)
- Research workflow successfully downloaded 2024, 2025 and 2026 Valuebetennis CSVs into ephemeral GitHub Actions storage; 241,415 source rows were read and 177,742 normalized match rows remained. Raw CSVs were not committed or uploaded as artifacts.
- Protocol: 2024 supplies Elo and workload warmup; logistic workload correction is trained on 2025 only; 2026 is the untouched out-of-sample evaluation. Predictions and workload features are prepared by UTC date, and same-day matches are excluded from prior workload.
- Core workload features (prior 3-day matches, prior 7-day matches, distinct playing days in prior 7 days, and rest days) improved the 2026 paired probability metrics versus baseline Elo:
  - ATP, 45,335 matches: Brier 0.224762 → 0.220224 (paired difference −0.004537; approximate 95% CI −0.004952 to −0.004123); LogLoss 0.639805 → 0.629891 (difference −0.009914; CI −0.010800 to −0.009027).
  - WTA, 31,514 matches: Brier 0.218699 → 0.214355 (difference −0.004344; CI −0.004869 to −0.003820); LogLoss 0.626517 → 0.616720 (difference −0.009797; CI −0.010930 to −0.008663).
- Brier improvement was positive in every evaluated month from January through November 2026 for both tours. The confidence intervals are approximate per-match paired normal intervals, not multiple-comparison adjusted.
- Duration data coverage is too low to rely on: known duration represented only 1.29% of prior-week player-match records in ATP 2026 evaluation and 5.49% in WTA; 2025 training coverage was 0.03% ATP and 2.19% WTA. The duration and coverage features made virtually no difference versus the core model. Keep duration out of any workload correction until a more complete source is found.
- The learned rest-days coefficient is negative after controlling for other schedule features. Do not interpret this as proof that rest harms performance: it may reflect match sharpness, long layoff/selection effects, or collinearity among workload variables. This is a predictive association, not a causal finding.
- Decision: promising out-of-sample signal, but not production-ready. Keep Human Factor diagnostic/research-only. Next priority is robustness testing of simpler feature specifications and temporal splits; do not alter live Elo probabilities, EV, recommendations, Worker, PWA, or API behavior based on this single 2026 holdout.
- Research report artifact: GitHub Actions run `44772527928`, artifact `human-factor-workload-report`, expires 2026-12-20. Source attribution: `Valuebetennis, Tennis results and odds since 2021, https://www.valuebetennis.com/en/donnees.htm` (CC BY 4.0).


### Human Factor workload robustness validation — passed (2026-11-20)
- Added pre-declared feature ablations to the research-only workflow: matches in prior 3 days alone; matches in prior 7 days alone; playing days plus rest interval; and the full four-feature core specification. All are trained on 2025 and evaluated on the same 2026 out-of-sample matches.
- Added a second chronological holdout within 2026: fit the core workload correction on January–June 2026 and evaluate on July–November 2026. Elo probabilities remain chronological; same-day workload leakage remains excluded.
- These checks are diagnostic only. No production probability, EV, recommendation, Worker, PWA, API, or quota behavior changes.
- Next: inspect ATP/WTA ablation and second-half results. Treat a signal as fragile if it depends on one narrow feature specification or fails the later temporal holdout. No production integration based on this research alone.


#### Robustness results
- PR #56 research workflow completed successfully on run `44774131371`; regression tests run `44774131208` passed; project-state guard run `44774131415` passed. The JSON report is in artifact `human-factor-workload-report` (30-day retention); raw CSVs remain ephemeral.
- All four pre-declared feature specifications improved paired Brier and LogLoss versus baseline Elo on the same 2026 evaluation sample for both tours:
  - ATP, 45,335 matches: matches3 only ΔBrier −0.001047 / ΔLogLoss −0.002292; matches7 only −0.000461 / −0.001047; playingDays7 + restDays −0.001160 / −0.002498; full core −0.004537 / −0.009914.
  - WTA, 31,514 matches: matches3 only ΔBrier −0.000866 / ΔLogLoss −0.001909; matches7 only −0.000678 / −0.001650; playingDays7 + restDays −0.001035 / −0.002421; full core −0.004344 / −0.009797.
- The second chronological holdout also improved both metrics:
  - ATP, train Jan–Jun 2026 (20,581 matches), test Jul–Nov 2026 (24,754): Brier 0.222965 → 0.218430; LogLoss 0.636100 → 0.626088.
  - WTA, train Jan–Jun 2026 (15,114 matches), test Jul–Nov 2026 (16,400): Brier 0.217189 → 0.212765; LogLoss 0.623184 → 0.613270.
- Paired approximate 95% intervals for the second-half test excluded zero for both metrics and both tours. They are per-match normal intervals, not corrected for the multiple specifications tested.
- Interpretation: the direction of the workload signal is not dependent on one feature or only on the original 2025→2026 split. The full four-feature combination has the largest observed improvement, but this is still one historical season with related temporal folds, correlated predictors and a research correction fitted to Elo. It is not independent multi-season confirmation, causal evidence, betting ROI, CLV or proof of profitability.
- Decision: retain the workload module as research/diagnostics only. Do not integrate into production probabilities, EV or either recommendation until it passes additional season-by-season holdouts, surface/tournament segment stability, calibration and market-comparison checks.


### Human Factor workload surface-stability validation — passed (2026-11-20)
- Extended the research-only report to segment the already-trained core workload correction by Hard, Clay, Grass, Carpet and Unknown surface categories.
- Each surface segment is evaluated on the same full-year 2026 holdout and the July–November 2026 temporal holdout. The temporal model is trained once on January–June 2026 across the tour, then evaluated unchanged within each surface; no surface-specific model fitting is used.
- Report sample counts with every segment so small or missing surface groups are not mistaken for reliable evidence.
- No production probabilities, EV, recommendation logic, Worker, PWA, API or quota behavior changes.


#### Surface holdout results
- PR #57 research workflow run `44774581946` completed successfully; regression tests run `44774582107` and project-state guard run `44774581919` passed. Report artifact: `human-factor-workload-report`, 30-day retention. No raw CSVs were committed.
- On the full-year 2026 holdout, the core correction improved Brier and LogLoss on Hard and Clay for both tours:
  - ATP Hard: n=25,120, ΔBrier −0.004637, ΔLogLoss −0.010072; Clay: n=18,992, −0.004659 / −0.010249.
  - WTA Hard: n=18,095, −0.004557 / −0.010274; Clay: n=12,286, −0.004087 / −0.009241.
- On the July–November temporal holdout, Hard and Clay remained positive for both tours:
  - ATP Hard n=13,643: −0.004453 / −0.009755; Clay n=10,724: −0.004947 / −0.011012.
  - WTA Hard n=9,546: −0.004165 / −0.009365; Clay n=6,454: −0.004658 / −0.010427.
- Smaller surfaces were less stable:
  - ATP Grass n=912 full year / 224 second-half: full-year improvement was small (−0.000512 / −0.001109), but second-half metrics worsened (+0.004358 / +0.009448).
  - ATP Carpet n=311 / 163: full-year improvement was small (−0.000868 / −0.002439), but second-half metrics worsened (+0.003582 / +0.007510).
  - WTA Grass n=812 / 159: small improvements (full year −0.001177 / −0.002898; second half −0.001302 / −0.003416).
  - WTA Carpet n=321 / 241: larger apparent improvements (full year −0.010218 / −0.021577; second half −0.010505 / −0.022276), but the sample is too small to trust this magnitude without replication.
- Interpretation: the signal is most stable on Hard and Clay, the dominant surfaces in this sample. Grass and Carpet evidence is sparse and heterogeneous; do not generalize the aggregate workload benefit to those surfaces. These are paired probability metrics, not ROI, causal effects or profitability.
- Decision: keep Human Factor workload research-only. Any future production experiment should be limited initially to Hard/Clay validation and must still pass independent multi-season holdouts, calibration and market comparison. Do not add surface-specific adjustments based on these small 2026 segments.


### Sackmann historical dataset coverage audit — in review (2026-11-20)
- Added a research-only audit for Jeff Sackmann's ATP/WTA yearly match CSVs, 1991–2026. It measures valid completed-match counts and coverage for serve/return inputs, ace/double-fault/break-point stats, rankings, age, handedness, surface and duration, broken down by tour, year, surface and tournament level.
- The archive mirror's README and original upstream READMEs identify Jeff Sackmann / Tennis Abstract as the data compiler and CC BY-NC-SA 4.0 as the license. Use is non-commercial; derived/redistributed material must preserve the same license and attribution. No commercial use is authorized by this change.
- The workflow downloads source CSVs only into ephemeral GitHub Actions storage. The report contains aggregate coverage only, no raw rows or player-level records, and is marked CC BY-NC-SA 4.0. No source CSVs or derived match-level data are committed.
- No production model, probabilities, EV, recommendation logic, Worker, PWA, API quota or Winamax scraper behavior changes.
- Pending: run regression tests and the isolated coverage workflow, inspect ATP/WTA results, then decide whether rolling pre-match serve/return research is feasible. Any such feature must use only matches completed before the target date and remain research-only until independent chronological validation.


### Sackmann historical data coverage audit — merged and completed (2026-11-20)
- PR #58 merged to main as `e67f20fcb31c3b0f65b2569badfd308aec3e2462`.
- The isolated GitHub Actions workflow downloaded all 72 ATP/WTA yearly match files for 1991–2026 into ephemeral runner storage and completed successfully (run `44775779212`). No source CSVs or row-level/player-level records were committed or uploaded.
- The aggregate audit contains 109,191 valid ATP matches and 94,760 valid WTA matches, spanning 1990-12-31 through 2026-05-25 in the archive snapshot.
- Overall both-player serve-point / first- and second-serve-points-won coverage: ATP 90.77%, WTA 48.94%. Full both-player serve plus break-point-stat coverage: ATP 90.77%, WTA 28.58%. The lower WTA aggregate is caused by older seasons: from 2016 onward coverage is substantially higher; 2025 core/full coverage is 97.63% for WTA and 91.15% for ATP. 2026 is partial through May 25 (ATP 82.50%, WTA 86.55%).
- Both-player ranking coverage: ATP 97.06%, WTA 93.73%; age coverage: ATP 99.97%, WTA 99.95%. Match-duration coverage is ATP 88.09% and WTA 26.42%, so duration must be treated as missing where absent.
- The audit report is aggregate-only and marked CC BY-NC-SA 4.0. Source attribution: Jeff Sackmann / Tennis Abstract, original repositories `tennis_atp` and `tennis_wta`; archival mirror `Aneeshers/tennis-sackmann-archive`. Non-commercial use only; preserve attribution and share-alike for derived material. Do not use these data commercially without separate permission.
- PR regression run `44775779234`: 348 tests passed, 0 failed. Audit run `44775779212` and project-state guard run `44775779294` succeeded.
- No production probabilities, EV, recommendation logic, Worker, PWA, API quota, Winamax scraper or live data were changed.
- Next research step: construct strictly pre-match rolling serve-point-win and return-point-win rates from prior completed matches only, with same-day records excluded and minimum-sample/coverage gates. Evaluate ATP and WTA separately, initially on the well-covered 2016–2026 period, using chronological training/evaluation and paired Brier/LogLoss against Elo. Include overall and surface-specific versions only if sample sizes support them. Keep research-only; do not integrate into production based on in-sample or aggregate results.


### Sackmann serve/return walk-forward research — in review (2026-11-20)
- Added a separate research script and GitHub Actions workflow to test whether rolling serve-point-win and return-point-win rates improve on chronological Elo.
- Features aggregate only completed matches from the previous 365 days; at least five prior statistics-complete matches are required for each player. Overall and same-surface features are tested separately and together.
- Same-day matches are all scored before any same-day statistics enter player histories. Player IDs remain separated by tour; ATP and WTA are evaluated independently.
- Expanding annual walk-forward: each evaluation year 2020–2026 is fitted only on eligible earlier seasons beginning in 2016. The Elo baseline uses all earlier results in the downloaded 1991–2026 history as warm-up.
- Outputs contain aggregate Brier/LogLoss, paired approximate 95% intervals, sample counts and coefficients only; no player-level rows or raw CSVs. Source and report carry CC BY-NC-SA 4.0 attribution/share-alike and non-commercial restrictions.
- No production probability, EV, recommendation, Worker, PWA, API quota or Winamax scraper changes.
- Initial walk-forward run completed successfully (run `44776347399`). Preliminary results: overall serve/return alone did not improve Elo; surface-only features were near neutral; the combined overall+surface correction showed only small, mostly statistically uncertain gains. Do not integrate into production.
- Added individual serve-only and return-only ablations for overall and same-surface rates to distinguish which feature contributes. The expanded workflow rerun is pending. Research results are not betting ROI or proof of profitability.


### Sackmann pre-match serve/return walk-forward research — merged and evaluated (2026-11-20)
- PR #59 merged to main as `ac6d5dcfd9f4ea749424c4be8fc5005beb97405d`.
- Research workflow `44776598331` completed successfully using the 1991–2026 ATP/WTA archive. Regression run `44776598326`: 352 tests passed, 0 failed. Project-state guard `44776598322` passed.
- Protocol: build rolling 365-day player serve-point-win and return-point-win rates using only prior completed matches; require at least five prior stats-complete matches for each player; exclude all same-day matches before updating history. ATP/WTA evaluated separately. Expanding walk-forward annual fits for 2020–2026 use only earlier seasons from 2016 onward. Baseline is the repository's chronological K=32 Elo; 1991–2015 results are rating warm-up.
- Aggregate out-of-sample results (paired difference = candidate minus Elo; negative is better):
  - ATP overall serve-only: 13,641 matches, ΔBrier +0.000054, ΔLogLoss 0.000000; overall return-only: +0.000066 / +0.000036; overall serve+return: +0.000158 / +0.000033.
  - ATP surface serve-only: 10,809, +0.000058 / +0.000073; surface return-only: +0.000010 / +0.000035; surface serve+return: +0.000095 / +0.000157 (Brier CI +0.000022 to +0.000167, worse than Elo).
  - ATP overall+surface combined: 10,809, ΔBrier −0.000104 (95% CI −0.000314 to +0.000107), ΔLogLoss −0.000553 (95% CI −0.001086 to −0.000020). Only the small LogLoss difference excludes zero; Brier does not.
  - WTA overall serve-only: 12,147, ΔBrier −0.000004 / ΔLogLoss +0.000002; overall return-only: +0.000065 / −0.000011; overall serve+return: +0.000053 / −0.000073.
  - WTA surface serve-only: 8,886, −0.000027 / +0.000043; surface return-only: +0.000013 / −0.000031; surface serve+return: +0.000001 / +0.000038.
  - WTA overall+surface combined: 8,886, ΔBrier −0.000196 (95% CI −0.000524 to +0.000133), ΔLogLoss −0.000688 (95% CI −0.001461 to +0.000085); both intervals include zero.
- Decision: no robust, generalizable improvement. Keep serve/return features research-only; do not add them to production probabilities, EV, or either recommendation. The small ATP LogLoss gain is not enough to justify model complexity, especially with no corresponding robust WTA/Brier result and mixed annual effects.
- This evaluates probability metrics only, not market-relative value, CLV, betting ROI or profitability. No production probabilities, EV, recommendations, Worker, PWA, API quota or Winamax scraper were changed.
- The source and derived report remain subject to CC BY-NC-SA 4.0: non-commercial use, attribution to Jeff Sackmann / Tennis Abstract, and share-alike. Do not use commercially without separate permission.
- Next research candidates: test whether historical rankings and age add incremental value beyond Elo, with the same expanding chronological protocol; keep live production untouched unless the signal is repeatable and materially improves out-of-sample calibration.


### Launch hardening — Bet of the Day eligibility guard (2026-11-20)
- Found and fixed an eligibility gap in `selectBestBet`: unlike the separate EV-of-the-Day selector, it previously had no upper odds bound and did not independently validate that model probability was finite and within 0–100%.
- The Bet of the Day selector now requires odds within the configured minimum and a hard maximum of 15.00, plus a finite probability greater than 0 and no more than 100%.
- Added executable regression coverage for odds 1.49, 15.00 and 15.01, and invalid probabilities 0, above 100 and NaN.
- Service Worker cache advanced from v131 to v132 so deployed Android clients refresh the corrected application shell.
- Updated the deployment runbook's service-worker version and recorded the latest verified production smoke status (2026-11-20 16:49 UTC).
- Implementation is on branch `fix/bet-of-day-odds-guard`; regression workflow run `44798255774` passed 353/353 tests and project-state guard run `44798255740` passed on head `169143ff1dead3ce131ae414a9c7416b2e0aace5`. Production deployment has not yet been triggered.
- This is an eligibility/data-validation correction only. It does not alter the Elo model, probability estimates, Winamax scraper, or API usage.
- CI also exposed three pre-existing CLV tests with hard-coded 2026-11-20 evening timestamps. Their match starts and quote snapshots are now generated relative to the test clock, preserving the intended pre-match/closing-quote relationships at any execution hour. This removes wall-clock-dependent failures without changing CLV production logic.


### EV panel odds fallback fix (2026-11-20)
- The EV-day panel previously hid its Open match action whenever no valid positive-EV model candidate existed. If the prediction API failed or the local prediction cache was empty, the panel showed no player pair or bookmaker prices even though the match card had a verified complete fresh Winamax quote pair.
- The panel now retains and displays the match pair and both Winamax odds as a quote-only fallback, clearly labels EV as uncalculated, and provides a working Open match action. It does not label an unmodelled quote as a value bet or infer a probability.
- Regression test covers fallback markup, quote display and match navigation.
- Prediction model, selection thresholds, API behavior and automatic betting remain unchanged. No Live Tennis API quota is consumed by this UI fallback.
- Implementation branch: `fix/ev-day-odds-fallback`.
- PR #61 merged to `main` on 2026-11-20 as commit `d35ff4f8ef76757a2ead900a16e1799bd701cf3b`.
- The stale worker-test assertion was corrected before merge. Regression checks, project-state guard, Netlify preview, Cloudflare Worker deployment and production smoke check completed successfully. The smoke check confirmed PWA HTTP 200, Worker health, and a working Winamax feed with 40 rows, 40 valid decimal odds and 40 fresh scrape timestamps at that check time. Apify task-run metadata returned HTTP 403, but the dataset feed itself returned HTTP 200.
- Do not describe PR #61 as pending. Deployment/smoke status applies to the time of that run; do not imply the app was manually verified on the user's handset.

### Winamax matching audit — 2026-11-20
- Reviewed current `main` code after PR #61. The frontend displays only pre-match singles with a complete two-sided Winamax match-winner pair; it validates bookmaker/country, market, outcome, player names, tournament compatibility, start-time proximity, decimal prices, scrape timestamps and same-event pairing.
- Two quotes must have scrape timestamps within 30 minutes. A quote may currently be accepted for up to six hours after `scrapedAt` (`ODDS_FRESHNESS_MAX_AGE_MS=6*60*60*1000`). This is a temporary allowance aligned to the Apify schedule, not evidence that the bookmaker still offers the price.
- Documentation is inconsistent: README currently says quotes older than 90 minutes are rejected, while the current frontend matcher allows six hours. Resolve this discrepancy in a focused follow-up after agreeing the operational freshness policy; do not silently change the threshold.
- If multiple event groups qualify for one schedule match, `oddsForMatch` can return more than one pair. The current renderer requires exactly two quotes, so ambiguous duplicates are excluded rather than arbitrarily selected. The user-facing diagnostics do not yet explain this exclusion.
- The current odds-matching workflow performs schedule and prediction requests, including `/predict`; do not run it while Live Tennis API quota is exhausted. Use only `/health`, `/usage` and `/odds` for quota-safe operational checks.
- A live production coverage audit was not completed in this review; previous smoke figures are historical and must not be represented as current.
- Next audit task: add explicit match-level exclusion diagnostics (missing pair, stale quote, pair timestamp skew, ambiguous duplicate groups, event/tournament/player mismatch) using already-fetched schedule and odds data, while keeping the diagnostics request quota-neutral and leaving the Winamax scraper unchanged.

### Documentation and handoff protocol — mandatory
- `PROJECT_STATE.md` is the authoritative handoff record. Every code, test, workflow, configuration, deployment, data-source, model, or product-scope change MUST update this file in the same implementation branch/PR before that change is considered complete.
- Each implementation PR must include its corresponding `PROJECT_STATE.md` update before review/merge. Record the purpose, files/behavior changed, tests and workflow run IDs/results, commit/PR status, deployment status, quota/cost impact, and next action as applicable.
- After merge or deployment, immediately reconcile the status in `PROJECT_STATE.md`: replace “pending” with the actual merged commit and verified deployment result. Do not leave stale “in review”, “pending”, or outdated main-commit descriptions.
- Documentation-only changes also update this file and receive their own commit. Never batch unrelated changes without recording each meaningful milestone.
- Before every work session, compare this file with the actual `main` head, latest PRs/workflows and deployment evidence. If they disagree, reconcile the file before starting new implementation work.
- A change is not complete merely because code was edited or a PR was merged; its state record and validation status must also be current.


### Historical tennis-results normalization adapter — merged (2026-11-20)
- Added `historical-normalizer.js`, a versioned adapter for `poetsc/tennis-results` ATP/WTA singles records. It normalizes schedule date/time, tour, tournament, round, court surface, player attributes, H2H, current/opening odds and match result into a stable schema.
- Local scheduled time is preserved without inventing a timezone. Missing optional fields remain null. Result eligibility and market eligibility are independent.
- Result quality gates flag unsupported tours, invalid player identities, unfinished/retired/walkover records, unmatched winners, missing scores and possible incomplete scores. Market gates require valid two-sided opening and current odds. Dataset diagnostics report eligibility, duplicate source IDs, tour and surface counts.
- Added `tests/historical-normalizer.test.mjs` for valid ATP records, separate eligibility, exclusions, incomplete scores, surface aliases, duplicate IDs and missing-field handling.
- This is an offline data adapter only. It does not train a model, change probability/EV, make network requests, or include user-provided datasets. No Live Tennis quota, Apify run, paid service or deployment used.
- Initial regression run `44808728071` exposed two adapter edge cases: explicit null H2H counts were being coerced to zero, and partial set scores were not consistently flagged. Both were corrected on the same branch (commits `5b00b2b990b7f66e05b2cb90bae30e193eaa7ad6` and `bfe57b3634f97185221215555e6b97164662906f`). The initial run had 359 passing and 2 failing tests; the corrected head passed the complete worker test workflow.
- PR #62 was merged to `main` on 2026-11-20 as `0727c5c5ca6168d49b22c7a2ffcd87e47ce75bce`. On the merged head, all six GitHub checks completed: worker-tests passed, project-state guard passed, Cloudflare Worker build passed, Netlify deploy preview passed; three hosting-rule checks were neutral. GitHub commit status and PR state were successful/merged.
- The adapter remains offline and is not connected to production predictions. No Live Tennis API calls, Apify runs, paid services, production deployment or user archive upload were used for this merge.
- Next: research whether pre-match historical ranking and age add repeatable out-of-sample value beyond chronological Elo. Use only ranking/age information available on or before the match date; evaluate ATP/WTA separately with expanding chronological holdouts and paired Brier/LogLoss. Keep the research-only and license restrictions explicit; do not add Sackmann-derived data to the public app or commercial use without separate permission.


### Sackmann private historical import preparation — merged (2026-11-20)
- Added `scripts/sackmann-import.mjs`: offline CLI reads yearly main-tour `atp_matches_YYYY.csv` or `wta_matches_YYYY.csv` files from a user-supplied local folder and writes a compact normalized CSV outside the repository.
- Retains tournament date/ID, tour, round, surface, winner/loser IDs and names, rank/ranking points, age, score, best-of and match duration. ATP and WTA are explicitly separate.
- Excludes impossible dates, invalid/equal player IDs, and walkover/retirement/unfinished outcomes. Unknown surfaces are retained with blank surface and counted. No raw or generated Sackmann data is committed.
- Added unit tests in `tests/sackmann-import.test.mjs` and usage/licensing documentation in `docs/SACKMANN_RESEARCH.md`.
- Source rows already carry winner/loser rank and age snapshots associated with tournament date; these are candidates for research, not production features. Do not assume they are exact match-start snapshots; validate tournament date alignment and availability before any modelling.
- No data download, Live Tennis API request, Apify run, paid service, production change or deployment was performed. Importer has not yet been run against the full archive; it requires the user/source CSVs to be available in a local folder.
- License: Sackmann source archive is CC BY-NC-SA 4.0. No commercial use or public redistribution of raw/derived data without appropriate permission/licence review.
- PR #64 was merged to `main` on 2026-11-20 as `46e7e37ceede54bbf0a7a8225acb6329959f8781`. Regression workflow `44809660323` passed; project-state documentation guard `44809660520` passed. Production code was not changed and no data download or deployment was required.
- The importer has only passed unit tests so far; it has not yet been run against actual ATP/WTA archive CSVs. Next: validate on small source samples, then run separate chronological ATP/WTA backtests and test rank/age as additional pre-match signals. Do not activate these signals in production unless out-of-sample results show a repeatable improvement.


### Sackmann importer score-completeness correction — merged (2026-11-20)
- Inspection of actual archive ATP/WTA 2025 CSVs confirmed the source schema and exposed that a score containing a partial second set (e.g. 7-5 2-1) must not be treated as a completed match.
- Follow-up importer validates completed set scores only, requires at least two completed sets for best-of-three and three for best-of-five, and continues excluding explicit RET/W/O/ABD/DEF/DEFAULT/CANC outcomes.
- Regression tests cover partial set fragments and best-of-five minimum completed sets.
- No production model, deployment, Live Tennis API, Apify, paid service or archive data storage is affected.
- PR #68 merged to `main` on 2026-11-20 as `55985093c3f87a740417cd72f0c9a20835a07b07`. Regression tests `44810204287` and project-state guard `44810204145` passed. A local focused check also passed seven score-completeness cases. No production deployment or API/Apify usage was required.
- Real ATP/WTA 2025 files were inspected for schema compatibility, but the importer has not yet been run against the full archive. Next: run the importer on a small, representative ATP/WTA CSV sample, then execute separate chronological backtests and evaluate rank/age features without leakage.


### Full Sackmann archive import validation — implementation in review (2026-11-20)
- Expanded the existing non-commercial research audit workflow to download yearly ATP and WTA main-tour match files from 1968 through 2026 into the ephemeral GitHub Actions runner.
- The workflow now executes the actual `scripts/sackmann-import.mjs` CLI separately for ATP and WTA, then checks that both normalized outputs are non-empty and reports aggregate date coverage, match counts, rank/age/surface coverage and duplicate match-key counts.
- The existing source-field coverage audit remains in place. Only aggregate diagnostics are uploaded; raw archive CSVs and normalized player-level match data remain in the ephemeral runner and are not committed or uploaded as artifacts.
- The workflow is triggered by a PR touching the Sackmann audit/import files, or manually with workflow_dispatch. The current implementation PR will therefore exercise the complete import against real source files when its checks run.
- No Live Tennis API calls, Apify runs, paid services, production model changes or production deployment are involved. Source is CC BY-NC-SA 4.0; this remains non-commercial research only.
- Branch: `research/run-sackmann-full-import-validation`. Validation result and run ID will be recorded after CI completes.


### Full Sackmann archive import validation — first real-data run (2026-11-20)
- GitHub Actions run `44811037749` successfully downloaded all 118 ATP/WTA yearly main-tour CSVs for 1968–2026, executed the actual importer separately for each tour, validated non-empty normalized outputs, and completed the aggregate source-field audit. No source or normalized player-level CSVs were committed or uploaded.
- ATP: 199,389 source rows across 59 files; 192,654 imported completed matches; 3 invalid-player rows; 6,732 unfinished/retired rows; 2,893 rows with unsupported/unknown surface values counted in diagnostics. Imported data spans 1967-12-28 through 2026-05-25. Both-player rank coverage 76.06%, age 97.38%, known surface 98.50%. Import-key duplicate groups: 0.
- WTA: 162,182 source rows across 59 files; 157,508 imported completed matches; 1 invalid-player row; 4,673 unfinished/retired rows; 4,690 rows with unsupported/unknown surface values counted in diagnostics. Imported data spans 1967-12-25 through 2026-05-25. Both-player rank coverage 64.97%, age 94.66%, known surface 97.02%. Initial key audit found 13 repeated `tourney_id:match_num` groups; these are not yet classified as exact duplicates versus conflicting key collisions.
- Aggregate source audit found serve/return stats on both players in 51.12% of ATP and 29.36% of WTA standard outcomes; coverage varies substantially by surface and era. Do not assume stats are available for every historical match.
- Regression tests, project-state guard and full archive audit workflow passed on the initial PR head. Aggregate audit artifact ID `14667800013` retained for 30 days.
- Follow-up in this same PR adds a privacy-preserving classification of the 13 WTA duplicate-key groups (identical rows versus conflicting outcomes, with year-level counts) before deciding whether importer deduplication or key correction is appropriate.
- No Live Tennis API, Apify, paid services, production model changes or production deployment used. Source remains CC BY-NC-SA 4.0 and research-only/non-commercial.


### WTA source match-number collisions and backtest identity correction (2026-11-20)
- The full-archive audit found 13 WTA groups sharing the legacy `tourney_id:match_num` key (7 in 1973, 1 in 1982, 3 in 1990, 2 in 2009). All 13 groups had differing match signatures; these are source-key collisions, not confirmed exact duplicate rows.
- Existing `runBacktest` previously grouped only by `tourney_id:match_num` and would have excluded every row in such a collision group. Updated grouping to use the natural match identity: tournament ID + date + source match number + unordered player pair + round. Exact duplicate rows remain deduplicated, while conflicting rows for the same natural match remain excluded.
- Added a regression test for two distinct matches reusing the same source tournament match number. Existing exact-duplicate and true-conflict tests remain in place.
- The full archive workflow now distinguishes source-key collisions from actual duplicate natural-match groups and reports collision years, date/pair variation, and natural duplicate counts without logging player-level data. Awaiting the new CI run before treating the correction as validated.


### Sackmann full-import and natural-key validation — checks passed, PR #71 merge pending (2026-11-20)
- Final archive workflow on PR head `ea328ce2ecdfc56407808128aef6db82af3b7bb7`: run `44811788230` passed. It downloaded 118 yearly ATP/WTA main-tour files (1968–2026), imported both tours, validated outputs, and completed aggregate source coverage audit.
- Final import totals remain ATP 192,654 and WTA 157,508 completed matches (350,162 total). Date coverage: ATP 1967-12-28–2026-05-25; WTA 1967-12-25–2026-05-25. Both-player rank coverage: ATP 76.06%, WTA 64.97%; both-player age coverage: ATP 97.38%, WTA 94.66%; known surface: ATP 98.50%, WTA 97.02%.
- Duplicate diagnosis: the 13 WTA `tourney_id:match_num` collisions are all different player pairs on the same date (7 in 1973, 1 in 1982, 3 in 1990, 2 in 2009). There are zero duplicate natural-match groups after including date, unordered player pair and round. ATP has zero source-key collisions.
- `scripts/backtest.mjs` now uses tournament ID + date + source match number + unordered player pair + round as its match identity. This preserves separate matches that reuse a legacy source match number while retaining exact-duplicate deduplication and exclusion of genuinely conflicting duplicate rows.
- Added a regression test for reused source match numbers. Regression run `44811788247`: 368 passed, 0 failed. Project-state guard `44811788222`: passed. Cloudflare Worker build check: passed. Netlify hosting-rule checks were neutral (no app deploy required). Archive workflow `44811788230`: passed.
- Only aggregate diagnostics were uploaded (artifact ID `14667800013` from the first successful run and a refreshed aggregate report from the final run); raw source and normalized match-level CSVs were kept on the ephemeral runner and not committed or uploaded.
- PR #71 is ready to merge after this documentation update. No Live Tennis API quota, Apify, paid services, production model change or production deployment used. Sackmann data remains CC BY-NC-SA 4.0 research-only/non-commercial.
- Next research task after merge: build separate chronological ATP/WTA walk-forward tests comparing Elo-only against Elo + pre-match rank, Elo + age, and Elo + rank + age. Use same-match availability subsets, no future information, and report paired Brier/LogLoss; do not activate any factor in production without independent out-of-sample improvement.


### Sackmann full-import validation and natural match identity — merged (2026-11-20)
- PR #71 merged to `main` via squash commit `e842e7f59ba01f38c496458906b8d031197e34ae`.
- Merged changes: expanded the ephemeral historical-data workflow to import and audit ATP/WTA main-tour files from 1968–2026; added aggregate-only coverage and duplicate-key diagnostics; corrected `runBacktest` natural match identity to include tournament ID, date, source match number, unordered player pair and round; added regression coverage for reused source match numbers.
- Final PR-head checks all passed: archive audit `44812034349`, regression tests `44812034592`, project-state guard `44812034653`, Cloudflare Worker build success. Regression suite: 368 passed, 0 failed. Netlify hosting-rule checks were neutral.
- Actual import: ATP 192,654 completed matches from 199,389 source rows; WTA 157,508 completed matches from 162,182 source rows; 350,162 imported matches total. Coverage and dates are recorded above.
- The 13 WTA source-key collisions (1973: 7; 1982: 1; 1990: 3; 2009: 2) are distinct player pairs on the same date, not duplicate natural matches. After using the corrected natural identity, the audit found zero duplicate natural-match groups in both tours.
- Raw source files and normalized match-level CSVs were used only in ephemeral GitHub Actions storage. Only aggregate audit reports were retained as artifacts. No Live Tennis API quota, Apify, paid service, production prediction logic or production deployment was used.
- Next: implement a separate, chronological ATP/WTA walk-forward research script comparing Elo-only with Elo + rank, Elo + age, and Elo + rank + age. Compare models on identical eligible subsets; fit only on earlier years; report paired Brier and LogLoss and coverage. Do not enable rank/age in production unless they show repeatable out-of-sample improvement.


### Walk-forward ranking and age research — implementation in review (2026-11-20)
- Added `scripts/sackmann-rank-age-research.mjs` to compare Elo-only logistic baseline against Elo + ranking, Elo + age, and Elo + ranking + age. ATP and WTA are run separately.
- Features: log ratio of the two tournament-date rankings; age difference and average age; Elo difference from a chronological K=32 rating. Missing rank/age values are not imputed.
- Each annual evaluation model is fitted only on earlier calendar years and frozen during the evaluation year. Same-day matches share the same pre-date Elo state. Each candidate is compared with an Elo-only baseline on the exact same eligible matches. Reports include Brier, LogLoss, accuracy, coverage counts and paired candidate-minus-baseline deltas.
- Training uses a deterministic sample capped at 50,000 rows per annual fit; evaluation uses all eligible matches. The workflow downloads the archive into an ephemeral runner, imports it, runs ATP/WTA research, and uploads aggregate JSON reports only. No player-level predictions or raw/normalized CSVs are uploaded.
- Added unit tests for logistic fitting, tour separation, feature eligibility subsets, future-season invariance, natural match-key collisions, true conflicting duplicates and invalid date windows. Added methodology and CLI instructions to `docs/SACKMANN_RESEARCH.md`.
- Research branch: `research/walk-forward-rank-age-model`. CI results and actual walk-forward metrics are pending. No production model changes, Live Tennis API usage, Apify runs, paid services or production deployment.
- License and timing cautions remain: CC BY-NC-SA 4.0 non-commercial only; tournament-date ranking snapshots are not guaranteed to be exact match-start snapshots. Production activation is prohibited until timing is checked and independent out-of-sample improvement is demonstrated.


### Rank/age research execution correction (2026-11-20)
- First full-archive attempt reached the research CLI but failed before fitting because spreading the full 192k-row ATP array into `Array.push(...rows)` exceeded the JavaScript argument limit. The loader now appends rows iteratively.
- The annual walk-forward workflow now caps each training fit at 20,000 deterministic sampled rows (rather than 50,000) to bound runtime; evaluation still uses all eligible matches. Candidate and baseline use the same sampled training rows.
- Regression tests on the initial research implementation passed 374/374. The full archive research run is being repeated after the loader and runtime corrections; no metrics have yet been accepted.


### First full-archive rank/age walk-forward results (2026-11-20)
- Full research workflow `44813234193` completed successfully on all 118 yearly source CSVs after the loader was changed to append rows iteratively. Aggregate reports are in artifact `14667851718`; no row-level predictions or match data are included.
- Regression workflow `44813234180`: 374 passed, 0 failed. Project-state guard `44813234292`: passed. Cloudflare Worker build: passed. No production prediction code was changed.
- Evaluation: annual expanding walk-forward, 2000-01-01 through 2026-05-25, K=32. For each calendar year, coefficients are fitted on earlier calendar years only and frozen for the evaluation year. Candidate and Elo-only logistic baseline are scored on the exact same eligible matches. Training capped at 20,000 deterministic samples per annual fit; all eligible evaluation matches are used.
- ATP (27 evaluation years): ranking candidate Brier 0.207713 vs baseline 0.209413 (delta -0.001700), LogLoss 0.601243 vs 0.604969 (delta -0.003726), accuracy +0.59 percentage points; improved both Brier and LogLoss in 27/27 years. Age candidate Brier 0.209488 vs 0.209942 (delta -0.000454), LogLoss 0.605187 vs 0.606173 (delta -0.000986), accuracy +0.27 pp; improved both metrics in 22/27 years. Combined rank+age Brier 0.207434 vs 0.209438 (delta -0.002004), LogLoss 0.600648 vs 0.605020 (delta -0.004372), accuracy +0.68 pp; improved both metrics in 27/27 years.
- WTA (27 evaluation years): ranking candidate Brier 0.207472 vs baseline 0.208856 (delta -0.001384), LogLoss 0.600516 vs 0.603380 (delta -0.002864), accuracy +0.55 pp; improved both metrics in 25/27 years. Age candidate Brier 0.208580 vs 0.210062 (delta -0.001482), LogLoss 0.603019 vs 0.606612 (delta -0.003593), accuracy +0.25 pp; improved both metrics in 25/27 years. Combined rank+age Brier 0.206546 vs 0.208841 (delta -0.002295), LogLoss 0.598253 vs 0.603362 (delta -0.005109), accuracy +0.74 pp; improved both metrics in 25/27 years.
- Evaluation sample sizes: ATP rank 74,560, age 76,324, combined 74,556; WTA rank 66,823, age 70,265, combined 66,820. Coverage differs because missing values are not imputed.
- Initial signal: ranking adds the clearest and most consistent improvement; age alone is smaller, especially on ATP; combined rank+age is best in aggregate for both tours. These are research comparisons against an Elo-only logistic baseline, not proof of improved betting returns.
- Caution: ranking fields are tournament-date snapshots and have not yet been verified as exact match-start snapshots. This result is promising but not sufficient for production activation. Next robustness checks: compare separate early/recent holdouts, alternate Elo K values and sensitivity to training sample size; verify ranking snapshot timing and assess calibration by surface/era. Keep all changes research-only until independent tests confirm the effect.


### Walk-forward ranking and age research — merged (2026-11-20)
- PR #72 merged to `main` via squash commit `f4925ccc0c3e66e1ba9fd26c64f2f4f0dab51698`.
- Added research-only script `scripts/sackmann-rank-age-research.mjs`, unit tests, methodology docs and full-archive workflow integration. It compares Elo-only logistic baseline against Elo + rank, Elo + age and Elo + rank + age, ATP/WTA separately.
- Final PR-head run `44813600196` passed full archive download/import, both annual walk-forward analyses, duplicate/source-key diagnostics and aggregate source audit. Regression run `44813600031` passed 374/374 tests; project-state guard `44813599962` passed; Cloudflare Worker build passed. Netlify hosting checks were neutral.
- Initial full-archive results are recorded above. Rank and combined rank+age showed consistent out-of-sample improvements across annual periods; age alone was smaller on ATP and more useful on WTA. These are model-accuracy results, not ROI or betting-profit evidence.
- No rank/age factor was added to production predictions. The research code uses a 20,000-row deterministic cap per annual training fit, all eligible evaluation matches, earlier-calendar-year-only fitting, and same-day Elo batching. Tournament-date ranking snapshot timing remains to be verified.
- Next research step: robustness checks with alternative Elo K values and training-sample sizes, split early/recent holdouts, and then test whether rank/age improve the existing surface/form/H2H combination. Production changes remain blocked until repeatable independent improvement and ranking-timestamp validity are established.


### Rank/age robustness study — in review (2026-11-20)
- Added full-archive walk-forward sensitivity runs for Elo K=24, 48 and 64 at a 20,000-row annual training cap, plus K=32 at a 5,000-row cap. ATP and WTA remain separate; each candidate retains its same-subset Elo-only baseline.
- The workflow uploads aggregate JSON reports only; raw and normalized match rows remain on the ephemeral runner. No production prediction changes, API quota use, Apify run, paid service or deployment.
- Purpose: test whether the initial rank/age improvements persist across alternative Elo update speeds and a smaller training sample. Results must be reviewed before any further model decision.


### Rank/age robustness results — completed research (2026-11-20)
- Full ATP/WTA sensitivity matrix completed across Elo K=24/48/64 (20k annual training cap) and K=32 (5k cap). Rank+age reduced aggregate Brier and log loss in all eight runs; rank alone and age alone also reduced aggregate metrics in all runs. Rank+age was strongest in every aggregate run.
- ATP rank+age improved both Brier and log loss in all 27 annual cohorts; WTA had a small number of year-level regressions (notably 2017) despite aggregate improvement.
- Results and exact candidate-minus-baseline deltas are recorded in docs/SACKMANN_RESEARCH.md.
- Decision: research signal is sufficiently consistent to justify a further timing audit and recent independent holdout, but not production activation. Tournament-date ranking snapshots are not guaranteed to be available before every match. No production model changes or deployment.


### Strict pre-match weekly ranking audit — in progress (2026-11-20)
- Added a research-only join that selects each player's latest official weekly ranking strictly before the tournament date; same-day ranking snapshots are excluded conservatively.
- Added coverage and snapshot-age diagnostics and a walk-forward comparison using the existing Elo/rank/age research framework.
- GitHub Actions downloads ranking history separately for ATP and WTA, runs the study, and uploads aggregate-only reports. No raw archive data is committed.
- This is a research check only; production prediction logic remains unchanged.


- Pre-match ranking join now also applies a 45-day freshness ceiling. Older weekly snapshots are treated as missing; the report includes stale-snapshot counts. This avoids carrying a player's rank across long absences.


### Pre-match weekly ranking study — completed research (2026-11-20)
- Strictly joined weekly ATP/WTA ranking snapshots dated before tournament date; same-day rankings excluded; stale snapshots older than 45 days treated as missing.
- 2000-01-01 to 2026-05-25 walk-forward results: rank+age delta Brier/LogLoss ATP -0.001971/-0.004326 (74,540 matches); WTA -0.002224/-0.004950 (66,882 matches). Aggregate rank and age candidates also improved both metrics.
- Coverage across all imported archive matches after freshness filter: ATP both-player ranks 77.05%; WTA 65.27%. Average retained snapshot age ATP 7.8 days; WTA 6.6 days.
- ATP rank+age improved both metrics in all 27 evaluated years. WTA has small year-level regressions in 2017 and a slight LogLoss regression in 2022.
- Decision: ranking and age are validated research candidates, not production features yet. Require a separate independent recent holdout and further WTA year-level review. No production prediction changes or deployment.


### EV threshold settings fix — implementation in review
- The saved minimum EV percentage, minimum odds and maximum odds now feed the actual candidate scan, positive-EV count, Bet of the Day selection and EV of the Day selection.
- Previously, the min-EV value did not filter EV of the Day, and the configured odds range was only reflected in card text rather than consistently applied to candidate eligibility. This made the controls appear ineffective.
- Existing visible bookmaker quotes remain visible; configured thresholds filter model-eligible value candidates, not the underlying odds display.
- No model formula, bookmaker scraper, API quota, automatic betting or deployment changes.


### Bet of the Day EV threshold and skin switching correction — implementation in review
- The minimum EV setting is explicitly for Bet of the Day only. It filters the high-reliability recommendation, without changing the independent EV of the Day candidate selection.
- EV of the Day remains the highest eligible positive-EV candidate; it is not suppressed by the Bet of the Day threshold.
- Positive-EV match count and positive/negative EV diagnostics reflect positive EV (>0), not the Bet of the Day threshold.
- Skin selection now previews and persists immediately when changed, and sets the skin on both body and document root. Cancel no longer unexpectedly reverts a skin already selected.
- Both black/terracotta and olive skins remain supported. No model, bookmaker, API or deployment logic changed.


### Match Charting Project audit — implementation in review (2026-11-20)
- Added a research-only Match Charting Project audit on branch `research/mcp-dataset-audit`. The source is pinned to Jeff Sackmann repository commit `1813a1309b7ed7ebf1c7e884b32bf675d00e4edf` (2026-09-18) for reproducibility.
- The workflow downloads ATP/WTA match metadata and sixteen aggregate stat families per tour (Overview, Rally, ServeBasics, ReturnDepth, ReturnOutcomes, ShotTypes, ShotDirection, ServeDirection, ServeInfluence, NetPoints) into an ephemeral GitHub Actions runner.
- The audit reports match counts, duplicate IDs, date range, surface and handedness distributions, per-family row/schema coverage and match-ID join coverage. It uploads only aggregate JSON for 30 days; raw source CSVs are not committed.
- Source README states more than 5,000 contributor-charted matches and declares CC BY-NC-SA 4.0. Data are selective/crowdsourced and non-commercial only; no production PFE feature activation is authorized by this audit.
- Added unit tests and methodology/license documentation. Pull request CI will run the audit download in parallel with the existing research workflows. This is a source acquisition and coverage audit, not yet a point-level predictive test.

- Strict calendar validation (run 44824215512): ATP has 1 invalid date and no missing dates; WTA has 8 invalid dates and 10 missing dates. The valid ATP range begins 1960-05-29 and requires source-level verification. Keep all Match Charting features research-only; exclude unverified metadata dates/surface/hand fields.
- Metadata quality review found unexpected categorical values (including non-surface text in Surface and non-R/L hand values) plus duplicate metadata IDs. Added explicit quality flags; do not use metadata date/surface/hand fields for features until source rows are inspected and repaired. Research-only; no production feature activation.

- Added `docs/PFE_FEATURE_MAP.md`: candidate formulas, denominator/data-dictionary caveats, leakage controls, sample-threshold sweep, and chronological validation protocol. No PFE feature is enabled in production.

- Expanded the Match Charting audit from the initial ten to all 16 available aggregate stat families per tour, including key-point, serve-and-volley, serve/break split, and shot-direction outcome families. The workflow downloads source files to the ephemeral runner only.

- Expanded 16-family audit completed successfully (run 44823375916): ATP 7,565 and WTA 4,257 unique charted metadata IDs (11,822 combined); 2,003,405 ATP and 1,085,144 WTA aggregate-stat rows (3,088,549 total). All 16 families have 100% ID-join coverage among the IDs present in each family, but family sample size differs substantially. Serve-and-volley (SnV) is especially sparse: 6,327 ATP and 1,078 WTA unique matches. Metadata quality remains review-required: unexpected surface rows ATP 2/WTA 9; unexpected handedness rows ATP 2/WTA 8. No production feature activation.

- Point-level dictionary semantics verified at the pinned source: Player1 is the first server; `Svr`, `Ret`, `PtWinner`, and `isSvrWinner` encode player/role direction; `rallyCount` includes the serve and excludes errors. MatchStats workbook formulas verify per-match serve, ace, double-fault, winner, unforced-error and rally-length denominators. CSV-family row orientation and category mapping still require family-specific validation.

- Match Charting data-quality follow-up: strict calendar validation reports 1 invalid ATP date, 8 invalid WTA dates and 10 missing WTA dates. Surface/hand columns contain values inconsistent with their expected categories (including umpire names, date-like strings and tournament labels); no metadata-derived player features until row-level source inspection. PR #77 merged; this follow-up is documentation/research only.

- MatchChart workbook codebook extraction completed successfully in workflow run 44825397573 (artifact 14674560331, seven-day retention). The artifact contains Instructions, MatchStats, Tables, and the first 18 rows of MATCH/Points with formulas/cached values; raw workbook is not retained.
- Workbook mapping verified: MATCH columns identify server/returner, serve-in, ace, unreturnable, rally winner, forced/unforced error, double fault, point winner and rally count. Shot direction codes are opponent-handedness-relative; return-depth codes 7/8/9 represent shallow/medium/deep.
- Match Charting audit now records literal row/set category distributions for each stat family. The code inventory is in docs/PFE_FEATURE_MAP.md; labels are descriptive only until family-specific formulas and player perspective are verified.
- Next PFE step: map each aggregate CSV family’s literal row codes to workbook formulas, validate player perspective/denominators, then build an exact/ambiguous/unmatched charted-match linkage audit against the historical results archive. No production PFE feature activation until independent chronological validation.

- Lower-tier historical database audit: pinned archive commit 83733587353df8a41f2fd4f516147d5aa83f5a8d; 144 ATP/WTA Futures, Challenger, qualifying and ITF CSVs. Final classified audit: 1,336,767 completed source rows, 1,325,071 unique natural match identities; WTA ITF/qualifying has 11,696 exact duplicate groups and zero conflicting groups. Both-player core serve-stat coverage: ATP Futures 4.84%, ATP Challenger/qualifying 57.52%, WTA ITF/qualifying 8.99%. Aggregate-only artifact; no lower-tier rows merged into production Elo.

- Added research-only Grand Slam point-by-point audit for the pinned 2011–2024 archive: 49 singles Slam event pairs (98 match/point CSVs). Workflow measures match/point coverage, ID linkage and per-field availability for serve speed, rally length, distance and depth; raw point data remains ephemeral. No production features activated.

- Grand Slam point-by-point audit results: 49 events, 10,513 match metadata IDs, 1,922,136 point rows; 10,508 metadata matches have point data, zero orphan point IDs, five matches without point rows. Player names are 99.84% complete, but winner/status/event/round/court/player IDs are populated in only 8.16% of rows on average. Candidate availability: Speed_KMH 95.20% (47 events; 24.78% zeros), Speed_MPH 85.52% (43 events; 25.75% zeros), RallyCount 63.55% (28 events), distance run 52.49% (24 events), ServeDepth/ServeWidth 33.90% (20 events), ReturnDepth 28.35% (20 events). Zero values and field definitions require event-specific validation; no production feature activation.

- Added a research-only exact linkage audit between Slam match metadata and ATP/WTA main-tour historical results. It uses normalized full player-name pairs + Slam + year, with unique-only linking and separate ambiguous/unmatched/round-conflict counts. This can attach historical tournament dates and player IDs to charted point records, but dates are event-week dates and within-event order is not established. No linked player-level data is retained.

- Initial Slam linkage audit (run 44829495676): 10,110/10,513 metadata rows linked (96.16%); 8,048 full-name and 2,062 unique initial-surname links; 371 unmatched named rows (330 alias unavailable in the event result roster; 41 initial-surname alias collisions); 32 missing-name rows; 636 winner checks, zero mismatches. Alias links are separately tagged. The event-week dates are not match-specific; no within-event chronology can be inferred.
- Linkage audit refinement classifies unmatched rows by alias ambiguity, missing roster identity, or no matching player pair. It stores aggregate counts only and never emits player names.

- Added `docs/DATA_SOURCE_REGISTRY.md`: pinned historical baseline, TennisMyLife live ATP/WTA candidate and its non-commercial/no-redistribution terms, Live Tennis API academic point-state dataset (173,571 match index; 22,031 observed matches / 3.18M score states), and AcesAPI as an optional credit-limited cross-check. No new provider data or API key was ingested; no paid calls or subscriptions were made. All candidates remain behind quality, licensing and chronology gates.

- Public Live Tennis API Zenodo sample is versioned: use v1.0.3, which follows the v1.0.2 UTC timestamp correction. The public players file dropped the external Sackmann ID crosswalk; do not assume direct player-ID joins from the public sample. Full research data is described as retaining the crosswalk, subject to institutional access approval.

- Added research-only point-state PFE candidates to `docs/PFE_FEATURE_MAP.md`: transition-derived serve/return outcomes, hold/break, tiebreak and score-pressure features, plus a separate in-play model path. The server-to-transition alignment, partial-tape coverage, same-event chronology and tier calibration are explicit validation gates; no feature is active.

- Added `scripts/point-state-transition-audit.mjs` and synthetic tests for score-state transitions (normal games, advantage, tiebreak, game/set boundaries and ambiguous jumps). The CLI accepts CSV/gzip and emits aggregate diagnostics only; no IDs or player-level data. Server-to-transition alignment and tape completeness remain unverified; no sample data imported and no production feature enabled. See `docs/POINT_STATE_TRANSITION_RESEARCH.md`.

- Extended Match Charting metadata audit to report Tournament/Round/Time/Court/Surface/Umpire/Best-of/Final-TB/Charted-by field coverage and aggregate event/round distributions, enabling a future unique-only linkage to historical results. Fixed the JSON artifact newline and added an end-to-end CLI test. No raw data or player rows are retained.

- Corrected escaped template literals in the new Match Charting audit fixtures after the first CI run reported a test-file syntax error; rerunning the regression workflow on the corrected commit.

- Match Charting metadata field audit completed (run 44833318668): Tournament coverage ATP 100% / WTA 99.60%; Round 99.99% / 99.72%; Best-of 99.56% / 99.58%; other fields Time 54.11% / 41.49%, Court 74.13% / 66.98%, Umpire 60.30% / 53.59%. Most round labels align with results archive codes. JSON artifact newline is valid; regression and documentation guard passed.

- Added a research-only Match Charting-to-Sackmann linkage audit: pinned ATP/WTA main-tour yearly results 1968–2026, unique-only tournament/year/player-pair/round/date join, alias-roster uniqueness checks, 21-day date window, duplicate/date/round/alias ambiguity exclusions. Workflow retains aggregate report only; raw CSVs remain ephemeral. Challenger/ITF/junior/team-event linkage is out of scope for this pass.

- Added an explicit synthetic cross-year case with the results snapshot extending beyond the event's December start date, ensuring January United Cup matches can link without being misclassified as outside the overall archive window.

- Expanded event aliases for historic Grand Slams and Olympics (year-specific host city, including cross-name variants); added a synthetic Olympics alias test. Exact player-pair, round and date gates remain mandatory.

- Corrected synthetic linkage fixtures to include a later archive boundary row where needed, so tests exercise event matching rather than the global snapshot cutoff; the dedicated out-of-snapshot case keeps the shorter date range.

- Event-name alias usage is now counted from the selected matched result row, not merely from the set of alternative event keys considered; this avoids inflating alias counts when an exact event key also exists.

- The first full linkage workflow downloaded all 109 pinned files but stopped on a strict CSV parser quote error. Added source-filename context to the parser error so the malformed/edge-case file can be identified before changing parsing behavior; no raw file was uploaded.

- Identified the strict-parser failure in WTA Match Charting metadata (an unquoted embedded quote at source line 2487). The linkage workflow now uses the same tolerant metadata parser as the coverage audit while retaining strict parsing for the Sackmann result files; raw rows remain ephemeral.

- Exported the tolerant Match Charting metadata parser and added a synthetic test for embedded quotes and quoted commas; the strict parser remains in place for the Sackmann yearly results CSVs.

- The first linkage artifact linked 6,698/7,565 ATP metadata IDs (88.54%) and 3,544/4,257 WTA IDs (83.25%), 10,242 total. Added reason-by-event breakdown for unmatched records (event missing, player alias unavailable, date/round conflict, outside snapshot) to guide the next mapping pass; raw rows remain excluded.
