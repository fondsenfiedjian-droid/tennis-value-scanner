# Point-state transition research

## Scope

This is a research-only parser for the Live Tennis API academic public sample. Each CSV row is a scoreboard state, not a point result. A point outcome is inferred only from the transition to the next state for the same match. The script accepts a CSV or gzip-compressed CSV and emits aggregate diagnostics only:

`node scripts/point-state-transition-audit.mjs --input points_sample_2026-06.csv.gz --out report.json`

No match IDs, player names, raw rows, or player-level features are written to the report.

## Inference order

1. Compare completed-set counters, but accept a winner only when the prior score is demonstrably one point from closing the game/set and the next state resets the point score to 0-0. For a tiebreak, the prior numeric score must be one point from the two-point-margin finish.
2. If set counters do not change, apply the same terminal-score and 0-0 reset gate to current-set game counters. Counter changes without a terminal prior score remain ambiguous; this prevents skipped multi-point gaps from being mislabeled as a single point winner.
3. If neither counter changes, inspect point-score states:
   - normal game progression: 0 → 15 → 30 → 40 → advantage;
   - advantage lost: advantage → 40 while the opponent remains at 40, so the opponent won the point;
   - tiebreak: numeric point counters increase by exactly one for one side.
4. Multi-point jumps, conflicting changes, missing scores and match-boundary transitions remain ambiguous; the parser does not guess.

The server field is preserved only as before/after availability and change counts. Its exact alignment to a transition is not assumed; service attribution remains blocked until validated against hand-checked source matches.

## Required validation before feature work

- Test transitions in normal games, deuce/advantage, tiebreaks, game boundaries and set boundaries against manually checked matches.
- Measure tape completeness: first state may start mid-match and final state may stop early.
- Keep ambiguous transitions and missing states explicit; never impute them as points won/lost.
- Validate whether server in the prior or next state owns the transition, especially around game and tiebreak service changes.
- Keep observed live capture separate from reconstructed post-match data. The public sample contains observed states only.
- Pre-match features may use only matches completed before the target match start; no same-event history without reliable match-specific order.
- Keep ATP, WTA, Challenger and ITF separate and apply minimum-history / shrinkage gates.

## Current status

The parser and synthetic tests are implemented and the June 2026 public sample has been audited in ephemeral CI. Aggregate findings are recorded below. The parser remains research-only, is not production-connected and does not create player-level features. The dataset has no serve speed, serve direction or shot-level information.

## Real public-sample audit harness (2026-11-21)

- Added optional match-index input to the aggregate-only audit. It reports coverage by the source's literal `tier_key`; these values are preserved as source categories and are not silently relabelled as ATP/WTA tours.
- Added timestamp integrity diagnostics: valid/missing timestamp counts, duplicate adjacent timestamps, non-monotonic adjacent timestamps, and affected match count. Input capture order remains authoritative; the audit flags timestamp inconsistencies rather than sorting away possible source defects.
- Added an ephemeral GitHub Actions workflow that downloads only the public Zenodo sample files (`matches.csv.gz`, `points_sample_2026-06.csv.gz`), runs the audit, and publishes aggregate diagnostics only. Raw source files remain on the temporary runner and are not committed or uploaded as artifacts.
- Source licence: CC BY-NC 4.0. Use for this non-commercial research only; cite the dataset and do not redistribute raw data.
- Validation of the harness is pending the PR checks and a successful manual/workflow run against Zenodo. No real-sample result is claimed yet.
- Next: inspect the resulting tier coverage and timestamp quality; then manually validate a stratified sample of transitions against source score sequences before drawing conclusions about server ownership or model features.

### Counter-inference safety gate (2026-11-21)

