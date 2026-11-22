# Common-sample paired evaluator v0.1

This evaluator compares PFE and one or more SAS outputs only on the exact same match IDs for each candidate. It is research-only and does not generate predictions or connect to Aggregator/Production.

## Input

JSON array, one record per canonical match:

```json
{
  "match_id": "provider-or-canonical-id",
  "tour": "ATP",
  "surface": "Hard",
  "player_a_id": "player-1",
  "player_b_id": "player-2",
  "winner_id": "player-1",
  "match_start_at": "2026-06-01T12:00:00Z",
  "systems": {
    "PFE": {
      "status": "available",
      "probability_a": 0.61,
      "probability_b": 0.39,
      "prediction_created_at": "2026-06-01T10:00:00Z",
      "data_cutoff_at": "2026-06-01T09:59:00Z"
    },
    "SMA": {
      "status": "available",
      "probability_a": 0.64,
      "probability_b": 0.36,
      "prediction_created_at": "2026-06-01T10:00:00Z",
      "data_cutoff_at": "2026-06-01T09:58:00Z"
    },
    "ACE": { "status": "insufficient_data" },
    "HFA": { "status": "abstain" }
  }
}
```

All available probabilities must be two-sided, finite, strictly between zero and one, and sum to one. Every available prediction must have a creation timestamp strictly before match start and a data cutoff no later than prediction creation.

## Evaluation rules

- PFE is the frozen control; each candidate is scored only where both PFE and that candidate are available.
- Candidate-specific intersection samples are reported explicitly; never compare raw metrics from different samples.
- Match orientation is canonical: probability_a refers to player_a_id.
- Exact duplicate match records collapse; conflicting duplicate IDs fail closed.
- Brier, LogLoss, accuracy and ten-bin calibration summaries are reported.
- Paired candidate-minus-PFE loss differences and normal-approximation 95% intervals are descriptive. For publication-grade inference, add a block/bootstrap or clustered interval by tournament/player.
- Reports include overall, tour, surface and tour×surface strata plus a deterministic SHA-256 hash of the sorted canonical match IDs.

## Run

```sh
node research-lab/evaluation/paired-evaluator.test.mjs
node research-lab/evaluation/paired-evaluator.mjs input-records.json report.json
```

No coefficients are trained. This is an evaluation harness, not an Aggregator.
