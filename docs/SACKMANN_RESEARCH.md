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