The first real-sample run exposed a potential over-inference risk: the earlier parser accepted any one-game or one-set counter increment, even if the previous point score was not a terminal game-point state. Such a transition may conceal multiple missed points. Counter-based inference is now restricted to transitions where the prior score is one point from game completion (or one point from a two-point tiebreak finish) and the next state resets to 0-0. Other counter changes remain ambiguous. Dedicated tests cover ordinary game, set, tiebreak and skipped-score cases. The initial 84.38% figure is therefore a pre-gate diagnostic only and must not be treated as the validated parser rate; rerun the sample after this change.

### Tour split

The public match index uses numeric `tier_key` identifiers, so those identifiers are reported literally and not interpreted as ATP/WTA. The audit additionally classifies a match as ATP or WTA only when its `round` label begins explicitly with that tour name (for example, `ATP Miami - ...`). All other rows remain `unclassified`. This is a conservative reporting split, not an assumption based on tournament name or numeric tier ID.

### ATP/WTA coverage limitation and secondary cross-check

The first explicit round-prefix split classified only 659 of 5,380 matches (353 ATP, 306 WTA); 4,721 match rows had round labels without an explicit ATP/WTA prefix and remain unclassified by this strict event-label method. To improve visibility without silently treating player identity as event identity, the audit now also reports a separate `byPlayerTourAgreement` diagnostic: a match is assigned to ATP or WTA in this secondary view only when both player records in `players.csv` declare the same primary tour. This is a proxy for player affiliation, not proof of the event's tour; the two reports must remain separate. The workflow downloads `players.csv.gz` ephemerally and does not publish raw data.

## First real public-sample audit results (2026-11-21)

Run: GitHub Actions `44862908490` (successful). The public June 2026 sample contains 5,380 matches and 951,064 observed score states, yielding 945,684 adjacent transitions.

- After the conservative terminal-score gate, 772,578 transitions were inferred (81.70%) and 173,106 remained ambiguous (18.30%). This is parser coverage, not winner-prediction accuracy and not a model-performance score.
- The gate moved 25,406 counter-change transitions into the ambiguous category because the prior state did not prove the match was one point from completing that game/set. The earlier 84.38% result was pre-gate and is superseded.
- Timestamp integrity was clean in this sample: all 951,064 states had parseable timestamps; zero adjacent timestamp reversals, zero duplicate adjacent timestamps, and zero matches with timestamp-order issues. This validates ordering consistency in this sample only, not the correctness of every point outcome.
- Server was present before 906,319 transitions and after 907,569 transitions. It changed across 85,420 transitions. This is descriptive only; server-to-point ownership and rotation alignment remain unvalidated.
- Only 212/5,380 tapes began at 0-0. This is not a completeness measure; tapes may legitimately attach mid-match or end early.
- Strict explicit round-prefix classification covered 353 ATP and 306 WTA matches; 4,721 remained unclassified. A separate player-primary-tour agreement proxy classified 2,062 ATP and 1,684 WTA matches, leaving 1,634 unclassified. In that proxy view, transition inference was 83.73% ATP and 82.25% WTA (78.14% unclassified). Do not treat primary player affiliation as verified event-tour identity.
- 57 matches had every observed transition inferred; most tapes still contain at least one ambiguous transition.

Conclusion: the public sample is technically usable for further parser validation, but not ready for feature engineering. Next steps are manual source-level validation of stratified ordinary-game, advantage, tiebreak, game-boundary and set-boundary transitions; resolve the 25,406 counter transitions and major ambiguity groups; validate server alignment; and improve exact event-tour mapping. Keep ATP and WTA separate, and do not build rolling pre-match features until those checks pass.

## Server-rotation alignment audit (research-only, 2026-11-21)

A new diagnostic compares the server field on consecutive scoreboard states against two hypotheses: (1) in ordinary games the server remains the same until a game counter advances, then switches; (2) during a tiebreak, the server switches after the first point and then after every two points. Transitions into/out of tiebreaks, missing server values, counter jumps and unclassifiable states are skipped and counted separately. This checks consistency of the server field with expected rotation; it does not independently prove whether the before-state or after-state server owns the point. Treat match/mismatch rates as a diagnostic, not as validated point attribution.

