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

The frontend stores local snapshots of each priced player outcome (odds, Elo probability, estimated EV, match, and capture time) in IndexedDB on the current device, with the existing localStorage archive retained as a compatibility and recovery copy. On first launch, legacy localStorage records are migrated transactionally; startup reconciles the two copies before the app loads matches. If IndexedDB is unavailable, the app falls back to localStorage. Repeated snapshots with unchanged odds, probability and Elo rating metadata within ten minutes are suppressed. The archive can retain up to 3,000 entries; when storage is constrained it retries with smaller limits, prioritizing verified completed results over pending snapshots. CSV export supports historical analysis. The offline odds-backtest audit also preserves each side's exported `ratingAsOf` date and reports missing, malformed, pre-match, same-day, and post-match rating-date counts. Duplicate side snapshots at the same capture time must agree on odds, probability, player identity and rating date; conflicting provenance is rejected rather than silently taking the first row. This is only a provenance hint: a date earlier than the match does not prove the probability was actually calculated from that rating snapshot, and a same-day date has no known intraday ordering. Treat the audit as a completeness check, not proof of strictly pre-match model provenance. JSON backups use a versioned v2 format with a record count and checksum; imports verify both before changing local data. The checksum detects accidental corruption, but is not a cryptographic signature or proof of who created the file. Older v1 backups remain importable. Imports merge rather than replace the current archive and ignore duplicate or invalid rows. IndexedDB improves capacity and write reliability but is still device-local browser storage, not cloud backup; export backups regularly before clearing browser data or reinstalling the app. Imported EV values are recalculated from stored odds and probability rather than trusted from the backup. Its EV summaries are estimates, not verified win/loss or profit statistics.


## Bankroll and bet ledger

The frontend includes a device-local bankroll ledger, initially seeded with €100. It separates free cash, stakes reserved in open bets, total equity, deposits, withdrawals and realized betting profit. Each bet records the match, selection, tour, court surface when supplied by the feed, bookmaker, odds, model probability, estimated EV, stake and timestamp. Settlements are recorded as won, lost or void; the ledger updates the available balance and realized profit without mixing deposits or withdrawals into betting performance.

The portfolio allocator sorts eligible candidates by estimated EV and distributes stakes across distinct matches using one quarter of the Kelly fraction, capped at 2% of current bankroll equity per bet, 8% aggregate open-stake exposure and 8% cumulative stake turnover per local calendar day. It previews the allocation and requires explicit user confirmation before recording the virtual bets. It also enforces a minimum decimal price of 1.90 and minimum estimated EV of 3%. The amount is a conservative sizing rule, not proof that the model has an edge. A user must explicitly confirm adding a virtual bet to the ledger; the app does not place wagers or transfer money to Winamax. Where the archive contains a consistent verified `completed` result for the same numeric match ID, the ledger automatically settles the linked bet using its stored A/B side. Retirements, walkovers, cancellations, missing IDs and conflicting result records are deliberately not auto-settled; those remain open for manual review because bookmaker void rules can differ. A newer official result version recalculates a previously auto-settled bet; if a revision changes a completed match to a non-completed status, the prior payout is reversed and the bet is reopened for manual review.

Bankroll data is stored separately from the prediction archive in browser local storage on the current device. A versioned JSON backup with an accidental-corruption checksum can be exported and restored (the checksum is not a cryptographic signature); imports also validate transaction types, timestamps, unique IDs and balance movements before accepting the ledger. The transaction ledger can be exported as semicolon-delimited CSV for spreadsheet analysis. The dashboard reports gross cash inflows and outflows (including stake reservations and settlement payouts) alongside external deposits and withdrawals, total staked, realized profit and ROI on settled stake volume; external funding is therefore distinguishable from betting turnover and still-open stakes. ROI is calculated as realized profit divided by the stake volume of won and lost bets; voided stakes are excluded from the denominator and reported separately. When an official result is revised, superseded settlements are reversed in the ledger and are not counted as realized profit. Clearing browser data or reinstalling the PWA can remove local records, so keep a backup. The ledger is not a bank account or a cloud-synced wallet.

