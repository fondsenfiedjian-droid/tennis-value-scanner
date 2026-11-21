# Sackmann historical data import (research only)

This importer reads the yearly main-tour singles files from Jeff Sackmann's ATP or WTA archive and creates a compact normalized CSV for chronological research. It does not download or store source datasets in this repository.

## Source layout

Use separate source folders:
- ATP: `atp/atp_matches_YYYY.csv`
- WTA: `wta/wta_matches_YYYY.csv`

The archive's ATP/WTA player and ranking files are retained as source material for later feature work. The yearly match rows already include winner/loser rank, ranking points and age fields. Treat these as historical snapshots associated with the tournament date, not as current rankings.

## Run

```sh
node scripts/sackmann-import.mjs --tour atp --input-dir /path/to/archive/atp --output /path/out/atp-sackmann-normalized.csv
node scripts/sackmann-import.mjs --tour wta --input-dir /path/to/archive/wta --output /path/out/wta-sackmann-normalized.csv
```

The output retains tourney date, player IDs, result, surface, tour/tournament metadata, rank, ranking points and age. It excludes invalid dates/IDs and retired, walkover or otherwise incomplete outcomes. Unknown surfaces are retained with a blank surface and counted in diagnostics.

The output is compatible with the existing chronological Elo backtest's core columns. ATP and WTA must be backtested separately. The import is a data-preparation step only; it does not change production predictions or EV.

## Licensing and provenance

The source is Jeff Sackmann's tennis datasets:
- https://github.com/JeffSackmann/tennis_atp
- https://github.com/JeffSackmann/tennis_wta
- Archive mirror: https://github.com/Aneeshers/tennis-sackmann-archive

The archive states CC BY-NC-SA 4.0. Attribute Jeff Sackmann, preserve the same license for redistribution, and do not use commercially without separate permission. Do not commit raw or generated Sackmann data to this public application repository. This tool is for non-commercial research pending legal clearance for any broader use.


## Live Tennis API to Sackmann player ID linkage (2026-11-21)

The Live Tennis API profile field `archive_player_id` was checked against the `player_id` column in the Sackmann `wta_players.csv` archive. In the production odds-matching diagnostic sample dated 2026-11-21, all 11 non-empty WTA archive IDs were found in the Sackmann player file and their names, IOC country codes, and dates of birth matched. Examples include Viktorija Golubic (203530), Jil Teichmann (213525), Tamara Zidansek (214461), Clara Burel (216262), Diane Parry (220348), and Storm Hunter (204411). Three other profiles in the same diagnostic sample had no `archive_player_id`; they remain unmatched and must not be joined by abbreviated names alone.

This supports a direct ID join for profiles with a populated `archive_player_id`; it does not prove that every ATP/WTA/ITF player is covered. The reusable audit utility `scripts/sackmann-player-id-audit.mjs` checks exact IDs, normalized full names, and any supplied country/date-of-birth fields. Conflicting metadata is classified for manual review, and missing IDs remain unmatched. Run it with a JSON array of profile identity objects and the relevant Sackmann player CSV:

```sh
node scripts/sackmann-player-id-audit.mjs --tour wta --profiles profiles.json --players wta_players.csv --out wta-player-id-audit.json
```

The current production diagnostic also shows why historical Elo can help: some Live Tennis profiles have no `stats.ratings` block at all, while others expose `elo_rank` (a rank position, not an Elo rating value). The verified archive ID makes historical result linkage feasible for those players, but historical Elo must be reconstructed chronologically from completed matches, with no future-result leakage. This remains research-only; no production prediction logic is changed by this audit.


## Annual walk-forward rank and age research

After importing normalized ATP or WTA CSVs, run the research model separately for each tour:

```sh
node scripts/sackmann-rank-age-research.mjs --tour atp --from 20000101 --to 20260525 --k 32 --min-training 1000 --max-training 20000 --out atp-rank-age-report.json atp-sackmann-normalized.csv
node scripts/sackmann-rank-age-research.mjs --tour wta --from 20000101 --to 20260525 --k 32 --min-training 1000 --max-training 20000 --out wta-rank-age-report.json wta-sackmann-normalized.csv
```

The script compares three candidates:
- Elo + ranking: Elo difference plus the log ratio of the opponents' tournament-date ranks.
- Elo + age: Elo difference plus age difference and average age.
- Elo + ranking + age: all of the above.

For each candidate, an Elo-only logistic baseline is fitted on exactly the same eligible training matches. Candidate and baseline are then evaluated on the same eligible matches in the next calendar year. Coefficients are frozen for the entire evaluation year and are fitted only on earlier calendar years. All matches on the same date use the same pre-date Elo state; same-day results do not enter other same-day predictions.