### First server-alignment sample result (2026-11-21)

Successful run: GitHub Actions `44863117235`.

- Ordinary-game hypothesis checked 831,264 transitions: 788,443 matched (94.85%), 42,821 mismatched (5.15%).
- Tiebreak hypothesis checked 13,252 transitions: 6,839 matched (51.61%), 6,413 mismatched (48.39%).
- 101,168 transitions were skipped, mostly due to missing server (46,031), game-counter jumps (28,562), set-array boundaries (12,896) or tiebreak entry/exit (7,319).

Interpretation: ordinary-game rotation is broadly consistent with the “current/next server” hypothesis, but the mismatch rate is non-zero and needs stratified review. Tiebreak alignment is effectively inconclusive; the near-50/50 result means the assumed state-to-point timing or tiebreak server semantics are not established. Do not assign serve ownership to point transitions or derive serve/return features from this field yet. Next investigate alternative one-state phase alignment and manually validate examples from the source documentation/data before any feature work.

## Alternative server-field phase audit (2026-11-21)

The first rotation diagnostic found 94.85% ordinary-game agreement but only 51.61% tiebreak agreement under the hypothesis that each state names the next point's server. A follow-up now compares a second plausible interpretation: the field names the player who served the most recent point. Under that alternative, the server is expected to remain unchanged on the game-ending transition, then change after the first point of the next game; in a tiebreak, it changes after the second point and every two points thereafter. Both hypotheses are reported side by side, with ordinary-game game-boundary and within-game transitions separated. Neither interpretation is treated as truth until source-level examples or authoritative semantics settle the phase.

### Alternative phase comparison on the real sample (2026-11-21)

Successful run: GitHub Actions `44863408028`.

- **Ordinary games, next-point-server hypothesis:** 788,443/831,264 (94.85%) overall. Within games: 727,555/741,219 (98.16%). At game boundaries: 60,888/90,045 (67.62%).
- **Ordinary games, last-point-server alternative:** 693,129/831,264 (83.38%) overall. Within games: 663,972/741,219 (89.58%). At game boundaries: 29,157/90,045 (32.38%).
- **Tiebreak:** next-point hypothesis 6,839/13,252 (51.61%); last-point alternative 6,413/13,252 (48.39%). Neither is convincing.

The next-point-server interpretation is substantially more consistent for ordinary games, especially within games, so it remains the leading hypothesis there. However, only 67.62% of game-boundary transitions match it; this boundary mismatch must be explained before serve ownership is considered reliable. Tiebreak server alignment remains unresolved. Keep server-based point attribution and all serve/return features blocked.

## Timestamp-gap audit (2026-11-21)

The parser now measures elapsed seconds between consecutive observed states and reports distributions separately for inferred and ambiguous transitions: count, mean, median, p90/p95/p99, maximum and broad time-gap bins. Ambiguous transitions are also broken down by parser reason. This is intended to test whether ambiguous transitions are concentrated in long capture gaps or also occur at short intervals. A long gap is not automatically a missed point; timestamps are observed capture times and require cautious interpretation.

### First real-sample timestamp-gap findings (2026-11-21)

Successful run: GitHub Actions `44863667707`.

- Across all 945,684 transitions: median gap 25.44 s; p90 69.83 s; p99 244.84 s; mean 43.88 s (mean is pulled upward by a small long-gap tail).
- Inferred transitions: median 27.52 s; p90 64.39 s.
- Ambiguous transitions: median 15.20 s; p90 109.95 s. Nearly half of ambiguous transitions occur within 15 seconds, so ambiguity is not explained solely by long capture gaps.
- `multi-point-gap-or-score-conflict`: 84,126 cases, median 19.40 s; 45.8% within 15 s.
- `game-counter-jump-or-conflict`: 30,940 cases, median 10.58 s; 52.4% within 15 s.
- `counter-change-without-terminal-score`: 25,406 cases, median 29.18 s; 33.9% within 15 s.
- `missing-point-score`: 9,148 cases, median 7.36 s; 78.7% within 15 s.
- `no-score-change`: 7,405 cases, median 5.02 s; 87.0% within 15 s.