## Probability and value calculations

The Worker converts the difference between the two general Elo ratings into a win probability with the standard Elo logistic formula:

`P(A) = 1 / (1 + 10^((EloB - EloA) / 400))`

Player B receives the complementary probability (`1 - P(A)`). Model probabilities are calculated from Elo ratings alone; bookmaker odds are not inputs to the probability calculation. Fair odds are `1 / probability`. Expected value uses the offered decimal price: `EV (%) = (probability × decimal odds - 1) × 100`. EV is only as reliable as the underlying probability estimate and is not a measured return.

## Live data freshness indicator

Each calculated match card labels the freshness of its inputs separately from the model probability. The label is **high** only when both player Elo update dates are known and no older than 14 days and the matched Winamax quote is no older than 30 minutes. It is **medium** when both rating dates are known and no older than 30 days and the quote is no older than 90 minutes. Missing dates, older ratings, or unknown/out-of-window quote age produce a **limited** label. This is a data-recency diagnostic, not a confidence interval, win probability, or guarantee that a price remains available. The live value-signal gate also excludes candidates when either rating date or quote age is outside the good/medium freshness bands, when either rating fails validation, or when a same-bookmaker, same-event market pair disagrees with Elo by at least 15 percentage points. Matches whose scheduled start has passed, whose odds event has started, or whose status is live/completed/cancelled are also excluded from live value calculations, including stale schedule-cache entries. A provisional single-source Elo estimate can still be shown, but is labelled provisional; it is not presented as agreement with the market. For bankroll allocation, high freshness receives the full calculated stake, medium freshness receives half, and limited freshness is excluded from the recommended portfolio. This is a conservative data-recency safeguard, not a statistical confidence score. Segment calibration in the live archive reports populated 5-percentage-point probability buckets separately for each known tour and surface; a match is omitted from a segment if its side records disagree on that segment's metadata. Bucket counts remain visible so small samples are not mistaken for stable evidence.

## Model limitations

The current model uses general player Elo ratings. Where the provider publishes `stats.ratings_as_of`, the app displays each player's rating date and stores it with the prediction snapshot and CSV export; a missing date is shown as unavailable rather than guessed. It does **not** yet adjust for court surface, injuries, recent form, fatigue, head-to-head context, or tournament conditions. All eligible matches with a valid local Elo prediction cache (up to seven days old) are re-evaluated against current odds; only the first three eligible cache misses request new player profiles per scan to protect the free API quota. The daily highlight is selected only from matches actually checked, and the UI reports checked matches versus total eligible matches. The daily highlight also obeys the configured minimum EV (default 3%) and the 1.90 minimum odds floor; it selects the highest EV only among bets meeting both thresholds. Positive EV is a model estimate, not a guarantee of profit.

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


Archive backups: export a versioned JSON backup from the archive view and import it later. Import merges records, validates fields, skips duplicates/invalid entries, and retains up to 3,000 records according to verified-result priority and recency (2 MB file limit).


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

The files before `--from` are used only to build historical ratings, surface records, recent form and head-to-head history. They are warm-up data and do not contribute to the reported metrics. For each evaluation year, the calibration fit uses all available earlier calendar years; matches before `--from` can contribute to training but never to evaluation metrics. Surface-specific fits require at least 200 prior matches and now report insufficient samples explicitly rather than silently omitting the segment. The fitted transform remains a research diagnostic and is not applied to live probabilities. The optional `--to` sets the final evaluation date. Dates use the dataset's `YYYYMMDD` format.

