# Public statements vs observed behaviour — audit protocol

**Status:** research-only extension to the Tournament Intent pilot. No live scoring, probability adjustment, EV change, or bet-selection rule is authorised by this document.

## 1. Working principle

Treat a player's public statement about motivation, tournament goals, preparation, or priorities as a claim to be recorded — not as ground truth.

Statements may be strategic, diplomatic, incomplete, outdated, or compatible with several intentions. A statement such as “I came here for match rhythm” does not establish that the player is unwilling to win. A statement of title ambition does not establish physical readiness or guarantee full effort.

Therefore:

- Public statements about motivation receive **zero direct model weight**.
- They must not increase or decrease match-win probability, EV, or stake recommendations.
- Preserve the exact wording, speaker, source, publication timestamp, capture timestamp, target event/match, and context.
- Code the statement separately from objective facts and subsequent match behaviour.
- Do not label a player dishonest, deceptive, unmotivated, or unwilling to win from a result.

## 2. Separate evidence dimensions

Every observation must keep these dimensions separate:

1. **Public claim:** what the player, coach, or team actually said.
2. **Schedule context:** upcoming events, withdrawals, travel, rest windows, and event sequence.
3. **Physical availability:** independently verified injury, return status, medical timeout, retirement, or workload restriction known before the target match.
4. **Observed match behaviour:** only descriptive facts, such as retirement, walkover, minutes played, sets completed, or verified workload data. A loss or poor score alone is not evidence of low intent.
5. **Competitive outcome:** match result and tournament stage, stored separately and hidden from reviewers during pre-match evidence coding.

Do not collapse physical readiness, tournament priority, match intent, and result into one “motivation” variable. Avoid double-counting facts already represented by the workload/recovery module.

## 3. Statement reliability coding

Use the following descriptive labels; they are not numeric weights:

- `direct_quote`: attributable statement with original wording and a verifiable source.
- `paraphrase`: a media summary where the full original wording is unavailable.
- `ambiguous`: wording supports multiple interpretations.
- `context_missing`: statement lacks enough context to identify whether it refers to the current event, a later event, or the season generally.
- `contradicted_by_later_statement`: a later attributable statement materially changes or contradicts the earlier claim. Preserve both records; do not erase the first.
- `not_verifiable`: source, speaker, date, or wording cannot be independently checked.

A direct quote is more reliable evidence of **what was said**, not necessarily of the speaker's private intention or actual physical capacity.

## 4. Retrospective behaviour audit

After the event, compare the pre-match claim with independently recorded facts. Do not turn this into a binary “truth/lie” test.

For each case, record:

- the exact claim and its stated scope;
- whether it concerned preparation, recovery, a later event, title ambition, or match-specific commitment;
- what was objectively knowable before the target match;
- subsequent observable facts and their timestamps;
- tournament stage reached and match outcomes;
- plausible alternative explanations, including injury, opponent strength, surface, draw, and ordinary performance variance;
- whether the comparison is inconclusive.

Allowed audit conclusions:
- `consistent_with_claim`
- `mixed_or_ambiguous`
- `not_enough_information`
- `later_facts_changed_context`

Do not use “false” or “deceptive” unless there is independently verified evidence of a factual falsehood, and even then describe the specific factual contradiction rather than inferring motive.

## 5. Critical safeguards against hindsight bias

- Reviewers coding pre-match evidence must not see the result or tournament progress.
- Store source publication time and actual capture time separately.
- Information published or captured after target match start cannot be used as a pre-match feature for that match.
- A player's later title, early loss, retirement, or withdrawal does not prove what they intended beforehand.
- Compare statements with behaviour only after the pre-match record has been frozen.
- Include all eligible sampled players, not only striking examples or players who lost.
- Report the denominator, missing-source rate, and inconclusive cases. Do not infer prevalence from selected anecdotes.

## 6. Research questions

The audit may investigate:

1. How often do players publicly describe preparation or recovery while still reaching late rounds or winning the event?
2. How often do statements of strong ambition coexist with observable physical limitations?
3. Are statements specific to the current event, or generic media language?
4. Do objective pre-match facts add predictive information beyond the existing model and workload/recovery features?
5. Can independent reviewers code claims consistently?

The first four questions require a systematic sample and chronological holdout. Anecdotes are hypothesis-generating only.

## 7. Model integration gate

No statement-based feature or adjustment may enter the prediction model unless a separate, pre-registered study demonstrates incremental out-of-sample value over the unchanged baseline, with reliable pre-match timestamps, adequate sample size, calibration and proper scoring-rule evaluation.

Even if objective facts later prove useful, public statements remain descriptive context unless independently validated as predictive. The existing classifier's `probabilityAdjustment` remains null.
