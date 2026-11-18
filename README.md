# Tennis Value Scanner

PWA for scanning tennis match-winner odds from Winamax (France) and comparing them with probabilities calculated from player Elo ratings.

## Architecture

- **Frontend:** static `index.html`, served by Netlify.
- **Backend:** Cloudflare Worker in `worker.js`.
- **Match schedule and player profiles:** Live Tennis API.
- **Odds:** Apify dataset populated with Winamax tennis markets.
- **Secrets:** stored in Cloudflare Worker secrets; never put API keys in frontend code or commit them to GitHub.

## Worker endpoints

Base URL: `https://tennis-value-api.fonds-enfiedjian.workers.dev`

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Worker status and secret-configuration flags |
| `/usage` | GET | Live Tennis API quota usage |
| `/matches` | GET | Match schedule; defaults to upcoming |
| `/odds` | GET | Current Winamax dataset records |
| `/predict` | GET or POST | Elo probability and optional expected-value calculation |

### Match filters

`/matches` accepts `status` (`live`, `upcoming`, `completed`, `cancelled`), `limit` (1–200), `offset` (0–100000), `tour` (`atp`, `wta`, `challenger`, `itf`, `juniors`), `draw` (`singles` or `doubles`), `from`, `to`, `player`, `country`, `has_market`, and `has_analysis`. Filter values are validated before the upstream request.

### Prediction input

POST JSON may contain either both `playerIdA` and `playerIdB`, or neither. With player IDs, the Worker retrieves the player profiles and extracts Elo ratings. Without IDs, supply `ratingA` and `ratingB` for a manual test.

Optional `oddsA` and `oddsB` must be greater than 1 and no greater than 1000. Ratings must be greater than 0 and no greater than 5000. POST bodies are limited to 16 KB measured in actual UTF-8 bytes; the Worker does not rely on the caller's `Content-Length` header.

## Caching

- Match queries: Cloudflare cache for 15 minutes.
- Winamax odds: Cloudflare cache for 5 minutes.
- Player profiles: Cloudflare cache for 7 days.
- Frontend match cache: 15 minutes.
- Frontend odds cache: 10 minutes; odds records older than 90 minutes are rejected by the matcher.

These are quota and resilience safeguards, not guarantees that a bookmaker price is still available at the moment a bet is placed.

## Prediction archive

The frontend stores local snapshots of each priced player outcome (odds, Elo probability, estimated EV, match, and capture time) on the current device. Repeated snapshots with unchanged odds, probability and Elo rating metadata within ten minutes are suppressed; the archive keeps at most 600 entries and can be exported as CSV. The archive is device-local and is not synchronized across devices. Imported EV values are recalculated from the stored odds and probability rather than trusted from the backup. Its EV summaries are estimates, not verified win/loss or profit statistics.

## Probability and value calculations

The Worker converts the difference between the two general Elo ratings into a win probability with the standard Elo logistic formula:

`P(A) = 1 / (1 + 10^((EloB - EloA) / 400))`

Player B receives the complementary probability (`1 - P(A)`). Model probabilities are calculated from Elo ratings alone; bookmaker odds are not inputs to the probability calculation. Fair odds are `1 / probability`. Expected value uses the offered decimal price: `EV (%) = (probability × decimal odds - 1) × 100`. EV is only as reliable as the underlying probability estimate and is not a measured return.

## Model limitations

The current model uses general player Elo ratings. Where the provider publishes `stats.ratings_as_of`, the app displays each player's rating date and stores it with the prediction snapshot and CSV export; a missing date is shown as unavailable rather than guessed. It does **not** yet adjust for court surface, injuries, recent form, fatigue, head-to-head context, or tournament conditions. The first three eligible matches are checked for predictions in the current frontend. Positive EV is a model estimate, not a guarantee of profit.

Unsupported markets (totals, handicaps, and set betting) are not connected; only match-winner odds are processed.

## Automated checks

