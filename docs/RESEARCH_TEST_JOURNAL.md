# Research test journal

The canonical machine-readable register is `research/test-journal.json`. Every model experiment, data-quality audit, and planned experiment must be recorded there before it is treated as part of the research programme.

## Required fields

Each row records a stable test ID, date, status, tour/population, hypothesis, baseline and candidate, K-factor, training window, evaluation period, source coverage, selection rules, sample size, Brier score, LogLoss, ROI (or an explicit null when not calculated), and limitations/notes.

## Rules

- One row per independently reproducible parameter set. Do not combine ATP and WTA or different training windows into one result row.
- Record exact baseline and candidate configuration. A metric pair is only comparable when the evaluated sample is identical.
- Chronological evaluation only. Features must be available before the match; no future information may enter training features.
- Report sample N beside every metric. Brier and LogLoss are lower-is-better. Accuracy is supplementary and must not replace probability-quality metrics.
- ROI must remain null unless the experiment includes time-stamped bookmaker odds, a documented selection/staking rule, settled outcomes, void handling and realistic costs.
- Mark work as `running`, `planned`, `completed` or `failed`. Never present an unfinished run as a result.
- Research results never update Production automatically. A separate review and explicit approval are required.
- The app reads this JSON file and renders it in Statistics → Журнал исследований модели. Keep the JSON schema backwards compatible; update the table renderer and regression tests when adding fields.

## Current scope

The current Live Tennis API PRO archive run covers 55 annual packages (1968–2022), 1,485,717 source rows and a 2013–2022 chronological evaluation. The initial ranking/age experiment compares Elo-only with Elo + pre-match rank + age. A separate K=32 vs K=80 comparison uses the same features and paired samples. Serve/return features are planned separately; raw presence of a stats object is not proof of complete or pre-match-safe coverage.