The report compares five exploratory candidates: overall Elo, a surface-Elo blend, Elo plus recent form, Elo plus head-to-head, and a combined variant. It reports Brier score, log loss and winner-pick accuracy overall, broken down by calendar year, court surface (including unknown surface), and calendar-year-by-surface combinations. Each year/surface cell includes its match count, sample-size tier (fewer than 30 low, 30–99 limited, 100 or more larger sample), the five candidate metric summaries, and per-candidate favourite-calibration bins with ECE. Treat sparse cells and bins as descriptive only, not as reliable evidence of a persistent surface or seasonal effect. Sparse cells should be treated as descriptive only, not as reliable evidence of a persistent surface or seasonal effect. It also reports favourite calibration in ten probability bands from 50–55% through 95–100%, with sample count, mean predicted win probability, observed win rate, per-bin gap, and expected calibration error (ECE). Favourite calibration uses the stronger-rated side's probability and whether that side won; exact Elo ties contribute a half-win. Each probability bin also reports an approximate 95% interval for its observed favourite-win rate, using the sample standard error. Exact Elo ties contribute a half-win to the observed rate but retain Bernoulli outcome variance in the interval, so repeated ties do not create a falsely zero-width interval. A sample-size tier is also shown: fewer than 30 is low, 30–99 limited, and 100 or more a larger sample. These intervals are descriptive approximations, not formal binomial Wilson intervals; small samples remain highly uncertain. These breakdowns help identify whether an apparent improvement is stable across seasons and playing conditions. ECE is sample-size weighted and should be interpreted alongside the bin counts; sparse high-probability bins are not reliable evidence. Lower Brier score and log loss are better; accuracy alone is not a calibration metric, and none of these metrics represents betting profit or ROI.

The evaluation is chronological. Every match on a given tournament date is predicted using only state from earlier dates; that date's results are applied only after all predictions for that date. The script excludes invalid player IDs/dates and walkovers, retirements, defaults and abandoned matches. It strips a UTF-8 BOM from CSV headers, removes duplicate tournament match rows when tournament and match IDs are present, and reports duplicate and unknown-surface row counts. Surface and form features use only previously observed results. The candidate weights are deliberately exploratory and are not automatically copied into the live prediction model. Compare results across multiple seasons and tours before considering any production change.


### Initial historical comparison (2024–2025)

An initial out-of-sample comparison was run on the ATP and WTA archive CSVs for 2022–2025. The 2022–2023 matches were warm-up only; metrics below use matches dated 2024-01-01 through 2025-12-31. ATP and WTA were evaluated separately. The run used the script's default K-factor (32) and five-match minimum before enabling the surface blend.

| Candidate | ATP Brier | ATP log loss | ATP accuracy | WTA Brier | WTA log loss | WTA accuracy |
|---|---:|---:|---:|---:|---:|---:|
| Overall Elo | 0.21931 | 0.62648 | 63.48% | 0.22009 | 0.62920 | 63.27% |
| Surface blend | **0.21798** | **0.62334** | **63.79%** | **0.21923** | **0.62693** | **63.44%** |
| Elo + recent form | 0.22023 | 0.62884 | 63.48% | 0.22124 | 0.63211 | 63.44% |
| Elo + head-to-head | 0.21929 | 0.62642 | 63.54% | 0.22017 | 0.62946 | 63.39% |
| Combined | 0.21869 | 0.62497 | 64.04% | 0.22024 | 0.62937 | 63.42% |

The evaluation contained 5,785 ATP and 5,293 WTA matches, after filtering invalid records and non-standard outcomes. The 2022–2023 warm-up contained 5,716 ATP and 5,188 WTA matches. There were no duplicate match keys in these files; 51 ATP and 124 WTA matches had an unrecognized or missing surface.

