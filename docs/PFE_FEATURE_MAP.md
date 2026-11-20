# PFE research feature map

Status: research specification only. No feature in this document is enabled in production.

## Source and limits

The Match Charting Project is a selectively charted, contributor-created sample, not a census of ATP/WTA matches. Its source repository declares CC BY-NC-SA 4.0. Raw CSVs and player-level derived datasets must not be committed to this public repository; commercial use requires separate permission. The audit downloads source files only to an ephemeral runner and retains aggregate diagnostics.

The first audit found 7,565 ATP and 4,257 WTA unique metadata IDs. The initial ten audited stat families each had 100% unique-ID join coverage against the metadata IDs represented in the same snapshot. The expanded workflow now audits all sixteen available families. The full audit contains 3,088,549 aggregate-stat rows across 11,822 unique charted match IDs. SnV is sparse (6,327 ATP and 1,078 WTA unique matches), so any SnV feature needs a separate coverage gate. This means IDs join; it does not mean every field is complete or every tour match is represented. Metadata quality flags are currently review-required because a small number of rows contain unexpected surface/hand categories and duplicate IDs. Do not use metadata surface, handedness or date fields as modelling features until the source rows are inspected.

## Candidate features and denominators

| Signal family | Available fields | Candidate normalized feature | Caveat |
|---|---|---|---|
| Serve performance | Overview: serve_pts, aces, dfs, first_in, first_won, second_in, second_won | ace rate = aces / serve_pts; first-serve-in rate = first_in / serve_pts; first-serve win rate = first_won / first_in; second-serve win rate = second_won / second_in | Confirm field semantics against the contributor workbook before implementation; guard zero denominators |
| Return performance | Overview: return_pts, return_pts_won | return-points won rate = return_pts_won / return_pts | Depends on opponent charting completeness |
| Serve patterns | ServeBasics: pts, pts_won, aces, unret, forced_err, pts_won_lte_3_shots, wide, body, t | short-point win share = pts_won_lte_3_shots / pts; directional serve mix only after denominator semantics are verified | Wide/body/T counts need explicit data-dictionary validation |
| Return depth | ReturnDepth: returnable, shallow, deep, very_deep, error columns | deep-return share = (deep + very_deep) / returnable | Requires mutually exclusive categories and consistent totals |
| Return outcomes | ReturnOutcomes: pts, pts_won, returnable, returnable_won, in_play, in_play_won, winners, total_shots | returnable-win rate = returnable_won / returnable; in-play-win rate = in_play_won / in_play | Confirm player perspective and category overlap |
| Shot profile | ShotTypes: shots, winners, induced_forced, unforced, serve_return | winners per shot; unforced errors per shot; non-serve-return shot mix | Need decode of row/category values; not infer from column names alone |
| Shot direction | ShotDirection: crosscourt, down_middle, down_the_line, inside_out, inside_in | direction proportions after validating that categories sum to a meaningful total | Denominator not explicitly included |
| Serve direction | ServeDirection: deuce_wide/middle/t, ad_wide/middle/t, error categories | No model feature yet | File contains error totals but no obvious serve-attempt denominator |
| Serve influence | ServeInfluence: pts, won_1+ through won_10+ | No model feature yet | Threshold labels and cumulative/non-cumulative meaning must be decoded |
| Net play | NetPoints: net_pts, pts_won, net_winner, induced_forced, net_unforced, passed_at_net | net-point win rate = pts_won / net_pts | Confirm player perspective and treatment of approach/forced outcomes |
| Key points | KeyPointsServe, KeyPointsReturn | Serve/return performance on break points and other key-point classes | Decode row codes and denominator semantics first |
| Serve-and-volley | SnV | Serve-and-volley frequency and point outcome | Confirm column meanings and player perspective |
| Serve/break splits | SvBreakSplit, SvBreakTotal | Serve and break performance by match/set context | Avoid double-counting aggregate and split rows |
| Directional outcomes | ShotDirOutcomes | Direction-specific shot outcomes | Decode all row/column labels before aggregation |
| Rally outcomes | Rally: pts, pl1_won, pl1_winners/forced/unforced, pl2_won/winners/forced/unforced | Rally-length-specific win/error profile | The meaning of row codes and rally-length bins must be decoded first |

## Research protocol

1. Decode all row/category codes and denominators from the source workbook/instructions before computing features.
2. Match charted matches to the historical results archive by exact date, player pair and event where possible. Ambiguous or partial joins are excluded, not guessed.
3. For each target match, use only charted matches completed before its start. No same-day leakage unless exact match order is proven.
4. Build player features from rolling prior charted matches. Test minimum history thresholds (3, 5, 10) and shrink sparse estimates toward tour/surface baselines.
5. Compare each candidate against the same Elo/ranking/age baseline on the exact same eligible matches. Report eligible sample size and coverage, Brier score, log loss and calibration.
6. Use chronological training and untouched recent holdouts. Keep ATP and WTA separate until evidence supports pooling.
7. Reject features that help only in-sample, depend on post-match information, or reduce coverage so sharply that the apparent gain is not robust.

## Immediate next work

- Inspect and normalize metadata anomalies before attempting a charted-match join.
- Retrieve and decode the source workbook's Instructions tab and point-file schema.
- Create a research-only match-linkage audit; report exact, ambiguous and unmatched joins.
- Only then calculate candidate rolling player features and run a walk-forward comparison.

