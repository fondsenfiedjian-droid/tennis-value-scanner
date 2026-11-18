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

Optional `oddsA` and `oddsB` must be greater than 1 and no greater than 1000. Ratings must be greater than 0 and no greater than 5000. POST bodies are limited to 16 KB.

## Caching

- Match queries: Cloudflare cache for 15 minutes.
- Winamax odds: Cloudflare cache for 5 minutes.
- Player profiles: Cloudflare cache for 7 days.
- Frontend match cache: 15 minutes.
- Frontend odds cache: 10 minutes; odds records older than 90 minutes are rejected by the matcher.

These are quota and resilience safeguards, not guarantees that a bookmaker price is still available at the moment a bet is placed.

## Prediction archive\n\nThe frontend stores local snapshots of each priced player outcome (odds, Elo probability, estimated EV, match, and capture time) on the current device. Repeated identical snapshots within ten minutes are suppressed; the archive keeps at most 600 entries and can be exported as CSV. The archive is device-local and is not synchronized across devices. Its EV summaries are estimates, not verified win/loss or profit statistics.\n\n## Model limitations

The current model uses general player Elo ratings. It does **not** yet adjust for court surface, injuries, recent form, fatigue, head-to-head context, or tournament conditions. The first three eligible matches are checked for predictions in the current frontend. Positive EV is a model estimate, not a guarantee of profit.

Unsupported markets (totals, handicaps, and set betting) are not connected; only match-winner odds are processed.

## Automated checks

The GitHub Actions workflow runs on every push to `main` and on pull requests. It uses Node.js 22 and the built-in test runner; no third-party test packages are required.

Run the same checks locally:

```sh
node --test tests/worker.test.mjs
```

The suite covers Elo extraction and probability calculations, Worker request validation, CORS headers, frontend JavaScript syntax, and the prediction archive wiring. Validation-route tests use mocked runtime dependencies and do not consume Live Tennis API or Apify quota.

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

The archive can check up to 10 older archived matches per run using the FREE single-match detail endpoint `GET /matches/{matchId}`. The app waits at least three hours after scheduled start and rate-limits repeat checks per match to 30 minutes. Only API results with `outcome: "completed"` and a valid `winner` are counted in model hit-rate statistics. Retirements, walkovers, defaults, abandoned and unresolved matches are recorded separately and excluded from accuracy. Result revisions are tracked with `result_version`, so a newer official correction replaces an older stored result. Matches without a stored Live Tennis API match ID cannot be reconciled automatically.

The API's completed-match LIST endpoint is a paid History feature; this implementation deliberately uses individual match lookups for IDs already held in the local archive instead of polling the paid history listing.
