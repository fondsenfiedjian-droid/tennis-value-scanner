# Tournament Intent evidence module

Status: isolated research/triage module. Not connected to live predictions, model probabilities, EV, or bet selection.

## Purpose

Report the type of documented, point-in-time pre-match evidence. The module does **not** infer that a player is unmotivated, unwilling to win, or likely to lose.

## Evidence classes

- `explicit_preparation`: direct statement that the event is for practice, preparation or match rhythm. This is a preparation objective, not evidence of reduced effort.
- `explicit_next_event_priority`: direct statement that a later event has priority. This records the stated schedule priority; it does not prove that the player will not compete fully now.
- `official_return_cautious` and `recent_injury_return`: return/readiness context only. Neither is a motivation label.
- `major_event_soon` and `schedule_bridge`: calendar context only. These can never independently create a preparation/low-priority classification.
- `explicit_title_focus`: direct statement of a goal to win the current event.
- `home_event_commitment`: contextual statement of special personal/home importance.

Ranking, odds, reputation, an isolated loss, body language and analyst intuition are not evidence types.

## Output interpretation

The classifier reports narrow evidence categories such as:
- `explicit_preparation_statement`
- `explicit_later_event_priority_statement`
- `explicit_current_event_priority_statement`
- `mixed_direct_statements`
- `return_or_readiness_context_only`
- `calendar_or_home_context_only`
- `unknown`

It does not produce a scalar motivation score. The retained numeric weights are unvalidated descriptive tallies for research inspection only; they do not drive the classification and must not be interpreted as probabilities or calibrated strength.

## Data contract and safeguards

Each evidence item requires a recognized type, `verified: true`, a source, and `observedAt`. The assessment is evaluated as of a timestamp and optionally before the target match date. Stale, future, unverified, post-match, unknown-type, or source-less items are rejected. Default evidence age limit is 45 days.

The module returns a transparent evidence ledger, rejected-item counts, and a narrow evidence classification. Empty evidence is `unknown`, never a low-motivation score. Positive and contrary statements remain visible.

## Critical separation

- This module does not diagnose motivation or physical fitness.
- Physical workload/recovery remains in `human-factor.js`.
- No probability adjustment is produced; `probabilityAdjustment` is always null.
- No automatic EV or bet-selection changes.
- Do not scrape or infer private health data. Use only reliable, public, pre-match sources.
- Any future probability integration requires a point-in-time sourced dataset, coverage audit, leakage tests, and chronological ATP/WTA holdout validation.

## Validation

Run:
```sh
node --check tournament-intent.js
node --test tests/tournament-intent.test.mjs
```