Training samples are deterministically capped at 20,000 rows per annual fit to control runtime; evaluation uses every eligible match. The JSON report contains aggregate metrics only, not player-level predictions. Negative candidate-minus-baseline Brier or LogLoss deltas indicate improvement; positive deltas indicate deterioration. Missing ranks/ages are not imputed: each comparison uses its own eligible subset, and the combined model uses only matches with both signals.

This is an exploratory diagnostic, not a production model. Ranking values are tournament-date snapshots and are not guaranteed to be exact match-start snapshots. Do not activate rank or age in production without checking snapshot timing and confirming repeatable out-of-sample improvement across independent periods. All Sackmann-derived research remains non-commercial under CC BY-NC-SA 4.0.


## Rank/age robustness checks

The full-archive workflow also runs the same annual expanding walk-forward comparison at Elo K=24, 48 and 64 (with a 20,000-row annual training cap), plus K=32 with a 5,000-row cap. These checks test whether the initial rank/age signal depends on one Elo update speed or one training sample size. Compare each candidate with its same-subset Elo-only baseline; do not compare raw scores across different K values as if they used identical predictions. Reports are aggregate-only artifacts. This remains research-only and does not alter production predictions.


## Robustness results (2026-11-20)

The full 1968–2026 archive workflow completed the sensitivity matrix for ATP and WTA, evaluating 2000-01-01 through 2026-05-25 (27 calendar-year cohorts). Each comparison is against an Elo-only logistic baseline on the candidate's exact same eligible matches.

Aggregate Brier / log-loss deltas (candidate minus baseline; negative is better):

| Tour / setting | Rank | Age | Rank + age |
|---|---:|---:|---:|
| ATP K=24, cap 20k | -0.001737 / -0.003745 | -0.000570 / -0.001270 | -0.002104 / -0.004553 |
| ATP K=48, cap 20k | -0.002226 / -0.005017 | -0.000332 / -0.000693 | -0.002449 / -0.005467 |
| ATP K=64, cap 20k | -0.003074 / -0.007022 | -0.000271 / -0.000553 | -0.003253 / -0.007369 |
| ATP K=32, cap 5k | -0.001652 / -0.003622 | -0.000420 / -0.000883 | -0.001847 / -0.004027 |
| WTA K=24, cap 20k | -0.001667 / -0.003382 | -0.001759 / -0.004250 | -0.002733 / -0.005997 |
| WTA K=48, cap 20k | -0.001507 / -0.003280 | -0.001188 / -0.002899 | -0.002249 / -0.005118 |
| WTA K=64, cap 20k | -0.002003 / -0.004485 | -0.001043 / -0.002554 | -0.002666 / -0.006131 |
| WTA K=32, cap 5k | -0.001287 / -0.002665 | -0.001340 / -0.003281 | -0.002164 / -0.004779 |

Interpretation:
- Rank + age improves aggregate Brier and log loss in all eight sensitivity runs.
- Rank alone improves both aggregate metrics in all runs.
- Age alone improves both aggregate metrics in all runs, but its ATP contribution is smaller and it has several year-level regressions.
- Rank + age is the strongest aggregate variant in each run.
- The 5,000-row cap retains the improvement, so the signal is not dependent on the 20,000-row sample cap.
- ATP rank+age improved both Brier and log loss in all 27 evaluated annual cohorts in these runs. WTA rank+age was not uniformly better: small regressions remain in a few annual cohorts, notably 2017 at K=24/48/64; the aggregate still improves.

This supports further research, not production activation. The rank values are tournament-date snapshots, not guaranteed match-start snapshots; a separate timing/availability audit and a genuinely independent recent holdout are still required. The 2026 cohort is partial through May 25. These are historical model comparisons, not betting-profit estimates.


## Strict pre-match weekly ranking study

The workflow downloads the archive's separate weekly ranking files (ATP 1970s–current; WTA 1980s–current). For each historical match, the research join selects the latest ranking snapshot with `ranking_date < tourney_date`. A ranking published on the tournament date is deliberately excluded because the match start time and publication availability are not established. Missing snapshots remain missing; no future or same-day ranking is substituted.

Run after the match importer:

```sh
node scripts/sackmann-prematch-rank-research.mjs --tour atp --rankings-dir /path/to/atp-rankings --from 20000101 --to 20260525 --k 32 --min-training 1000 --max-training 20000 --out atp-prematch-rank-report.json atp-normalized.csv
```

