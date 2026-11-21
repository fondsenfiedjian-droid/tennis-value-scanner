# Tournament Intent — pilot sampling protocol

Status: research protocol only. This protocol does not classify a player as unwilling to win and does not change model probabilities, EV or bet selection.

## 1. Pilot question

Can a reviewer consistently find and classify public, pre-match evidence that a player is treating a particular event as preparation, assigning greater priority to a later event, or explicitly prioritising the current event?

The pilot measures evidence coverage and reviewer consistency first. It does not assume that such evidence predicts match outcomes.

## 2. Sampling unit and selection

The unit is one **player–target-match** observation, not a tournament or a player-season.

For each pilot batch:

1. Freeze a consecutive calendar window before reviewing any sources (recommended: two complete tournament weeks).
2. Include every singles match in the selected events that involves a player ranked in the top 50 on the ranking snapshot published before the event began. Keep ATP and WTA strata separate.
3. Select event weeks and tours before inspecting interviews or results. Do not select matches because a player later lost, retired or underperformed.
4. Record the ranking snapshot date and the event/match list used to construct the sample.
5. If the batch is too large, use a reproducible random sample with a recorded seed; never hand-pick only suspected cases.

The first feasibility batch should target 100 player–match observations across ATP and WTA, with the exact counts reported rather than forced to balance.

## 3. Standardised source search

For every sampled observation, search the same source categories in the same order:

1. Official ATP/WTA player news, previews and interviews.
2. Official tournament preview, media-day and press-conference material.
3. Direct player/team public statements, including verified social accounts.
4. Reputable media interviews, only where the original publication date and wording can be checked.
5. Official schedule and draw information for calendar context.

Useful official starting points:
- ATP news: https://www.atptour.com/en/news
- ATP video: https://www.atptour.com/en/video
- WTA news: https://www.wtatennis.com/news
- WTA press conferences: https://www.wtatennis.com/videos/press-conferences
- WTA videos: https://www.wtatennis.com/videos

A source being absent, inaccessible or silent is **not** evidence of low priority. Record each source category as searched, unavailable, or not searched. Use a fixed search budget (recommended: 15 minutes per player–match) so observations are comparable.

## 4. Evidence coding

Use only the evidence types implemented in the registry. Keep these interpretations narrow:

- `explicit_preparation`: the player/team directly describes this event as practice, preparation or a way to regain match rhythm. This does not by itself mean the player does not want to win.
- `explicit_next_event_priority`: a direct statement that a later event is the priority over the current event.
- `official_return_cautious`: the player/team explicitly confirms a cautious return or deliberately limited workload.
- `recent_injury_return`: independently verified recent return after an injury/long absence; record the factual return, not an assumed motive.
- `major_event_soon` / `schedule_bridge`: calendar context only. These are weak contextual signals, never proof of intent.
- `explicit_title_focus`: a direct statement that winning the current event is a goal.
- `home_event_commitment`: a direct statement that the event has special personal/home importance.

Do not infer intent from ranking, odds, reputation, a single loss, body language, withdrawals by other players or an analyst's intuition. Do not use post-match statements to explain a pre-match state.

## 5. Required observation outcomes

Each sampled player–match must receive one search outcome, even when no evidence is found:

- `evidence_found`: one or more admissible pre-match records.
- `no_evidence_found`: search completed to protocol, but no admissible evidence found.
- `source_unavailable`: a required source category could not be checked.
- `search_incomplete`: time limit or access prevented completion.

These are coverage outcomes, not classifier verdicts. Keep `no_evidence_found` distinct from the classifier's `unknown` state.

For each positive or contrary record, store the exact target match ID, player, event, public source URL, source publication time, capture time, target match start, source category, short verbatim excerpt (within the registry limit), evidence type, reviewer and verification flag.

## 6. Review quality

- A primary reviewer codes every observation.
- A second reviewer independently codes all observations with evidence and a random 20% of observations coded as no evidence.
- Reviewers must not see match outcomes while coding.
- Resolve disagreements by checking the original source; preserve the initial codes and the adjudicated code.
- Report agreement separately for evidence presence and evidence type. Do not hide disagreement by silently overwriting records.

## 7. Analysis gates

Before considering any model integration, report:
- sample size by tour, event tier and source category;
- proportion with evidence found, no evidence, unavailable and incomplete;
- evidence types and number of distinct players/events represented;
- reviewer agreement and adjudication rate;
- proportion of records rejected as stale, unverifiable, malformed or post-match.

Only after a sufficiently broad dataset exists should a separate study test predictive value. Freeze all evidence at the pre-match cutoff, use chronological train/validation/test periods, and compare against the unchanged baseline model. Evaluate calibration and proper scoring rules (Brier score and log loss), coverage, and any betting results with realistic odds and costs. Do not tune thresholds on the final holdout.

No probability adjustment is permitted until the evidence demonstrates incremental out-of-sample value and a separate change is reviewed and approved.

## 8. Interpretation guardrail

The output must describe sourced evidence and uncertainty, not claim to know a player's private motivation. “Preparation signal” is not synonymous with “does not intend to win”, “will lose” or “safe bet against”. Physical readiness remains a separate dimension handled by the workload/recovery analysis.
