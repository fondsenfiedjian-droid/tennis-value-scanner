# Grand Slam match linkage research

## Purpose

The Grand Slam point-by-point archive provides detailed point-level fields but usually lacks exact match dates, round, winner and player IDs in its match metadata. This audit links each Slam metadata row to the pinned ATP/WTA main-tour results archive using the normalized full player-name pair, Slam and year.

## Method

The workflow downloads 49 singles Slam match metadata files and 28 yearly ATP/WTA main-tour result files (2011–2024) from the same pinned archive commit. It accepts only unique player-pair/event/year matches. Ambiguous pairs, unmatched pairs, missing names and round conflicts are reported separately; no fuzzy links or guessed identities are accepted. Where the Slam metadata supplies a winner indicator or round, the audit cross-checks it against the linked result.

The linked result supplies a tournament date, which is generally the Monday at or near the start of the event. It is not the exact date of the individual point/match. Since most Slam metadata rows omit round and winner, this linkage alone does not establish chronology within a tournament.

## Research use

A high exact-link rate would make it possible to attach player IDs, tournament dates and round information to point-level records, enabling later construction of historical player aggregates. Any pre-match feature must still exclude same-day or same-tournament leakage unless the exact match order is proven. All linked features remain research-only until validated on chronological holdouts.

## Data handling and license

Raw match files are processed only on an ephemeral GitHub Actions runner. Only aggregate counts are retained for 30 days. No match-level linked table or player-level derived dataset is committed or uploaded. Upstream data is CC BY-NC-SA 4.0: attribution, non-commercial use and share-alike obligations apply.