The surface blend improved Brier score and log loss over overall Elo on both tours in this sample, but it did not improve winner accuracy on WTA. Recent form and the combined variant did not consistently improve calibration. This is evidence to investigate surface-specific ratings further, **not** enough to promote new weights into the live model. The test uses match results only, not historical Winamax prices; it does not measure betting ROI, closing-line value, or profitability. A separate odds-history evaluator is available at `node scripts/odds-backtest.mjs [--min-ev 3] [--min-odds 1.90] [--stake 1] [--bankroll 100] data/odds-history.csv`. It accepts either normalized CSV (`match_id,match_start,odds_captured_at,model_calculated_at,quote_a_captured_at,quote_b_captured_at,quote_a_observed_at,quote_b_observed_at,player_a,player_b,odds_a,odds_b,probability_a,winner`, with optional `bookmaker` and `capture_status`) or the app's own semicolon-delimited `tennis-value-archive.csv` export. For the app archive, it pairs A/B records captured at the same timestamp and from the same bookmaker, converts stored percentage probabilities, and includes only verified `completed` results with a known winner; retirements, walkovers, unsettled matches, and incomplete pairs are excluded. The adapter returns `ignoredByReason` counters for conflicting/malformed match IDs, unsupported results, invalid dates and numeric timestamps, invalid sides/odds/probabilities, non-upcoming captures, incomplete side pairs, opponent-identity mismatches, and quote-side skew. Each A-side player must match the B-side opponent and vice versa; contradictory identity records are excluded rather than guessed. Capture and quote timestamps must be safe integer millisecond values. Exact duplicate snapshots at one timestamp are collapsed; conflicting prices or probabilities for the same match and timestamp are rejected. The app archive stores `modelCalculatedAt`, each side's source `scrapedAt` as `quoteCapturedAt`, and the browser observation time `quoteObservedAt`, separately from the final `capturedAt`. Strict backtest inclusion requires each source quote timestamp <= its browser observation <= model calculation <= final archive capture, and each quote must be no older than 90 minutes when observed, and the two sides must have source scrape times within 30 minutes; model calculation must also be strictly earlier than match start. The report exposes `archiveCoverage.quoteTimestampProvenance`. The report also includes `researchAssessment`: it separates absence of valid matches, absence of qualifying bets, unavailable chronological holdout, and an exploratory-only result. It reports training/validation match counts and the validation result for the baseline 3% EV / 1.90 odds threshold. `exploratory_only` is deliberately not a green light: even a large sample and a chronological holdout do not establish a durable edge or account for execution costs.  when `capture_status` is present it must be `upcoming`. Legacy archive rows without model calculation time, malformed timestamps, equal-time ordering, post-odds calculations, and non-upcoming captures are excluded from the strict cohort and counted in `archiveCoverage.modelProbabilityProvenance`. The app records the response/cache timestamp for the actual Elo result; it does not claim to timestamp every upstream profile fetch independently. `ratingAsOf` remains only a calendar-date hint, not proof of intraday ordering. The normalized CSV timestamps must include a timezone and winner must be A or B. If `bookmaker` (or `source`/`provider`) is supplied, all snapshots for a match must use the same source; the selected source is retained in the report. Never combine prices from different bookmakers into one opening-to-closing comparison. When a CSV contains more than one bookmaker, the command-line runner partitions it and emits a separate complete report for each bookmaker; it does not pool their bets into a single ROI figure. By default, snapshots older than 1,440 minutes (24 hours) before scheduled start are rejected; override with `--max-snapshot-age-minutes N` when the source archive has a documented reason to use a wider window. The report includes an archive-coverage block with unique matches, valid snapshots, match-date span, bookmaker/tour/surface coverage, snapshots per match, and the number of matches with and without a qualifying closing quote. It also reports identical duplicate snapshots collapsed, the median snapshot depth (arithmetic median for even-sized samples), the number of matches represented by only one snapshot, inter-snapshot cadence (minimum/median/maximum interval and counts of gaps over 2/6/24 hours), and calendar-day coverage across the observed match-date range. Days without matches are descriptive calendar gaps, not automatically classified as missing data because tournament schedules naturally contain off-days. This archive-coverage count includes every valid match, even when no side passes the betting thresholds; the separate CLV measured count applies only to selected bets. It also includes rejected stale-snapshot count, accepted snapshot-age range/median, and entry/closing snapshot age per selection. This is a data-quality guard, not proof that a bookmaker price remained executable. The earliest valid snapshot is the simulated entry price. Closing-line value is calculated only when a later snapshot exists within the final 60 minutes before scheduled start (configurable with `--max-closing-age-minutes`); otherwise CLV is reported as unavailable, not zero. Both entry and closing market probabilities are proportionally de-vigged, and the report shows the closing sample count and closing overround. It reports flat-stake profit, ROI, hit rate, expected value, opening overround and closing-line value, plus an approximate 95% ROI confidence interval (t approximation below 30 bets, normal approximation from 30), a Wilson 95% interval for hit rate, and results split into odds bands (1.90–2.49, 2.50–3.49, 3.50–4.99, 5.00+). Samples below 30 bets are labelled very small, 30–99 small, 100–299 moderate, and 300+ larger-but-not-proof. The intervals describe sampling uncertainty only; they do not correct for model-selection bias, time dependence, unrepresentative odds archives, or execution costs. It also simulates a €100 starting bank (configurable with `--bankroll`) under fixed €1, 1%, 2%, and quarter-Kelly staking, reporting ending balance, profit, ROI, hit rate and maximum drawdown, with separate strategy results by ATP/WTA/tour and surface where those fields exist in the archive. The simulation selects at most one highest-EV side per match, allocates each calendar day's bets in descending EV order, and settles that day's results together. All four strategies, including the fixed €1 benchmark, are capped at 2% of starting-day equity per bet and 8% aggregate same-day exposure to match the live risk limits; the flat benchmark may therefore stake less than €1 on a small bankroll. This is a conservative same-day exposure approximation, not an intraday execution replay. It cannot establish live profitability without representative historical odds and genuinely pre-match model probabilities; commission, limits, voids and execution slippage are not modelled. Re-run the commands above when the source archive changes, and validate on additional seasons before any production change. By default, the odds backtest also returns a fixed 5×4 threshold-sensitivity grid: minimum EV of 1%, 2%, 3%, 5%, or 7%, crossed with minimum odds of 1.90, 2.10, 2.30, or 2.50. Each combination is scored separately on a chronological 70/30 split by UTC match day, with the same-day matches kept together. The report includes training and held-out bet counts, profit, ROI/Yield, CLV and flat-€1 maximum drawdown. The grid is descriptive: do not select a threshold from the held-out results and then treat that same holdout as independent confirmation. Set `thresholdSensitivity: false` when calling the module programmatically to omit the grid.


