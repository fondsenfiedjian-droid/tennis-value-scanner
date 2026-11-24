# Tennis Value Scanner 2.0 — execution roadmap

Last updated: 2026-11-24

## Goal

Deliver a usable Tennis Value Scanner 2.0 on the existing verified prediction engine, then improve the model incrementally using validated match data and settled prediction outcomes. Research must not block a safe working release, and unvalidated research must not enter Production.

## Operating rules

- Keep Production unchanged until the user explicitly approves a release.
- Keep diagnostics and Developer Edition isolated from Production.
- Do not merge PR #173 or deploy diagnostic code to Production without explicit approval.
- Do not change the existing Winamax Apify task unless a concrete scraper defect is established.
- Only complete, fresh, correctly matched Winamax quote pairs may feed predictions and EV.
- Never invent odds, stakes, bankroll values, missing point events or player identity.
- Evaluate ATP and WTA separately with chronological walk-forward validation.
- Record negative findings and data limitations, not just improvements.

## Work packages and status

### 1. Live Tennis PRO data diagnostics
**Status: discovery milestone completed; semantic audit remains.**

Completed:
- Isolated diagnostics Worker and workflow.
- Identified the actual history schema: participants are nested under players.p1/p2; match time is scheduled_time; surface/tournament fields are top-level.
- Corrected metadata extraction and persisted player/match identity beside paired RAW/CLEAN tapes.
- Clarified that tour=juniors covers junior Grand Slam draws; added junior-age seeds to ITF queries.
- Produced a private 16-match sample: ATP 4, WTA 4, Challenger 4, ITF 4; 1,957 RAW rows and 1,840 CLEAN rows.
- All tape-row timestamps are present. Provider points.complete is true for 10/16 RAW and 3/16 CLEAN records.

Remaining:
- Audit score-state transitions, missingness, source precedence and duplicate/correction semantics.
- Resolve server and tiebreak interpretation; do not infer uncertain values.
- Expand sample cautiously across surfaces, player profiles and event types.
- Keep raw artifacts private and respect provider data-use terms.

### 2. TVS 2.0 product shell
**Status: Preview implementation improved; PR #172 remains open draft.**

Completed on integration/tvs2-pro-api:
- Restored four daily-plan metrics: mandatory count, deployed capital, virtual bank and risk.
- Money/risk values remain unset until the user configures a bank; no default bankroll or stake is created.
- Restored the approved five-item bottom navigation. Forecast tests remain accessible from Statistics.
- Built a ready Netlify Deploy Preview.
- Built a debug Android WebView wrapper APK that opens the Developer Preview.

Remaining:
- Validate the preview UI and core navigation on mobile.
- Verify settings persistence, schedule coverage, player comparison, archive and error states.
- Keep PR #170 → #171 → #172 as a reviewed chain; do not merge until all release gates pass.

### 3. Winamax matching and quote diagnostics
**Status: safety fixes and explanation layer implemented; live coverage verification remains.**

Completed on the TVS 2.0 integration branch:
- Reject ambiguous player-side mapping; a scheduled player must uniquely map to one event participant.
- Explain why a scheduled match lacks a complete fresh Winamax pair.
- Keep matches visible when odds are absent; only complete fresh pairs enter prediction/EV.
- Normalize equivalent event timestamps with different UTC offsets when provider event IDs are absent.
- Add regression coverage for ambiguity, missing quotes and timestamp grouping.

Remaining:
- Compare current Winamax feed records with scheduled matches and classify actual missing-pair causes. First Preview audit found 8 records: three Davis Cup team ties and one doubles event; no individual singles quote pair was available for the 180 upcoming singles matches.
- The UI now reports unsupported_draw when the feed contains only team ties/doubles; no such quotes can enter singles predictions.
- Check tournament/player aliases and provider event IDs. Repeat the read-only audit after a later Apify run; do not change the scraper without explicit approval.
- Verify freshness, paired-side synchronization and event-time matching.
- Preserve the existing Apify task; do not weaken matching thresholds to increase apparent coverage.

### 4. Developer Edition and model laboratory
**Status: foundation exists in PR #171; end-to-end validation remains.**

- Confirm Production/Developer identity, cache and storage isolation.
- Verify local CSV upload and chronological Elo walk-forward runner.
- Keep experimental profiles isolated from live predictions.
- Compare Brier, LogLoss, calibration, sample size and coverage; do not use ROI without an odds-linked settlement pipeline.

### 5. Historical data foundation
**Status: datasets and linkage audit exist; validation remains.**

- Validate Valuebetennis ↔ Sackmann match linkage, player identity, dates and tournament aliases.
- Record source coverage, licensing and missingness.
- Keep raw licensed datasets out of the public repository.
- Use historical data only when feature timing is known and no future information leaks into predictions.

### 6. Prediction model research
**Status: active research; no new feature approved for Production.**

Order:
1. Freeze and preserve the current Elo baseline.
2. Complete ATP/WTA K-factor and calibration comparisons across multiple periods.
3. Test lower-tier Elo contributions and timing lags.
4. Evaluate surface, recent form, rank/age and opponent quality.
5. Audit point-state semantics before serve/return features.
6. Test PFE and playing-style candidates only with representative, pre-match-valid samples.
7. Require independent holdout gains and shadow evaluation before integration.

### 7. Prediction archive and outcome feedback
**Status: partially implemented across research PRs; operational validation remains.**

- Persist pre-match prediction snapshots, source quotes, model version and timestamps.
- Reconcile completed results from verified sources.
- Evaluate calibration and error by tour, surface, odds band and confidence.
- Keep paper ROI separate from probability quality and never represent it as real betting history.

### 8. Release gate
**Status: not approved.**

Before any Production release:
- All required regression and build checks pass on the exact release commit.
- Preview Worker and Netlify Preview are verified together.
- Winamax freshness and matching are verified against current feed data.
- No fake bank, automatic betting, or research-only model feature is enabled.
- User explicitly approves the merge and Production deployment.

## Current priority order

1. **Verify live Winamax matching on the Developer Preview** and produce a measured report of complete pairs and each missing-pair reason.
2. **Finish the point-state integrity audit** for the 16-match observed sample; keep server/tiebreak-derived features blocked until semantics are proven.
3. **Complete TVS 2.0 Preview validation** for schedule, comparison, settings, archive and mobile behavior.
4. Validate Developer model-lab isolation and walk-forward reproducibility.
5. Finish historical dataset linkage and licensing/coverage reports.
6. Continue ATP/WTA model calibration and feature experiments.
7. Validate prediction archive → actual outcome feedback.
8. Prepare a release candidate only after all release gates pass.

## Current validation snapshot

- Diagnostics sample: 16 matches, 1,957 RAW rows, 1,840 CLEAN rows.
- Junior-age players were found in ITF histories; zero results under tour=juniors are consistent with the provider's junior-Grand-Slam-only filter.
- TVS 2.0 integration branch: 565 regression tests passed (0 failed) after the Winamax unsupported-draw diagnostic changes.
- Netlify Deploy Preview for PR #172: ready at https://deploy-preview-172--tennis-value-scanner-developer.netlify.app/
- Production Netlify deploy remains on main commit 655a26a8709b9fd863180c3b4f001fc262cbe193.
- PR #172 remains open/draft. PR #173 remains open/unmerged. No Production deployment was performed.