Interpretation: long gaps increase ambiguity in some categories, but many ambiguous transitions occur quickly. The next parser work should focus on score-field semantics, update/correction rows and counter consistency, not simply relax a time-gap threshold. Never infer a point outcome just because the time gap is short.

## Official server-field semantics and tiebreak switch matrix (2026-11-21)

The dataset's [official data dictionary](https://github.com/livetennisapi/livetennisapi-data/blob/main/DATA_DICTIONARY.md) defines `server` as the player serving at that score state. Therefore the next-point-server interpretation is the documented meaning; the last-point-server variant is only a diagnostic alternative, not an equally supported interpretation.

The current tiebreak report only gives overall agreement. A new matrix will split transitions where the tiebreak service schedule predicts a switch (after point 1, then every two points) from transitions where it predicts the same server. This will show whether the near-50% agreement comes from both cases failing equally or from one phase being systematically offset. Even a strong aggregate pattern is not sufficient by itself to enable serve attribution; boundary and source-quality validation remain required.

### Tiebreak expected-switch matrix — first real result (2026-11-21)

Successful run: GitHub Actions `44863861215`.

The official dictionary defines `server` as the player serving at that score state. Under the standard tiebreak rotation:
- When the next point should use the other server (6,528 transitions), the field changed only 235 times (3.60%) and stayed the same 6,293 times (96.40%).
- When the next point should use the same server (6,724 transitions), the field stayed the same 6,604 times (98.22%) and changed 120 times (1.78%).

This shows the near-50% overall agreement is not random noise: the server field is almost always held constant through tiebreak score transitions, even where service should rotate. It appears not to be refreshed point-by-point during tiebreaks in this sample. Do not derive tiebreak serve/return ownership from it. A further breakdown by the players' primary-tour agreement (ATP/WTA proxy) is being added to check whether this affects both groups similarly; it is not event-tour ground truth.

### Tiebreak server matrix split by player primary-tour agreement (2026-11-21)

Successful run: GitHub Actions `44863980944`. The player-tour grouping is a secondary affiliation proxy, not event-tour truth.

- **ATP proxy:** when a switch was expected, server changed 94/3,134 times (3.00%); when a hold was expected, it held 3,218/3,284 times (97.99%).
- **WTA proxy:** when a switch was expected, server changed 22/1,402 times (1.57%); when a hold was expected, it held 1,431/1,442 times (99.24%).
- Unclassified proxy group shows the same pattern: 5.97% observed switches when expected and 97.85% holds when expected.

The stale-server pattern appears in both ATP and WTA player-affiliation groups, so it is not a tour-specific quirk in this sample. Do not use tiebreak `server` for point ownership or serve/return features. Ordinary-game boundary mismatches remain a separate unresolved issue.

## Score-state delta audit (2026-11-21)

The next diagnostic separates transitions where the full score state is unchanged from transitions where point-score fields are missing. It records whether the server or tiebreak flag changed despite an unchanged score, and whether missing point scores coincide with game/set counter changes. This helps distinguish duplicate/update rows from incomplete score states without exposing match IDs or player-level records.

### Diagnostic refinement

The audit distinguishes (a) identical point-score pairs, (b) a fully comparable unchanged score state (sets, game arrays and point scores all parse and match), and (c) unchanged point scores where set/game counters changed or could not be parsed. This avoids treating an unchanged point score as proof that the entire scoreboard state was an exact duplicate. Numeric set/game values are normalized before comparison.

### Same-point-score counter-change breakdown