The GitHub Actions workflow runs on every push to `main` and on pull requests. It uses Node.js 22 and the built-in test runner; no third-party test packages are required.

Run the same checks locally:

```sh
node --test tests/*.test.mjs
```

The suite covers Elo extraction and probability calculations, Worker request validation, CORS headers, frontend JavaScript syntax, and the prediction archive wiring. The suite covers the Worker, frontend and offline backtest; tests use mocked runtime dependencies and do not consume Live Tennis API or Apify quota.

## Deployment

### Cloudflare Worker

Configure these Worker secrets:

- `LIVE_TENNIS_API_KEY`
- `APIFY_TOKEN`

Deploy from the repository root with Wrangler:

```sh
npx wrangler deploy
```

### Frontend

Publish the repository's static frontend files through the configured Netlify site. The PWA uses `manifest.webmanifest`, `icon.svg`, and `sw.js`.

Do not commit credentials, access tokens, or local environment files.


Archive backups: export a versioned JSON backup from the archive view and import it later. Import merges records, validates fields, skips duplicates/invalid entries, and retains the newest 600 records (2 MB file limit).


### Verified match results

The archive can check up to 10 older archived matches per run using the FREE single-match detail endpoint `GET /matches/{matchId}`. The app waits at least three hours after scheduled start and rate-limits repeat checks per match to 30 minutes. Only API results with `outcome: "completed"` and a valid `winner` are counted in model hit-rate statistics. Retirements, walkovers, defaults, abandoned and unresolved matches are recorded separately and excluded from accuracy. Result revisions are tracked with `result_version`, so a newer official correction replaces an older stored result. Matches without a stored Live Tennis API match ID cannot be reconciled automatically. The displayed accuracy compares the model's last archived favourite for each match with the official winner; it is a prediction hit rate, not betting ROI or proof of profit. It is calculated only after verified full matches and excludes withdrawals and other non-standard outcomes. The archive also compares the first and latest saved odds for each match side and counts price shortening and drifting. This is descriptive market movement only; it does not establish that a bet was placed or that value was realized.

The API's completed-match LIST endpoint is a paid History feature; this implementation deliberately uses individual match lookups for IDs already held in the local archive instead of polling the paid history listing.

## Historical model backtest (offline)

