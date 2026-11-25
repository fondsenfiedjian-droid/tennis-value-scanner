# Tournament Intent evidence registry

Status: second-stage data-capture foundation; manual/reviewed records only. No live crawler, production UI, probability adjustment or betting action.

## Record contract

Each record is tied to a player, event and exact target match. It requires:
- recognized evidence type;
- source category (`official_tour`, `official_tournament`, `player_or_team`, `verified_social`, `reputable_media` or `official_schedule`), plus public HTTPS source name and URL;
- source publication time and capture time;
- target match start time;
- explicit `verified: true` and reviewer identity;
- optional short quote and analyst detail.

Publication and capture must both precede the target match start. Default freshness window is 45 days. The registry rejects unverified, stale, malformed, duplicate and post-match evidence. Import results include accepted/rejected/duplicate counts and rejection reasons.

## Workflow

1. Prefer official tour/tournament material or a direct player/team statement. Verified player social posts and reputable media are secondary; record the source category explicitly.
2. Record the exact player and target match, source URL, publication timestamp and capture timestamp.
3. Assign an evidence type only when the source directly supports it. Do not infer intent from rank, odds, a loss, body language or speculation.
4. Have a reviewer verify the source and classification.
5. Import the record and retain the rejection report.
6. Assess only records linked to that exact player and target match.

## Temporal integrity

The source publication time and the time the evidence was captured must be no later than the target match start. Do not attach one player's general quote to every match without explicit scope review. Evidence must remain point-in-time; later corrections should create a new reviewed record rather than overwrite historical knowledge.

## Separation from prediction

This registry feeds the evidence classifier only. It does not modify Elo, model probability, EV or bet selection. It is not an automated web scraper and does not claim that a player intends to lose.

## Local import utility

The repository includes `scripts/import-tournament-intent-evidence.mjs`. It imports a JSON array, a JSON object containing `records[]`, or JSONL into a local registry file. It merges an existing registry, de-duplicates evidence, retains rejection reasons and writes the normalized result atomically. It has no network access and does not write to Cloudflare or the live app.

Example:

```sh
node scripts/import-tournament-intent-evidence.mjs --input incoming-evidence.json --out tournament-intent-evidence.json --dry-run
node scripts/import-tournament-intent-evidence.mjs --input incoming-evidence.json --existing tournament-intent-evidence.json --out tournament-intent-evidence.json
```

Use a separate incoming file for each review batch. Back up the registry before replacing it. Keep source URLs and timestamps; never backdate the capture time. The output contains normalized accepted records and the most recent batch's rejection report.

## Player–match search coverage ledger

The separate `tournament-intent-observations.js` module validates one row for every sampled player–target-match, including observations where no admissible evidence is found. It records the pre-event ranking snapshot, exact target match, reviewer, search duration and status of each standard source category.

The four outcomes are mutually distinct:
- `evidence_found`: one or more linked evidence IDs exist.
- `no_evidence_found`: all five source categories were searched and no admissible record was found.
- `source_unavailable`: at least one source category was unavailable and none was left unsearched.
- `search_incomplete`: at least one source category was not searched.

The validator rejects post-match search completion, ranking snapshots after the target match, ranks outside the predeclared top-150 frame, incomplete status records and inconsistent outcome/evidence combinations. The summary function reports coverage by tour and ranking band. A no-evidence observation is a coverage result, never a negative motivation label.

The local utility `scripts/import-tournament-intent-observations.mjs` imports reviewed JSON/JSONL observation batches, validates each row, merges by exact player–target-match key, reports duplicates/rejections, summarizes coverage, and writes atomically. It supports `--dry-run` and performs no network or Production writes.
