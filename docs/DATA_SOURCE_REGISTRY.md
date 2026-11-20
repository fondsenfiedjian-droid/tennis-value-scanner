# PFE data-source registry and refresh gates

Status: source research only. No new provider data is enabled in production or merged into the model by this document.

## Current historical baseline

The project uses a pinned June 2026 snapshot of the Sackmann archive for reproducible historical research. It contains ATP/WTA main-tour results, rankings, player data, lower-tier match files and Grand Slam point-by-point records. The archive is licensed CC BY-NC-SA 4.0; attribution, non-commercial use and share-alike obligations apply. Raw match-level files stay out of this public application repository.

The original `JeffSackmann/tennis_atp` and `tennis_wta` repositories are no longer reliable live endpoints: current public search reports both returned 404 from October 2026. The surviving Match Charting Project repository remains useful for selectively charted matches, but it is not a complete results feed.

## Candidate A — TennisMyLife live match database

Website: https://stats.tennismylife.org/tennis-match-database  
Download manifest shown by the site: https://stats.tennismylife.org/api/data-files

The current website advertises historical ATP/WTA match CSVs (1968–2026), live tournament updates, daily refresh, ATP Challenger and qualifying files, and WTA yearly files from 1990 onward. It includes match scores, tournament surface/level, player IDs, rankings and match-level serve statistics. The website explicitly says WTA files have not yet reached the same reliability standard as ATP.

Important distinction: the public GitHub repository `Tennismylife/TML-Database` is historical reference, not the current live feed. Its checked-in `2026.csv` contained only 137 ATP rows through 17 January 2026; do not treat that file as the website's current November 2026 dataset.

**Usage gate:** the website's published terms allow personal, educational and non-commercial research only. Raw CSV redistribution/resale is not authorized. Commercial use, including training/validating models for commercial services or monetizing model probabilities, requires prior express written permission. Third-party rights may also apply. Do not ingest into a public or monetized PFE service without written clearance.

**Proposed audit before any use:**
1. Obtain the current CSVs through the published download manifest; record retrieval time, file names, byte sizes and SHA-256 hashes.
2. Keep raw files ephemeral/private; never commit them to this public repository.
3. Compare 2025–2026 ATP and WTA against the pinned archive and independent result sources. Report exact duplicates, conflicting score rows, missing tournament dates, unknown surfaces, player-ID collisions and schema drift separately.
4. For Challenger, qualifying and WTA lower-tier files, measure coverage by season/tier and validate that the match population is not mixed into main-tour Elo without a tier-aware transition model.
5. Check every score with the project's completed-match validator. Do not treat missing stats as zero.
6. Require a rights review before any derived feature enters the deployed PFE.

## Candidate B — AcesAPI

Website/docs: https://acesapi.com/ and https://acesapi.com/docs

The provider advertises ATP/WTA results since 2007, set and tiebreak scores, tournament draws, player profiles, weekly rankings, head-to-head, surface splits and provider-computed Elo. Its public pricing page advertises 500 free credits per month without a card; calls consume credits, with a stated 60 requests/minute limit (reduced at low balance). Non-results data refreshes daily; the service does not advertise a live point-by-point feed. Odds coverage is limited to selected competitions and periods.

**Role:** possible independent cross-check or small recent-results supplement, not a bulk historical database replacement. No API key has been connected, no calls have been made and no paid plan is authorized. Before use, inspect its terms, field provenance, correction policy, player-ID mapping, credit costs and response pagination. A 500-credit monthly tier is not assumed sufficient for full backfill.


## Candidate C — Live Tennis API academic point-by-point dataset

Research page: https://livetennisapi.com/data/academic  
Public sample: https://doi.org/10.5281/zenodo.23718893

The current Zenodo version (1.0.3, published 28 October 2026) describes an index of 173,571 completed matches from 2023-01-01 to 2026-08-13 across ATP, WTA, Challenger and ITF, with point-by-point score sequences for 98.2%. It lists 32,678 players. The public sample contains all match-index rows, player metadata, and 951,064 live-observed score states for 5,380 completed matches in June 2026 (77% of that month's completed matches).

The provenance split matters:
- 22,031 matches / 3,184,514 score states were captured live with UTC timestamps; live observation began 12 October 2025 and reached full volume in February 2026.
- Earlier 2023–2025 sequences are reconstructed after the match and have no capture timestamps; they are not in the public sample and are granted only case by case.
- An observed tape may begin after the match starts or stop before the final point. Every match has coverage information; never assume a complete 0-0-to-finish record.
- The point rows are scoreboard states, not strokes. Serve speed, serve direction and shot-level data are absent.
- The dataset license is CC BY-NC 4.0. Full access is limited to non-commercial academic research/teaching by application from an institutional address; raw redistribution is prohibited and citation is required.

**PFE role:** strongest candidate for research on point-state transitions, serve/return point outcomes, score pressure and in-play state modelling across lower tiers. It is not a shot-level or serve-speed source. A pre-match player feature would need rolling history built strictly from matches completed before the target match, with minimum-history and coverage gates. Observed data is selective and may be truncated; reconstructed history must not be treated as live-observed or timestamped.

**Access status:** public sample identified, but no file was downloaded or imported in this pass. Full academic access not requested. Do not use the full dataset or redistribute raw data without an approved application and licence review.

## Source-selection rules

- Keep the pinned historical archive as the reproducible baseline.
- Never silently replace an established source with a provider-specific variant.
- Compare data at natural match identity (tour + event + date + round + unordered player pair), not just a legacy match number.
- Resolve player IDs using a reviewed crosswalk; do not merge on names alone when IDs disagree.
- Store source provenance and retrieval time for every imported row.
- Quarantine conflicting records; do not average or guess scores.
- New sources first produce aggregate audit reports. Production use requires quality checks, license clearance and chronological model validation.
- No API purchase, subscription or paid data pull without explicit user approval.

## Initial source assessment (20 November 2026)

| Source | Freshness | Main value | Main limitation | Current decision |
|---|---|---|---|---|
| Pinned Sackmann archive | Through 25 May 2026 for main tour | Long historical baseline, rankings, lower tiers, Slam PBP | Snapshot ends before late 2026; CC BY-NC-SA | Keep as reproducible research baseline |
| TennisMyLife website | Advertises daily/live updates through 2026 | Recent ATP/WTA, ATP Challenger/qualifying, match stats | Non-commercial terms; raw redistribution barred; WTA quality caveat | Audit candidate only; rights gate |
| AcesAPI | Daily refresh; results since 2007 | Independent result/ranking/H2H cross-check | Credit-limited API; no point-by-point feed; key required | Optional supplement only; no connection or spend |
| Live Tennis API academic dataset | Match index to 13 Aug 2026; observed point states from Oct 2025 | 173,571 matches, all tiers, 3.18M live-observed score states | CC BY-NC; institutional application for full data; tapes may be partial; no shot/serve-speed data | Public sample identified; no download/import; full access application not made |
| Match Charting Project | Pinned 18 Sep 2026 | Shot-level style and tactical aggregates | Selective charted sample; CC BY-NC-SA; metadata anomalies | Research only; no production feature activation |
