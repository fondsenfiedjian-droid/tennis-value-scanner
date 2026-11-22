# HFA v0.1 — Evidence Registry and Coding Protocol

Status: research protocol; no production integration.
Isolation: `research/tvs-research-lab-v1` only.
Purpose: define what can and cannot count as pre-match human-factor evidence before any model is built.

## 1. Principle

HFA must not guess a player's motivation, confidence, stress, concentration, emotional state, or desire to win. Narrative plausibility is not evidence. Every coded observation must have a source published or timestamped before the target match and a reproducible coding rule.

HFA is allowed to return `insufficient_data` or `abstain` for most matches. This is preferable to fabricated psychological precision.

## 2. Candidate evidence classes

| Class | Potentially admissible evidence | Not admissible as a direct signal |
|---|---|---|
| Publicly confirmed withdrawal / return context | Official tournament, tour, or player statement published before match | Rumours, anonymous social posts |
| Schedule / event context | Official draw, order of play, confirmed format and stage | Assumed importance or pressure |
| Player statements | Direct, attributable pre-match interview with publication timestamp | Paraphrased gossip or post-match comments |
| Career / experience context | Verifiable age-independent career records, tour-level match counts, prior finals/titles calculated as-of date | “Big-match mentality” labels |
| Disciplinary / exceptional context | Official published decision existing before match | Speculation about private matters |
| Crowd / venue context | Documented home-country / home-city relationship and event location | Assumed crowd influence or hostility |

Health information is out of scope unless the user later authorizes a narrowly defined, lawful, public-source analysis. HFA must not infer diagnoses or private medical states.

## 3. Source registry fields

Every source record must store:
- source_id;
- publisher / organization;
- canonical URL or archive identifier;
- source class;
- publication timestamp (UTC where available);
- retrieval timestamp;
- target player / match IDs;
- exact factual claim, not a psychological interpretation;
- source reliability tier and rationale;
- whether the source is primary or secondary;
- evidence excerpt / locator, subject to copyright limits;
- coder ID and coding timestamp;
- status: accepted, rejected, disputed, expired.

If publication time cannot be established as pre-match, the source is not eligible for that target.

## 4. Reliability tiers

- Tier A: official tour, tournament, governing-body, or direct player/coach statement.
- Tier B: established newsroom with named journalist and traceable publication time.
- Tier C: secondary aggregation or commentary; discovery only, not a standalone model input.
- Tier D: anonymous account, forum rumour, unsourced claim; reject.

A source tier is not a probability that the claim is true. Record claim type and corroboration separately.

## 5. Coding protocol

1. Write the factual observation in neutral language.
2. Record source and publication time.
3. Verify that it predates the target match.
4. Identify the pre-registered feature it maps to.
5. Code direction only if the mapping rule explicitly defines direction; otherwise code context without directional value.
6. Record confidence in the factual extraction, not confidence about the player's mind.
7. Have a second coder independently review directional labels.
8. Resolve disagreements by retaining neutral context or abstaining; do not force consensus.
9. Preserve original source and coding revisions append-only.

No feature may be added after inspecting test-set outcomes.

## 6. Prohibited shortcuts

Do not code:
- “must win”, “revenge”, “motivation”, “home pressure”, “nerves”, “choking”, “confidence” from pundit language;
- body language or facial expression from photos/video;
- inferred personal relationships, private life, or sensitive personal characteristics;
- post-match interviews or articles;
- betting-market movement as a psychological indicator;
- a player's loss streak as “low confidence” without a separately validated observable definition.

## 7. Output contract

HFA uses the shared SAS output contract:
- `insufficient_data` when no qualifying pre-match evidence exists;
- `abstain` when sources conflict, timestamps are unclear, or the claim is ambiguous;
- `available` only for a specific, pre-registered, reproducible feature with provenance;
- `error` only for technical failure.

The default directional signal is null. An available record may contain non-directional context. Do not emit a numeric psychological score in v0.1.

## 8. Evaluation gates

Before predictive testing:
- source timestamp audit;
- primary-source corroboration audit;
- inter-rater agreement on a blinded sample;
- leakage audit;
- coverage and selection-bias report.

For any later model test:
- preregister features and hypotheses;
- use chronological walk-forward evaluation;
- compare PFE vs PFE+HFA on identical matches;
- report coverage, abstention, calibration, Brier, log loss, and paired loss differences;
- correct for multiple exploratory hypotheses;
- test whether any apparent gain persists across tours and periods.

No HFA feature receives an Aggregator weight until it demonstrates incremental out-of-sample value and stable calibration.

## 9. v0.1 decision

HFA is an evidence-governance protocol, not a psychological prediction engine. No numerical influence weight is assigned. Lack of evidence is represented explicitly rather than filled with intuition.