The aggregate report now distinguishes game-counter changes, set-counter changes and transitions where both change while the point-score pair remains identical. These transitions are not automatically point outcomes: they may represent delayed scoreboard counter updates or a state snapshot that has already reset its point score. The terminal-score gate continues to mark them ambiguous unless the previous state proves the final point of the game/set.

### First real-sample score-state delta findings (2026-11-21)

Successful run: GitHub Actions `44864476954`.

- 37,531 transitions had an identical point-score pair. In 36,937 of these, game/set counters changed: game counters in 35,660, set counters in 4,502, with 3,225 transitions changing both (counts overlap). Only 594 had stable, fully comparable set/game counters.
- Of those 594 fully comparable unchanged score states, 391 were exact duplicates except for timestamp, 199 also changed the server field, and 4 changed the tiebreak flag.
- 10,793 transitions had at least one missing point-score field: before missing in 5,650, after missing in 5,279, both missing in 136. Game counters changed in 1,626 and set counters in 166 (overlap possible); server changed in 460.

Interpretation: a substantial number of rows appear to update game/set counters while the point-score pair remains unchanged. This is consistent with asynchronous or delayed scoreboard field updates, not a single point outcome. Keep these transitions ambiguous; do not relax the terminal-score gate or treat same-score counter changes as point wins.

## Score-value vocabulary audit (2026-11-21)

A new check counts the literal point-score values separately for normal-game states and tiebreak states, and flags values that do not fit the data dictionary's expected vocabulary. It also counts unexpected numeric values in normal-game states and states with an unknown tiebreak flag. This validates input semantics before interpreting transitions; it does not itself infer point outcomes.

### First real-sample score vocabulary findings (2026-11-21)

Successful run: GitHub Actions `44864969199`.

- 929,956 states were flagged as normal-game and 21,108 as tiebreak; no unknown tiebreak flags.
- Normal-game states: 5,872 had at least one unexpected value. Of these, 5,368 states had missing point-score fields and 504 had non-missing numeric values outside the normal-game vocabulary (values 1–9; 931 player-side value occurrences in total).
- Tiebreak states: 385 had non-numeric values; 342 had missing point-score fields and 43 had `A`/`AD` values despite the tiebreak flag.
- Normal-game values observed and accepted: 0, 15, 30, 40, A and AD. Tiebreak scores are numeric and can exceed 9 (the sample includes values through 40).

Interpretation: a small number of states have a tiebreak flag/score-vocabulary mismatch, in addition to missing values. The 504 numeric normal-flag states may be tiebreak-like states with a delayed or incorrect flag; the 43 non-numeric tiebreak-flag states may be the reverse. Keep them excluded from point-outcome inference until state-level flag alignment is understood. Missing point scores remain ambiguous.

## Adjacent tiebreak-flag alignment audit (2026-11-21)

The next validation step checks whether states with numeric scores under a normal-game flag are immediately adjacent, within the same match's source row order, to a tiebreak-flagged numeric state. It also checks whether tiebreak-flagged states containing non-numeric score tokens are adjacent to a normal-game-flagged state with a recognized normal score pair. This is a diagnostic for possible one-row flag lag or state-boundary transitions only; adjacency is not proof of a flag error, and no anomalous row is reclassified by this check.

### First real-sample adjacency results (2026-11-21)

Successful run: GitHub Actions `44865468673`.

- 504 normal-flag states contained unexpected numeric score values (1–9). 112 (22.2%) were immediately adjacent to a tiebreak-flagged state whose two score fields were numeric; 392 were not.
- 43 tiebreak-flagged states contained a non-numeric score token (A/AD). 37 (86.0%) were immediately adjacent to a normal-flagged state with a recognized normal score pair; 6 were not.
- 5,710 states had at least one missing point-score field.

