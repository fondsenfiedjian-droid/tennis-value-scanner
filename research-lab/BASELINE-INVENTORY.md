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
| Workload research | Documented in root README as experimental human-factor workload analysis | Prior 72h/7d match counts, playing days, limited archive coverage; no probability adjustment | Candidate ACE inputs only; current archive is explicitly incomplete |

## Important constraints discovered

1. The existing backtest already contains exploratory candidates for surface, form, H2H and combined signals. These are not equivalent to four independent SAS; they are feature candidates inside the PFE research baseline.
2. The serve/return research is already a substantial SMA experiment, including a frozen 2025 holdout and shrinkage variants. Avoid rebuilding it from scratch before inspecting its tests and latest report artifacts.
3. Sackmann datasets and derived reports are documented as CC BY-NC-SA 4.0. The README explicitly warns that this is non-commercial material. It must not be used for commercial activity without separate permission.
4. Workload inputs from the local prediction archive are selection-biased and incomplete. The README correctly prohibits treating them as a complete tour schedule or adjusting probabilities without validation.
5. No confirmed evidence was found in the inspected README that a verified, timestamped HFA motivation/psychology dataset is available. HFA must therefore begin with a source-availability audit; speculative narrative signals are not a substitute for data.
6. The existing repository describes current live prediction as general Elo. The Research Lab must not wire experimental features into the Worker or PWA.

## Immediate gap list

- ACE: audit whether the historical match corpus supports reliable rest/workload features. Match dates alone do not establish actual finish times or hours of recovery. Injury/medical signals need a lawful, timestamped source and explicit missingness rules.
- SMA: audit and reuse the existing serve/return experiment; determine coverage by tour, year, surface and tournament level before fitting any new aggregator coefficient.
- HFA: identify admissible, timestamped, pre-match evidence sources. If coverage cannot be established, keep HFA in abstention mode rather than manufacturing scores.
- PFE: define the exact frozen baseline version and data cutoff used for every paired comparison.
- Aggregator: only after the three input audits, implement a research-only aggregator that accepts standardized system outputs and supports abstention.

## Scope of this inventory

The inspection fetched the README, the two backtest scripts, the serve/return research script, and two workflow definitions from `main`. It did not execute workflows, download datasets, inspect every test or every repository file, or change the production branch. Treat this as a focused inventory, not a complete code audit.