### Held-out probability recalibration

The backtest also tests a probability correction without fitting and scoring it on the same matches. For each evaluation year, it fits a one-parameter logistic slope using all available earlier calendar years (including matches supplied before `--from` as warm-up data) and evaluates the unchanged transformation only on that year's selected evaluation-window matches. No same-year or future outcomes enter the training set; the report lists the contributing `trainingYears`. The intercept is fixed at zero so a 50% Elo tie remains exactly 50%; the slope is constrained to a positive range and weakly regularized toward 1 (no correction). The report compares held-out Brier score, log loss and ECE before and after recalibration. It also reports exploratory per-surface fits when the cumulative earlier-years surface sample reaches 200 matches. ATP and WTA must be run separately, so each receives its own fit.

Each held-out validation row labels both its training and evaluation sample using the same tiers as the calibration bins: fewer than 30 is low, 30–99 limited, and 100 or more larger sample. A fit trained on a large sample can still have a low-quality evaluation sample; inspect both labels before interpreting a small apparent gain. These labels are descriptive and do not replace confidence intervals or repeated validation. This is chronological validation, not a production change. The calibrator uses every available year strictly before the evaluation year, including pre-`--from` warm-up years. Thus a `--from 20250101` evaluation can still train on supplied 2022–2024 data, while only 2025 matches are scored. The report's `trainingYears` field makes this provenance explicit. A surface-specific correction can be noisier than the tour-wide fit even when its training sample passes the minimum threshold. Prefer the tour-wide held-out result unless a surface-specific gain repeats across multiple independent year pairs. Do not infer betting ROI from calibration metrics.

