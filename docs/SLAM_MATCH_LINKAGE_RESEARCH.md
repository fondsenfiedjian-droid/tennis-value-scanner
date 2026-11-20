# Grand Slam match linkage research

## Purpose

The Grand Slam point-by-point archive provides detailed point-level fields but usually lacks exact match dates, round, winner and player IDs in its match metadata. This audit links each Slam metadata row to the pinned ATP/WTA main-tour results archive using the normalized full player-name pair, Slam and year.

## Method

The workflow downloads 49 singles Slam match metadata files and 28 yearly ATP/WTA main-tour result files (2011–2024) from the same pinned archive commit. It first matches normalized full player-name pairs. If that fails, it permits a conservative first-initial + surname alias only when that alias identifies exactly one full-name identity for each player within that Slam/year. It accepts only unique pair/event/year matches. Ambiguous aliases, unmatched pairs, missing names and round conflicts are reported separately; no fuzzy links or guessed identities are accepted. Historical round labels such as Round 1–7 are normalized to R128–Final. Where the Slam metadata supplies a winner indicator, the audit cross-checks it against the linked result.

## Completed linkage results

| Measure | Result |
|---|---:|
| Slam metadata rows | 10,513 |
| Unique links | 10,110 (96.17%) |
| Full-name links | 8,048 |
| Conservative initial-surname links | 2,062 |
| ATP links | 5,270 |
| WTA links | 4,840 |
| Ambiguous aliases | 41 |
| Unmatched player pairs | 371 |
| Missing player names | 32 |
| Round conflicts after normalization | 0 |
| Winner cross-checks | 636 |
| Winner mismatches | 0 |

The linked result supplies a tournament date, which is generally the Monday at or near the start of the event. It is not the exact date of the individual point/match. Since most Slam metadata rows omit round and winner, this linkage alone does not establish chronology within a tournament.

## Research use

A high exact-link rate would make it possible to attach player IDs, tournament dates and round information to point-level records, enabling later construction of historical player aggregates. Any pre-match feature must still exclude same-day or same-tournament leakage unless the exact match order is proven. All linked features remain research-only until validated on chronological holdouts.

## Data handling and license

Raw match files are processed only on an ephemeral GitHub Actions runner. Only aggregate counts are retained for 30 days. No match-level linked table or player-level derived dataset is committed or uploaded. Upstream data is CC BY-NC-SA 4.0: attribution, non-commercial use and share-alike obligations apply.