A dependency-free chronological backtest is available for Jeff Sackmann-style ATP/WTA match CSV files. Download the relevant CSV files separately from the [Jeff Sackmann ATP archive](https://github.com/Aneeshers/tennis-sackmann-archive/tree/main/atp) or [WTA archive](https://github.com/Aneeshers/tennis-sackmann-archive/tree/main/wta); the raw datasets are intentionally not copied into this repository. The archive mirror reports ATP/WTA files through June 2026, so it is historical research data rather than a current live feed. Run ATP and WTA separately: player IDs are not assumed to be globally unique across tours.

Run it with Node.js 22:

```sh
node scripts/backtest.mjs --from 20240101 --to 20251231 data/atp_matches_2022.csv data/atp_matches_2023.csv data/atp_matches_2024.csv data/atp_matches_2025.csv
node scripts/backtest.mjs --from 20240101 --to 20251231 data/wta_matches_2022.csv data/wta_matches_2023.csv data/wta_matches_2024.csv data/wta_matches_2025.csv
```

The files before `--from` are used only to build historical ratings, surface records, recent form and head-to-head history. They are warm-up data and do not contribute to the reported metrics. The optional `--to` sets the final evaluation date. Dates use the dataset's `YYYYMMDD` format.

The report compares five exploratory candidates: overall Elo, a surface-Elo blend, Elo plus recent form, Elo plus head-to-head, and a combined variant. It reports Brier score, log loss and winner-pick accuracy overall, broken down by calendar year and court surface (including unknown surface). These breakdowns help identify whether an apparent improvement is stable across seasons and playing conditions. Lower Brier score and log loss are better; accuracy alone is not a calibration metric, and none of these metrics represents betting profit or ROI.

The evaluation is chronological. Every match on a given tournament date is predicted using only state from earlier dates; that date's results are applied only after all predictions for that date. The script excludes invalid player IDs/dates and walkovers, retirements, defaults and abandoned matches. It strips a UTF-8 BOM from CSV headers, removes duplicate tournament match rows when tournament and match IDs are present, and reports duplicate and unknown-surface row counts. Surface and form features use only previously observed results. The candidate weights are deliberately exploratory and are not automatically copied into the live prediction model. Compare results across multiple seasons and tours before considering any production change.


### Initial historical comparison (2024–2025)

An initial out-of-sample comparison was run on the ATP and WTA archive CSVs for 2022–2025. The 2022–2023 matches were warm-up only; metrics below use matches dated 2024-01-01 through 2025-12-31. ATP and WTA were evaluated separately. The run used the script's default K-factor (32) and five-match minimum before enabling the surface blend.

| Candidate | ATP Brier | ATP log loss | ATP accuracy | WTA Brier | WTA log loss | WTA accuracy |
|---|---:|---:|---:|---:|---:|---:|
| Overall Elo | 0.21906 | 0.62592 | 63.65% | 0.21997 | 0.62891 | 63.67% |
| Surface blend | 0.21775 | 0.62285 | 63.99% | 0.21913 | 0.62667 | 63.54% |
| Elo + recent form | 0.21996 | 0.62823 | 63.65% | 0.22109 | 0.63175 | 63.54% |
| Elo + head-to-head | 0.21904 | 0.62588 | 63.85% | 0.22005 | 0.62919 | 63.78% |
| Combined | 0.21844 | 0.62443 | 64.15% | 0.22011 | 0.62907 | 63.59% |

The evaluation contained 5,785 ATP and 5,293 WTA matches, after filtering invalid records and non-standard outcomes. The 2022–2023 warm-up contained 5,716 ATP and 5,188 WTA matches. There were no duplicate match keys in these files; 51 ATP and 124 WTA matches had an unrecognized or missing surface.

The surface blend improved Brier score and log loss over overall Elo on both tours in this sample, but it did not improve winner accuracy on WTA. Recent form and the combined variant did not consistently improve calibration. This is evidence to investigate surface-specific ratings further, **not** enough to promote new weights into the live model. The test uses match results only, not historical Winamax prices; it does not measure betting ROI, closing-line value, or profitability. Re-run the commands above when the source archive changes, and validate on additional seasons before any production change.


### Year-by-year stability check (2024 and 2025)

The same 2022–2025 ATP/WTA files were also evaluated separately by season, retaining 2022–2023 as warm-up. Brier score by year:

| Tour / season | Overall Elo | Surface blend | Elo + form | Elo + H2H | Combined |
|---|---:|---:|---:|---:|---:|
| ATP 2024 (3,050 matches) | 0.21902 | **0.21758** | 0.21992 | 0.21896 | 0.21823 |
| ATP 2025 (2,735 matches) | 0.21910 | **0.21795** | 0.22000 | 0.21912 | 0.21868 |
| WTA 2024 (2,686 matches) | 0.21914 | **0.21864** | 0.22038 | 0.21926 | 0.21974 |
| WTA 2025 (2,607 matches) | 0.22082 | **0.21963** | 0.22182 | 0.22086 | 0.22050 |

The surface blend had the lowest Brier score in all four tour-season slices, so its calibration improvement was not confined to one of the two evaluated years. Recent-form adjustment was worse than overall Elo in every slice. H2H was close to baseline and inconsistent; the combined candidate did not beat the surface-only blend. This strengthens the case for a carefully validated surface-rating experiment, but it still does not establish positive betting value: historical odds and market comparison are absent, and the candidate weights have not been tuned on a separate validation set.

Data licensing matters: the commonly used Sackmann archive is distributed under CC BY-NC-SA 4.0. Check the source repository's current license and attribution requirements before use or redistribution; the non-commercial restriction may not permit commercial use. Treat older CSVs as historical backtest data, not a live feed.