For a three-step rolling check (2023→2024, 2024→2025 and 2025→2026), include all evaluation years and the 2026 files:

```sh
node scripts/backtest.mjs --from 20230101 --to 20260525 data/atp_matches_2022.csv data/atp_matches_2023.csv data/atp_matches_2024.csv data/atp_matches_2025.csv data/atp_matches_2026.csv
node scripts/backtest.mjs --from 20230101 --to 20260525 data/wta_matches_2022.csv data/wta_matches_2023.csv data/wta_matches_2024.csv data/wta_matches_2025.csv data/wta_matches_2026.csv
```

An independent run on the archive snapshot produced these tour-wide results. The 2026 test contains matches only through 2026-05-25, not a full season.

| Tour | Candidate | Train→test | Test matches | Slope | Brier raw→calibrated | ECE raw→calibrated |
|---|---|---:|---:|---:|---:|---:|
| ATP | Overall Elo | 2023→2024 | 3,050 | 0.9008 | 0.21848→0.21805 | 2.63→2.10% |
| ATP | Overall Elo | 2024→2025 | 2,735 | 0.8893 | 0.21832→0.21774 | 3.35→2.28% |
| ATP | Overall Elo | 2025→2026* | 1,406 | 0.8435 | 0.21727→0.21664 | 2.55→1.40% |
| WTA | Overall Elo | 2023→2024 | 2,686 | 1.0482 | 0.21913→0.21943 | 2.76→3.22% |
| WTA | Overall Elo | 2024→2025 | 2,607 | 0.9123 | 0.21628→0.21596 | 3.71→1.84% |
| WTA | Overall Elo | 2025→2026* | 1,249 | 0.8599 | 0.21009→0.20989 | 2.88→2.36% |
| ATP | Surface blend | 2023→2024 | 3,050 | 0.9812 | 0.21701→0.21697 | 1.65→1.69% |
| ATP | Surface blend | 2024→2025 | 2,735 | 0.9715 | 0.21714→0.21704 | 2.57→2.17% |
| ATP | Surface blend | 2025→2026* | 1,406 | 0.9129 | 0.21592→0.21570 | 1.78→2.70% |
| WTA | Surface blend | 2023→2024 | 2,686 | 1.1400 | 0.21863→0.21923 | 1.61→2.76% |
| WTA | Surface blend | 2024→2025 | 2,607 | 0.9845 | 0.21506→0.21503 | 2.02→1.87% |
| WTA | Surface blend | 2025→2026* | 1,249 | 0.9403 | 0.20915→0.20913 | 2.64→2.44% |

*2026 archive rows run from 2026-01-04 through 2026-05-25. Results are not a full-season test.*

Interpretation: the ATP overall-Elo correction improved Brier and ECE in all three windows, but gains were modest. WTA overall Elo was worse after correction in 2023→2024 and better in the next two windows, so its stability is not established. Surface-blend calibration gains were tiny and ECE moved in both directions. The separate per-surface fits were also inconsistent, including deterioration on grass. Therefore no calibration transform or exploratory feature weights were promoted to the live model. The 2026 partial-season window should be revisited after the archive receives the rest of the season, and historical match metrics still do not establish betting ROI.

### Calibration check (2024–2025)

A separate favourite-calibration report was computed from the same chronological evaluation window after correcting same-day Elo updates to be order-independent. Each match contributes one observation: the higher-probability side's predicted win probability and whether that favourite won. Exact Elo ties count as half a win. ECE is the weighted average absolute difference between predicted and observed win rates across ten 5-percentage-point bins.

