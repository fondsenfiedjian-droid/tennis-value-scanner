# Tournament Intent evidence registry

Status: second-stage data-capture foundation; manual/reviewed records only. No live crawler, production UI, probability adjustment or betting action.

## Record contract

Each record is tied to a player, event and exact target match. It requires:
- recognized evidence type;
- public HTTPS source name and URL;
- source publication time and capture time;
- target match start time;
- explicit `verified: true` and reviewer identity;
- optional short quote and analyst detail.

Publication and capture must both precede the target match start. Default freshness window is 45 days. The registry rejects unverified, stale, malformed, duplicate and post-match evidence. Import results include accepted/rejected/duplicate counts and rejection reasons.

## Workflow

1. Find a public interview, official player/team statement, tournament announcement or reputable report.
2. Record the exact player and target match, source URL, publication timestamp and capture timestamp.
3. Assign an evidence type only when the source directly supports it. Do not infer intent from rank, odds, a loss, body language or speculation.
4. Have a reviewer verify the source and classification.
5. Import the record and retain the rejection report.
6. Assess only records linked to that exact player and target match.

## Temporal integrity

The source publication time and the time the evidence was captured must be no later than the target match start. Do not attach one player's general quote to every match without explicit scope review. Evidence must remain point-in-time; later corrections should create a new reviewed record rather than overwrite historical knowledge.

## Separation from prediction

This registry feeds the evidence classifier only. It does not modify Elo, model probability, EV or bet selection. It is not an automated web scraper and does not claim that a player intends to lose.
