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

The parser and synthetic tests are implemented, but no public sample file has been downloaded or imported in this pass. The parser is not production-connected and does not create player-level features. The dataset has no serve speed, serve direction or shot-level information.

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