| Tour | Candidate | Brier | ECE |
|---|---|---:|---:|
| ATP | Overall Elo | 0.21931 | 2.63% |
| ATP | Surface blend | **0.21798** | **1.63%** |
| WTA | Overall Elo | 0.22009 | 2.28% |
| WTA | Surface blend | **0.21923** | **1.52%** |

The surface blend reduced both Brier score and ECE versus overall Elo in ATP and WTA. Extreme probability bands are sparse (for example, only 19 WTA favourites fell in the 95–100% band for overall Elo), so observed rates there are noisy and must not be treated as stable estimates.

The same-day update correction changes historical Elo trajectories, so the earlier year-by-year numeric table is withdrawn pending a fresh run with the corrected implementation. Use the current script output for any new seasonal comparison. These aggregate calibration results are diagnostics, not a calibrated probability transformation and not evidence of betting profit. No live-model weights have been changed.

Data licensing matters: the commonly used Sackmann archive is distributed under CC BY-NC-SA 4.0. Check the source repository's current license and attribution requirements before use or redistribution; the non-commercial restriction may not permit commercial use. Treat older CSVs as historical backtest data, not a live feed.


## Valuebetennis historical results adapter

The repository includes `scripts/valuebetennis-backtest.mjs` for the public Valuebetennis seasonal CSV files (ATP/WTA singles, 2021 onward). The adapter maps the documented source columns `match_id`, `date`, `tournoi_id`, `genre`, `surface`, `joueur1_id`, `joueur2_id`, `vainqueur_id`, and `score` into the chronological Elo backtest schema. It detects comma, semicolon, or tab delimiters; validates dates, player IDs, winner identity and tour; and reports rejected rows instead of guessing. The backtest continues to exclude retirements, walkovers and other non-standard results. ATP and WTA are evaluated in separate Elo histories because player IDs and rating histories are not assumed to be globally interchangeable across tours; the JSON report exposes `reportsByTour.atp` and `reportsByTour.wta` when both tours are present. Rows with a blank or unsupported tour are rejected. When multiple seasonal files overlap, identical match rows are collapsed; if the same tour/tournament/match key has conflicting result, identity, score, surface or odds data, every version of that match is excluded and counted in `conflictingDuplicateMatches`/`conflictingDuplicateRows` rather than silently keeping the first row.

Download the season files from https://www.valuebetennis.com/en/donnees.htm, then run:

```sh
node scripts/valuebetennis-backtest.mjs data/valuebetennis-matchs-2021.csv data/valuebetennis-matchs-2022.csv data/valuebetennis-matchs-2023.csv data/valuebetennis-matchs-2024.csv data/valuebetennis-matchs-2025.csv data/valuebetennis-matchs-2026.csv --from 20250101 --to 20261231
```

The source publishes the files under CC BY 4.0; attribution is required: Valuebetennis, “Tennis results and odds since 2021”, https://www.valuebetennis.com/en/donnees.htm. The source includes Pinnacle opening and last recorded pre-match odds, but this adapter deliberately uses match results only for Elo prediction evaluation. The CSV does not provide archived pre-match probabilities or complete quote-capture provenance, so it cannot by itself support a strict EV/ROI backtest. Do not treat its odds columns as proof of a model's historical value edge.



Valuebetennis market benchmark note: the importer separately summarizes Pinnacle opening and last pre-match odds (two-sided coverage, average overround, favourite win rate, no-vig Brier/Log Loss), excluding retirements and walkovers. These descriptive baselines are not simulated betting ROI. Archived model probabilities and complete quote-capture provenance are absent, so this source alone cannot establish a strict EV/ROI backtest.


### Historical data source policy

Valuebetennis is the selected public historical source for this adapter because its published CSVs are CC BY 4.0, with attribution required. Tennis-Data.co.uk is not an approved automated model-training input for this project: its published notice restricts use to private individuals and explicitly excludes commercial products and automated bots/scrapers/AI data-training use. Do not scrape, import or train on those files without a separate written licence. A second bookmaker source must be selected only after its data-use terms explicitly permit the intended analysis and model validation.
