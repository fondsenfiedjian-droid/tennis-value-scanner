# TVS Research Lab v1.0

Status: isolated research specification. This directory is not imported by the production PWA or Cloudflare Worker.

## Isolation contract

- Research work lives on branch `research/tvs-research-lab-v1`.
- No production files, Worker routes, frontend assets, secrets, scheduled jobs, or deployment settings are changed by this specification.
- No experiment may write to production storage or change live prediction probabilities.
- Promotion requires a separately reviewed change and explicit approval.
- Historical and live predictions must be immutable once recorded.
- Every prediction must have a timestamp and a model version / source revision.
- Features must be available strictly before the target match start. Same-day outcomes are unavailable unless reliable intraday timestamps prove they preceded prediction time.
- Missing evidence is `NULL`/NA, never a fabricated neutral or negative value.
- Retirements, walkovers, defaults and abandoned matches are tracked separately from standard completed-match scoring.

## Research systems

| ID | System | Responsibility | Initial output |
|---|---|---|---|
| PFE | Player Fundamental Evaluation | Baseline player strength and probability | calibrated pre-match probability |
| ACE | Adaptive Condition Evaluation | Workload, recovery, match density, verified injury/retirement signals | directional correction signal |
| SMA | Serve & Matchup Analysis | Serve, return, aces, double faults, break-point and style matchup features | directional correction signal |
| HFA | Human Factor Analysis | Evidence-backed motivation, pressure, concentration and experience signals | directional correction signal |
| AGG | Aggregator | Reliability-aware combination of SAS outputs | final experimental probability or abstention |
| MVE | Market & Value Engine | Compare experimental probability with bookmaker prices | fair odds, no-vig comparison, EV diagnostics |

Protected Ranking Analysis is an internal PFE module. Injury Analysis belongs to ACE; Motivation Analysis belongs to HFA. Reliability and provenance are shared controls, not standalone SAS.

## Normalized ledger

Use a relational / long-form design. Do not add a new fixed set of columns every time a SAS is introduced.

### 1. matches

One canonical row per match:
- `match_id` (primary key; provider ID where stable, otherwise deterministic internal ID)
- `tour`, `category`, `tournament_id`, `tournament_name`
- `scheduled_start_utc`, `match_date_utc`, `surface`
- `player_a_id`, `player_b_id`, `player_a_name`, `player_b_name`
- `match_status`, `winner_id`, `score`, `result_source`, `result_verified_at`

### 2. model_versions

One row per immutable model / SAS version:
- `model_version_id` (primary key)
- `system_id` (PFE, ACE, SMA, HFA, AGG, MVE)
- `version_label`, `git_commit_sha`, `config_json`
- `created_at`, `training_cutoff`, `notes`

### 3. system_outputs

One row per match × system × model version:
- `output_id` (primary key)
- `match_id`, `system_id`, `model_version_id`
- `prediction_created_at`, `data_cutoff_at`
- `probability_a`, `probability_b` (PFE / AGG only where applicable)
- `signal_a`, `signal_b` (directional signal in [-1, +1], optional)
- `reliability` and `coverage` in [0, 1]
- `uncertainty`, `status` (available / insufficient_data / abstain / error)
- `evidence_json`, `source_ids_json`, `missing_fields_json`

For directional signals, positive means support for player A and negative means support for player B. Store the raw feature/evidence separately from any normalized signal where feasible. A correction SAS must not invent a win probability if its natural output is a directional signal.

### 4. aggregator_runs

One row per match × aggregator version × tested combination:
- `run_id` (primary key), `match_id`, `aggregator_version_id`
- `combination_id` (e.g. PFE, PFE_ACE, PFE_SMA, PFE_HFA, PFE_ACE_SMA, PFE_ALL)
- `probability_a`, `probability_b`, `logit_score`
- `weights_json`, `reliability_json`, `contribution_pp_json`
- `systems_used_json`, `systems_missing_json`
- `uncertainty`, `abstained`, `created_at`

### 5. market_quotes

One row per captured quote / bookmaker / side; retain snapshots rather than overwriting:
- `quote_id` (primary key), `match_id`, `bookmaker`, `selection_player_id`
- `decimal_odds`, `captured_at`, `source_timestamp`, `source_id`
- `market_type`, `is_pre_match`

Derive implied probability, overround, no-vig probability, fair odds and EV in reports. Keep original odds and timestamps immutable.

### 6. evaluation_runs

