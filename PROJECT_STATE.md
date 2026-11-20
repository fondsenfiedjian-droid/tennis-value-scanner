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
