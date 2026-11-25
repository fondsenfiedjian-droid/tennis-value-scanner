# Tournament Intent evidence module

Status: isolated research/triage module. Not connected to live predictions, model probabilities, EV, or bet selection.

## Purpose

Identify documented pre-match signs that a player may treat an event as preparation or a lower-priority stop. This is not a claim that a player intends to lose or will not try to win.

## Evidence classes

Positive preparation / lower-priority evidence:
- Direct player statement that this event is for match practice or preparation.
- Direct statement that a later event is the main priority.
- Verified player/team statement about a cautious return or limited workload.
- Verified recent return after injury/long absence.
- A more important event soon after the current event.
- Current event positioned as a schedule bridge.

Contrary evidence:
- Direct statement that winning this event is a specific goal.
- Direct statement that this is a special personal/home priority.

Calendar context is weaker than a direct statement. Ranking, odds, reputation, an isolated loss, or a speculative reading of body language are not evidence types.

## Data contract and safeguards

Each evidence item requires a recognized type, `verified: true`, a source, and `observedAt`. The assessment is evaluated as of a timestamp and optionally before the target match date. Stale, future, unverified, post-match, unknown-type, or source-less items are rejected. Default evidence age limit is 45 days.

The module returns a transparent evidence ledger, rejected-item counts, and a coarse classification. Empty evidence is `unknown`, never a low-motivation score. Positive and contrary evidence remain visible.

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