The report includes the coverage of both players, the number of matches where same-day snapshots were excluded, and average/maximum snapshot age. Its walk-forward rank and rank+age metrics are directly comparable in method to the tournament-date snapshot study, but the eligible match subset may differ. This is a conservative availability test, not proof of exact publication timestamps. No production use is permitted until the results and independent holdout are reviewed.


### Ranking freshness rule

The pre-match study applies a 45-day maximum age to the latest prior weekly snapshot. If a player's last published ranking is older than 45 days, that ranking is treated as unavailable rather than carried forward. The report records stale snapshot counts, match counts affected by stale snapshots, and the age of retained snapshots. This guards against long gaps and returning players inheriting obsolete ranks.


## Strict pre-match weekly ranking results (45-day freshness cap, 2026-11-20)

The completed workflow used only the latest weekly ranking dated strictly before each tournament date and discarded snapshots older than 45 days. Same-day ranking snapshots were excluded. Evaluation was annual walk-forward from 2000-01-01 through 2026-05-25, with a 20,000-row training cap and K=32. Negative candidate-minus-baseline deltas are better.

| Tour | Feature | Matches | Brier delta | LogLoss delta | Accuracy delta |
|---|---|---:|---:|---:|---:|
| ATP | Rank | 74,544 | -0.001634 | -0.003584 | +0.55 pp |
| ATP | Age | 76,324 | -0.000454 | -0.000986 | +0.27 pp |
| ATP | Rank + age | 74,540 | -0.001971 | -0.004326 | +0.61 pp |
| WTA | Rank | 66,886 | -0.001237 | -0.002498 | +0.60 pp |
| WTA | Age | 70,265 | -0.001482 | -0.003593 | +0.25 pp |
| WTA | Rank + age | 66,882 | -0.002224 | -0.004950 | +0.76 pp |

Coverage over the complete imported archive after the 45-day rule:
- ATP: both players ranked in 148,448 / 192,654 matches (77.05%); average retained snapshot age 7.8 days; 26,602 stale player snapshots discarded.
- WTA: both players ranked in 102,805 / 157,508 matches (65.27%); average retained snapshot age 6.6 days; 4,056 stale player snapshots discarded.
- Same-day ranking records were excluded in 124,053 ATP and 91,536 WTA matches where at least one player had a same-day snapshot.
- ATP rank+age improved both Brier and LogLoss in all 27 evaluation-year cohorts. WTA retains small year-level regressions: 2017 worsened on both metrics; 2022 Brier improved slightly but LogLoss worsened slightly. The aggregate WTA result remains positive.

Interpretation: the rank and age signal survives a conservative pre-tournament ranking availability rule and a 45-day freshness ceiling. This is stronger evidence than using tournament-date rank fields, but not yet sufficient for production activation. The WTA year-level exceptions, snapshot publication timing, and an independent recent holdout still require review. These are prediction-quality metrics, not betting-profit evidence.



## Historical inactivity / return-from-break research

A separate research-only walk-forward study tests whether the time since each player's previous completed match adds predictive information beyond overall Elo. It does **not** infer that an absence was caused by injury. The archive records match dates, not reliable medical reasons for absence.

Run ATP and WTA separately after creating the normalized match CSV:

```sh
node scripts/sackmann-layoff-research.mjs --tour atp --from 20000101 --to 20260525 --k 32 --min-training 1000 --max-training 20000 --out atp-layoff-report.json atp-normalized.csv
node scripts/sackmann-layoff-research.mjs --tour wta --from 20000101 --to 20260525 --k 32 --min-training 1000 --max-training 20000 --out wta-layoff-report.json wta-normalized.csv
```

The baseline uses pre-date overall Elo. The candidate adds relative log inactivity, maximum inactivity, separate 90-day and 180-day indicators for each player, and a count of players with no prior match in the archive. These thresholds are exploratory bins, not medical classifications or automatic Elo adjustments. A missing prior match is explicitly marked as unknown rather than treated as a confirmed long injury layoff.

Timing safeguards:
- Only completed matches strictly earlier than the prediction date establish prior activity.
- Every match on the same calendar date uses the same pre-date Elo and last-played state.
- Elo and last-played dates are updated only after all matches on that date have been evaluated.
- Each annual model is fitted only on earlier calendar years and frozen during its evaluation year.
- The report compares baseline and candidate on the same evaluated match set and includes yearly metrics.

A negative candidate-minus-baseline Brier or LogLoss delta indicates improvement. Aggregate improvement alone is insufficient: inspect annual regressions and repeat the comparison across K factors and an independent recent holdout. This feature is not enabled in production. Do not describe a long gap as an injury unless a separate trustworthy source confirms the reason. All source-derived research remains subject to the non-commercial CC BY-NC-SA 4.0 restriction described above.