Interpretation: many A/AD-under-tiebreak cases occur at a normal/tiebreak boundary and may reflect a one-row flag lag or boundary snapshot. Most numeric-under-normal anomalies do not have an immediately adjacent tiebreak state, so they cannot be explained by simple one-row flag lag alone. This test is only adjacency in source row order; it does not prove the exact cause. Keep all 547 non-missing mismatch states ambiguous and do not rewrite their flags or infer point winners from them.

## Server-field alignment audit (2026-11-21)

Successful real-sample run: GitHub Actions `44865563966`.

- Within normal games, 727,555 of 741,219 checked transitions (98.16%) matched the expected same-server state; 13,664 did not.
- At normal game boundaries, 60,888 of 90,045 transitions (67.62%) matched the expected server change; 29,157 did not. The alternative interpretation matched only those 29,157.
- In tiebreaks, only 355 of 13,252 checked single-point transitions (2.68%) showed any server-field change. For the 6,528 transitions where standard tiebreak rotation predicts a change, 6,293 (96.4%) showed no change. For the 6,724 transitions where rotation predicts a hold, 6,604 (98.2%) showed a hold.

The public sample data dictionary describes `server` as the player serving at a state. The current API reference further warns that tiebreak server rows are not settled and that tiebreak serving rotation cannot be reconstructed reliably from sampled rows when points are skipped; it explicitly says to withhold server-dependent tiebreak analysis unless the encoding reconciles for the match. See [Live Tennis API data dictionary](https://github.com/livetennisapi/livetennisapi-data/blob/main/DATA_DICTIONARY.md) and [Live Tennis API full reference, HistoryTapeRow.server](https://docs.livetennisapi.com/reference.html#historytaperow).

Interpretation: the sample supports server continuity inside ordinary games, but game-boundary alignment is materially weaker and the tiebreak server field fails the expected rotation check. Do not use this field as a tiebreak server/returner feature, do not infer serve ownership from it, and do not use it to label point winners. Normal-game server use also remains research-only until game-boundary exceptions and the exact before/after state convention are hand-checked against source matches. No production feature is enabled.

## Normal-game server boundary gap audit (2026-11-21)

The June 2026 public sample shows that server-field agreement at ordinary game boundaries depends strongly on the gap between consecutive observed states. Successful run: GitHub Actions `44866428352`.

| Gap between consecutive captured states | Checked game boundaries | Server field switched | Switch rate |
|---|---:|---:|---:|
| Under 5 s | 4,185 | 1,333 | 31.9% |
| 5–15 s | 6,215 | 1,940 | 31.2% |
| 15–30 s | 10,205 | 4,116 | 40.3% |
| 30–60 s | 27,763 | 18,351 | 66.1% |
| 60–180 s | 36,910 | 31,065 | 84.2% |
| 180 s or more | 4,767 | 4,083 | 85.6% |

Across these 90,045 boundaries, 85,670 after-states (95.1%) had a 0-0 point-score reset. The rising switch rate with longer capture gaps is consistent with delayed/asynchronous updates to the server field, but the gap is only a proxy for elapsed match time and can also include unobserved points or interruptions. It does not establish which exact row owns the serve. Keep server-based point labeling and production features blocked; do not reinterpret the server field based on gap alone.

## Match tape capture-boundary coverage (2026-11-21)

A new aggregate diagnostic checks the first and last observed scoreboard states per match against the public match metadata. It counts matches whose first captured state is exactly 0-0, missing point-score fields at the first/last observed state, and whether the last observed set counters reach the number of sets required by the match format (BO3/BO5). It separates normal completions from matches with a recorded terminal event such as retirement and reports both the explicit ATP/WTA round-prefix classification and a secondary ATP/WTA player-primary-tour agreement proxy. It also separates target attainment for normal completions from terminal-event matches.

Important limitation: reaching the required set count is only a boundary-coverage proxy, not proof that the tape includes the final point. The metadata sample does not supply a verified final scoreline in the fields used by this audit. Matches that do not reach the target may be truncated, retired, or otherwise incomplete; they are never padded or treated as losses/zeros.

### Real-sample boundary coverage findings (2026-11-21)

Successful aggregate-only run: GitHub Actions `44866625208` (June 2026 public sample, 5,380 matches).

- Only 212/5,380 tapes (3.94%) begin at the exact 0-0 match-start state. 5,168 begin after the match has already progressed.
- 431 first observed states (8.0%) have at least one missing point-score field; 60 last observed states (1.1%) have a missing point-score field.
- Among 5,226 matches with no recorded terminal event, 3,969 (75.96%) reach the BO3/BO5 required set count in their last observed state; 1,257 (24.04%) do not. This is a coverage proxy, not proof of final-point capture.
- Using agreement between both players' primary tour labels as a secondary ATP/WTA proxy: ATP has 2,062 matches (89 begin at 0-0; 1,501/2,004 normal completions reach the set target, 74.90%); WTA has 1,684 matches (67 begin at 0-0; 1,203/1,637 normal completions reach the target, 73.49%). 1,634 matches have no same-tour player agreement and remain unclassified by this proxy.

Interpretation: this sample is suitable for testing score-state transitions within observed tape segments, but not for assuming complete match histories. Opening coverage is especially sparse; nearly one quarter of normal-completion tapes do not reach the required set count. Never use these tapes as complete-match point sequences without an independently verified completeness gate. The sample's aggregate 77% monthly match coverage must not be confused with per-match tape completeness.

## Score/flag anomaly proximity and value-pattern audit (2026-11-21)

The adjacent-state check measures distances 1–5 in both directions within each match's observed row order. It reports previous/next tiebreak proximity for numeric scores carrying a normal-game flag, proximity to a normal-game state for alphabetic scores carrying a tiebreak flag, and aggregate score-value/pair frequencies. These are diagnostic counts only: no flags or score values are rewritten, and proximity is not proof of a flag delay or a point outcome.

### First real-sample proximity results (2026-11-21)

Successful aggregate-only run: GitHub Actions `44866399882` on the 951,064-state June 2026 public sample.

- The 504 normal-flag numeric anomalies contained 931 numeric player-side values: 1 (150), 2 (145), 3 (145), 4 (153), 5 (147), 6 (83), 7 (43), 8 (43), 9 (22).
- Opposite-flag numeric tiebreak states appeared exactly 1, 2, 3, 4 or 5 rows away from 112, 99, 130, 120 and 155 anomalous states respectively; counts may overlap. At distance 1, 65 were preceded by a tiebreak state and 93 were followed by one.
- The 43 alphabetic tiebreak-flag anomalies consisted of 29 `A` and 14 `AD` player-side values; score pairs were `40:A` (11), `A:40` (18), `AD:40` (9), and `40:AD` (5).
- A recognized normal-game state appeared exactly 1–5 rows away from 37, 38, 38, 43 and 41 of these alphabetic anomalies respectively.

Interpretation: anomaly patterns are not confined to a single adjacent row. Row proximity cannot distinguish delayed flag updates from malformed or partial snapshots. No automatic correction is justified; keep all non-missing mismatches excluded from point-winner inference until individual sequences can be validated against a trustworthy complete source.

## Strict observed-tape candidate subset

A conservative diagnostic subset is now counted for parser inspection. A match qualifies only when metadata identifies BO3/BO5, the recorded completion has no terminal-event marker, the first observed state is exact 0-0, the last observed set counters reach the format's required set count, every point-score pair is present and consistent with its normal/tiebreak flag, and all row timestamps are present and strictly increasing. This is still a candidate subset, not proof of full or correct capture.

For qualifying matches, the audit reports inferred vs ambiguous adjacent transitions and ambiguous reasons, split by ATP/WTA round prefix and player-primary-tour agreement. Parser inference is not part of the candidate gate: ambiguous transitions remain counted rather than discarded, avoiding selection on the model's own output. No point winners are inferred from missing or counter-only transitions.
