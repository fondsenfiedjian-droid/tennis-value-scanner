# Existing research assets — baseline inventory

Inspection date: 2026-11-22. This is a read-only inventory of the `main` branch. No files on `main` were changed.

## Confirmed reusable assets

| Area | Existing asset | What it already does | Research Lab treatment |
|---|---|---|---|
| PFE baseline | `scripts/backtest.mjs` | Chronological Elo backtest; surface, form, H2H and combined candidates; calibration and market comparisons | Treat as baseline reference; do not silently change its defaults |
| Valuebetennis adapter | `scripts/valuebetennis-backtest.mjs` | Imports the seasonal Valuebetennis CSV format, validates rows, evaluates Elo candidates and Pinnacle market benchmarks | Reuse only through a research adapter with explicit dataset/version provenance |
| SMA data audit | `scripts/sackmann-data-audit.mjs` | Measures coverage and validity of serve/return, aces, double faults, break points, rankings, age, handedness, surface and duration | Existing coverage audit; aggregate report only |
| SMA model experiment | `scripts/sackmann-serve-return-research.mjs` | Builds strictly prior-match serve/return features; tests overall, surface, residualized and shrunk variants; chronological holdout | Strongest existing SMA research foundation |
| Existing research workflows | `.github/workflows/sackmann-data-audit.yml`, `.github/workflows/sackmann-serve-return-research.yml` | Manually triggered GitHub Actions research; aggregate outputs retained as artifacts | Do not run automatically or expand paid data access; keep research-only |
| Workload research | Root README references prior 72h/7d match counts and playing days | Preliminary workload counts with limited archive coverage; no probability adjustment | Candidate ACE inputs only; not yet equivalent to the stricter 3/7/14 calendar-day ACE protocol |

## SMA test review

The existing `tests/sackmann-serve-return-research.test.mjs` was read from `main`. It contains 12 test cases covering:
- prior-match-only feature construction and stable player orientation;
- same-day exclusion;
- minimum same-surface history;
- incomplete and impossible serve-stat rejection;
- zero second-serve opportunities;
- source-stat quality reporting;
- history-window boundaries and invalid settings;
- fixed 2025–2026 holdout with coefficients frozen through 2024;
- invariance of training coefficients when holdout outcomes are changed;
- surface-relative residuals and shrinkage.

These tests establish useful engineering safeguards in the existing SMA implementation. They do not establish that SMA improves prediction quality; that requires the actual walk-forward report.

## SMA workflow outputs and retention

The workflow definition `.github/workflows/sackmann-serve-return-research.yml`:
- downloads ATP and WTA match archives for 1991–2026;
- runs 730-day windows with minimum 5 overall and 5 surface prior matches;
- evaluates surface shrinkage strengths 3, 5 and 10;
- freezes the holdout from 2025 onward;
- uploads three JSON reports under artifact name `sackmann-serve-return-walkforward`;
- retains that artifact for 30 days;
- is configured for `workflow_dispatch` and pull requests affecting the relevant files.

The data-audit workflow separately publishes artifacts named:
- `sackmann-rank-age-walkforward`;
- `sackmann-rank-age-robustness`;
- `sackmann-prematch-ranking-research`;
- `sackmann-data-coverage-audit`.

The latest completed SMA run was retrieved and its report artifact was inspected through a read-only artifact-summary workflow:
- run ID: `44918617777`, source commit `4e3a719244e6b54988a5a725a4d6fcc47a476f6b`;
- fixed holdout: train 2016–2024, evaluate 2025–2026 (2026 partial through May 25);
- leading 730-day candidate: overall serve/return plus surface-relative residual serve/return features;
- fixed-holdout Brier improved by 0.001360 ATP and 0.001198 WTA; paired 95% intervals remained below zero for both tours;
- fixed-holdout LogLoss improved by 0.003942 ATP and 0.003405 WTA; paired 95% intervals remained below zero;
- expanding annual walk-forward results showed the same direction for both tours and both metrics.
See `SMA-RESULTS-AUDIT.md` for exact baseline/adjusted values, sample sizes, confidence intervals, window ablations and restrictions. These results are against offline K=32 Elo, not live Worker PFE, and do not establish ROI.

## Important constraints discovered

1. The existing backtest already contains exploratory candidates for surface, form, H2H and combined signals. These are not equivalent to four independent SAS; they are feature candidates inside the PFE research baseline.
2. The serve/return research is already a substantial SMA experiment, including a frozen later-period holdout and shrinkage variants. Avoid rebuilding it from scratch before inspecting its latest report artifacts.
3. Sackmann datasets and derived reports are documented as CC BY-NC-SA 4.0. The README explicitly warns that this is non-commercial material. It must not be used for commercial activity without separate permission.
4. Workload inputs from the local prediction archive are selection-biased and incomplete. They are not a complete tour schedule and must not be treated as hours of recovery.
5. No confirmed evidence was found in the inspected README that a verified, timestamped HFA motivation/psychology dataset is available. HFA must therefore begin with a source-availability audit; speculative narrative signals are not a substitute for data.
6. The existing repository describes current live prediction as general Elo. The Research Lab must not wire experimental features into the Worker or PWA.

## Immediate gap list

- ACE: audit whether the historical match corpus supports reliable calendar workload features. Match dates alone do not establish actual finish times or hours of recovery. Injury/medical signals need a lawful, timestamped source and explicit missingness rules.
- SMA: report artifact retrieved; the 730-day surface-residual candidate shows incremental probability-quality value on ATP and WTA holdout and annual walk-forward samples. Remaining gates: identical-sample comparison against live PFE, deeper surface/tournament strata, calibration and source-coverage audits.
- HFA: identify admissible, timestamped, pre-match evidence sources. If coverage cannot be established, keep HFA in abstention mode rather than manufacturing scores.
- PFE: define the exact frozen baseline version and data cutoff used for every paired comparison.
- Aggregator: only after the three input audits, implement a research-only aggregator that accepts standardized system outputs and supports abstention.

## Scope of this inventory

The inspection fetched the README, two backtest scripts, the serve/return research script, both workflow definitions and the SMA test file from `main`. It retrieved the existing SMA artifact via GitHub Actions and summarized its JSON reports without rerunning the model. It did not change the production branch. Treat this as a focused inventory, not a complete code audit.