One row per reproducible evaluation:
- `evaluation_id`, `created_at`, `evaluation_window_start`, `evaluation_window_end`
- `training_cutoff`, `dataset_version`, `protocol_version`
- `sample_definition_json`, `metrics_json`, `limitations`

Performance summaries are derived from frozen match-level records, not used as a replacement for them.

## Standard output contract for every SAS

Every system returns:
- `match_id`, `system_id`, `model_version_id`
- `status`: available / insufficient_data / abstain / error
- `prediction_created_at`, `data_cutoff_at`
- `signal` (optional; normalized [-1,+1])
- `probability_a` / `probability_b` (optional; only when the system genuinely estimates probabilities)
- `reliability` [0,1], `coverage` [0,1], `uncertainty`
- `evidence[]`: feature, value, source, source timestamp, availability timestamp
- `missing_fields[]`, `reason`

A system with inadequate evidence must return insufficient_data or abstain. Reliability is not the same as probability or confidence in the match winner.

## Aggregator research formula

PFE is the baseline. The correction systems contribute only when their data is available and reliable:

`z = logit(PFE) + b_ACE*r_ACE*s_ACE + b_SMA*r_SMA*s_SMA + b_HFA*r_HFA*s_HFA`

`P(A) = sigmoid(z)`

This is a research hypothesis, not an approved production formula. Coefficients are to be learned on training periods only and evaluated on later held-out periods. Account for feature overlap and correlation to avoid double counting. Do not use example coefficients as trained values. The Aggregator may abstain when PFE is missing, inputs conflict materially, or uncertainty is excessive.

## Required experiment matrix

Evaluate on exactly the same eligible match sample for every compared candidate:
1. PFE
2. PFE + ACE
3. PFE + SMA
4. PFE + HFA
5. PFE + ACE + SMA
6. PFE + ACE + HFA
7. PFE + SMA + HFA
8. PFE + ACE + SMA + HFA

For each comparison report ATP/WTA separately, then surface and category strata where sample sizes permit. Measure incremental contribution conditional on the systems already present, not only standalone performance.

## Metrics and decision gates

Probability quality:
- Brier score and LogLoss (lower is better)
- calibration / reliability bins with counts
- accuracy (secondary; not a probability-quality metric)
- paired per-match loss differences and uncertainty intervals

Coverage and robustness:
- number of eligible matches and percentage covered
- abstention rate and missing-data rate by SAS
- performance by tour, surface, category and time period
- stability across multiple chronological holdouts

Market/value diagnostics:
- compare against two-sided no-vig market probabilities on identical matches
- fair odds and EV are estimates, not evidence of profit
- ROI only from timestamped, genuinely pre-match odds and frozen pre-match probabilities, with settlement rules and execution assumptions stated
- report sample size, drawdown and uncertainty; never infer expected monthly income from hit rate alone

A SAS is not promoted because it improves accuracy alone or wins on one small segment. It must show repeatable held-out incremental benefit without unacceptable coverage loss or calibration damage.

## First implementation sequence

1. Keep this branch separate from `main`.
2. Inspect existing research scripts and data provenance before writing adapters.
3. Implement a versioned schema and validation tests in this directory only.
4. Audit historical data availability for ACE, SMA and HFA.
5. Build an offline ledger importer / evaluator; do not connect to live prediction paths.
6. Run chronological walk-forward experiments and publish reproducible reports.
7. Review results before any integration proposal.

## Explicit non-goals

- No automatic bets or money movement.
- No paid data runs or plan upgrades without approval.
- No changes to the production PFE model or live EV calculation.
- No claims of model profitability based on accuracy or Brier score.

## Current research documents

- `BASELINE-INVENTORY.md`: existing repository research assets and gaps.
- `PFE-CONTROLS.md`: separates the live Worker baseline from offline historical Elo experiments.
- `DATA-FEASIBILITY.md`: source availability and constraints for ACE, SMA and HFA.
- `schema.sql`: normalized SQLite ledger schema.
- `contracts/system-output.schema.json`: standard SAS output contract.

## Current research readiness

- PFE: live and offline controls must be reported separately.
- SMA: an existing walk-forward experiment and tests are present; inspect the latest report artifact before rebuilding.
- ACE: only limited calendar-based workload candidates are currently defensible; true recovery hours and verified injury data are not established.
- HFA: no validated timestamped evidence corpus is established; default to insufficient data / abstention.
- Aggregator: design is specified, but implementation is gated on source audits and a frozen PFE control.

The schema and contract are specifications at this stage. They have not yet been executed against SQLite or run through a JSON Schema validator in this branch.
