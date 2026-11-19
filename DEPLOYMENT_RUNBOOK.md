# Production launch runbook

Last reviewed: 2026-11-19

This project has two independently deployed parts:
- Static PWA on Netlify: https://fascinating-paprenjak-1aa9b3.netlify.app
- API on Cloudflare Workers: https://tennis-value-api.fonds-enfiedjian.workers.dev

A passing GitHub test run does not deploy either service. Never mark launch complete until the live smoke check passes.

## 1. Preflight

1. Confirm the latest commit on `main` has a green **Regression tests** workflow.
2. Confirm Netlify site `fascinating-paprenjak-1aa9b3` is connected to this repository and deploys the `main` branch.
3. Confirm the Netlify publish directory is the repository root (the PWA is static; there is no package.json build step).
4. Confirm the Cloudflare Worker name is `tennis-value-api`, entry point is `worker.js`, and `wrangler.toml` is the active configuration.
5. Confirm Cloudflare Worker secrets exist: `LIVE_TENNIS_API_KEY` and `APIFY_TOKEN`. Never paste secret values into GitHub files, logs, issues, or chat.

## 2. Publish the PWA

1. Open https://app.netlify.com/sites/fascinating-paprenjak-1aa9b3/deploys
2. Confirm the latest deploy is from the current `main` commit.
3. If it is not, use **Trigger deploy → Deploy site**.
4. Wait for the deploy to finish successfully.
5. Open https://fascinating-paprenjak-1aa9b3.netlify.app in a private browser tab and confirm the app title and current UI.
6. On an installed Android PWA, fully close and reopen the app after deployment so Service Worker v110 can install.

## 3. Publish the Worker

From a trusted terminal with Wrangler authenticated to the intended Cloudflare account:

```sh
npx wrangler deploy
```

The repository's `wrangler.toml` selects `worker.js` and the Worker name. Before deploying, verify that the authenticated Cloudflare account is the one that owns `tennis-value-api`. Do not add, print, or commit secrets during deployment.

## 4. Run the live smoke check

1. Open https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/workflows/production-smoke.yml
2. Choose **Run workflow** on `main`.
3. Require a green run.
4. Review the reported PWA status, Worker health, secret-presence booleans, match payload shape, odds item count, and feed diagnostics.

The smoke check deliberately does not require a nonzero odds count: an empty dataset must be reported as a feed problem, not mistaken for valid bookmaker coverage.

## 5. Real-device acceptance

On the Android PWA:
- Settings: change minimum EV, save, reopen settings, verify the saved value remains.
- Theme: preview Olive Court, cancel and verify rollback; select again, save, close/reopen and verify persistence.
- Matches: manual refresh should show the source/cache status.
- Odds: verify quote timestamps and that both sides belong to the same Winamax event.
- EV: confirm odds outside the configured range may be visible but are not eligible for EV.
- Bankroll: virtual and actual ledgers remain separate; actual ledger must be explicitly initialized.
- Import: preview Winamax CSV, check duplicate count, then confirm only after review.
- Offline: reopen with network disabled and confirm cached matches are labelled as cached/offline.

Do not place real bets as an acceptance test. Do not infer profitability from a successful technical launch.

## 6. Troubleshooting order

- PWA smoke failure: inspect Netlify deploy status, publish directory, and deploy commit.
- Worker health failure: inspect Worker deployment and required secret-presence flags.
- Matches failure: inspect Live Tennis key, plan/quota, upstream status, and Worker logs.
- Odds endpoint error: inspect Apify token, dataset ID `ZBWihC1oYU8Pq9uBo`, upstream status, and Worker logs.
- Odds endpoint returns items but no eligible pairs: compare `diagnostics.fieldCoverage`, bookmaker names/country, outcome counts, freshness, event IDs, player names, competition, and start times. Do not weaken matching rules to force quotes onto unrelated matches.
- Browser still shows old UI: close all PWA windows, reopen, and verify Service Worker cache version `tennis-value-static-v110`.

## Current deployment status

Unknown until the manual production smoke check passes. Repository commits and CI results are not evidence of a live deployment.
