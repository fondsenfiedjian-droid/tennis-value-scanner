# PFE research feature map

Status: research specification only. No feature in this document is enabled in production.

## Source and limits

The Match Charting Project is a selectively charted, contributor-created sample, not a census of ATP/WTA matches. Its source repository declares CC BY-NC-SA 4.0. Raw CSVs and player-level derived datasets must not be committed to this public repository; commercial use requires separate permission. The audit downloads source files only to an ephemeral runner and retains aggregate diagnostics.

The completed audit found 7,565 ATP and 4,257 WTA unique metadata IDs. All sixteen audited stat families per tour have 100% unique-ID join coverage against the metadata IDs represented in that family. This is an ID-join check, not a claim of complete fields or representative calendar coverage. The full audit contains 3,088,549 aggregate-stat rows across 11,822 unique charted match IDs. SnV is sparse (6,327 ATP and 1,078 WTA unique matches), so any SnV feature needs a separate coverage gate. This means IDs join; it does not mean every field is complete or every tour match is represented. Metadata quality flags are review-required: 1 repeated ATP metadata ID and 7 repeated WTA IDs; unexpected surface values in 2 ATP/9 WTA rows; unexpected handedness values in 2 ATP/8 WTA rows; 1 invalid ATP date, 8 invalid WTA dates and 10 missing WTA dates. The earliest valid ATP date is 1960-05-29 and needs source verification. Unexpected categorical values include numeric codes, umpire names, date-like strings and tournament labels in columns expected to hold surface or handedness, suggesting possible field contamination. Do not use metadata surface, handedness or date fields as modelling features until source anomalies are resolved.

## Source field semantics verified from the pinned data dictionary

The point-level dictionary defines the orientation needed for safe player-level aggregation:
- Player1 is always the player who served first in the match; Player2 is the opponent.
- `Svr` and `Ret` identify Player1 or Player2 for the serving/returning role on each point.
- `PtWinner` identifies the point winner as Player1 or Player2; `isSvrWinner` records whether the server won.
- `rallyCount` counts shots including the serve and excluding errors.
- `1st` and `2nd` hold coded serve/shot sequences; convenience columns such as `isAce`, `isForced`, `isUnforced`, and `1stSV` are derived from those codes.

These semantics are useful for point-level reconstruction, but they do not by themselves define the row orientation or denominator of every aggregate-stat CSV. The MatchChart workbook's Instructions tab must be decoded before turning aggregate row codes into player-specific rates. Never assume that “player 1” in a stats row means the match metadata's first-listed player; verify the key and direction for each family.

## Workbook mappings verified

The pinned workbook confirms the following internal point-level fields in its MATCH sheet:
- `K` = server identity (1 or 2); `L` = returner identity; `N/O` = first/second-serve code.
- `W/X` = first/second serve in; `AD` = ace; `AE` = unreturnable; `AF` = rally winner; `AG` = forced error; `AH` = unforced error; `AI` = double fault.
- `AN` = point winner; `AO` = server won point; `AY` = rally shot count.
- `S/T` indicate first/second-serve-and-volley attempts in the workbook's calculated columns.

The MatchStats formulas verify these denominators for the workbook's own per-match summary:
- First-serve-in rate = first serves in / service points.
- First-serve points won = first-serve-in points won by that server / first serves in.
- Second-serve points won = second-serve points won by that server / second-serve points played (first serve out).
- Service-points won = first-serve points won + second-serve points won.
- Aces are counted for the point winner; double faults are assigned to the server who lost the point.
- Rally winners are counted separately from aces; the workbook's total-winner figure adds both.
- Unforced errors include the unforced-error and double-fault flags for the player who lost the point.
- Rally-length buckets use `AY`: 0–4 shots, 5–9 shots, and 10+ shots.

The Instructions sheet defines shot-direction codes relative to the opponent's handedness: 1 = right-hander forehand/left-hander backhand side, 2 = middle, 3 = right-hander backhand/left-hander forehand side. Return-depth codes 7/8/9 distinguish shallow, medium and deep returns. These labels are not direct player-handedness features. The aggregate CSV files still require family-specific row-orientation and category validation before these formulas can be applied to them.

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

## Observed aggregate `row` code inventory (labels only)

The latest ephemeral audit found these categorical values in the 16 family files. This inventory records literal labels only; it does not assign meanings where the workbook has not verified them.

- Rally: `1-3`, `4-6`, `7-9`, `10`, plus suffix variants such as `1-3-1`, `1-3-2`, `10-1`, `10-2`.
- ServeBasics, ServeDirection: `1`, `2`, `Total`; ServeInfluence: `1`, `2`.
- ReturnDepth and ReturnOutcomes: mixed numeric/alphanumeric labels including `4`, `5`, `6`, `7`, `9`, `89`, `4A`, `4D`, `5A`, `5D`, `6A`, `6D`, `A`, `D`, `fh`, `bh`, `gs`, `sl`, `v1st`, `v2nd`, `Total`.
- ShotTypes: labels include `F`, `B`, `S`, `V`, `Vo`, `Hv`, `Lo`, `Dr`, `Sw`, `Ov`, `Net`, `Base`, and further letter combinations.
- ShotDirection: `F`, `B`, `S`, `Total`; ShotDirOutcomes: combinations such as `F-XC`, `F-DTL`, `B-XC`, `B-DTL`, `S-XC`, `S-DTM`, `F-IO`, `F-II`.
- NetPoints: `Approach`, `ApproachRallies`, `NetPoints`, `NetPointsRallies`.
- KeyPointsReturn: `BPO`, `DeuceR`, `GPF`, `RTotal`; KeyPointsServe: `BP`, `Deuce`, `GP`, `STotal`.
- SnV: `SnV`, `nonSnV`, `SnV1st`, `SnV2nd`, `nonSnV1st`, `nonSnV2nd`.
- SvBreakSplit and SvBreakTotal: numeric serve-direction labels and combinations such as `4a`, `4d`, `5a`, `5d`, `6a`, `6d`, plus `a` and `d`.

Next step: map each literal code to the correct workbook formula/category and verify player perspective and denominator. Do not convert these strings into features by guesswork.

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
- Use the extracted workbook codebook to map literal row categories and validate each aggregate family's player perspective and denominators.
- Create a research-only match-linkage audit; report exact, ambiguous and unmatched joins.
- Only then calculate candidate rolling player features and run a walk-forward comparison.

## Workbook codebook acquisition

The aggregate CSV field names are not sufficient to infer row orientation or category codes. A separate CI workflow now downloads the pinned `MatchChart 0.3.2.xlsm` workbook into an ephemeral runner and extracts the Instructions, MatchStats, and Tables sheets plus the first 18 rows of MATCH and Points (column maps and first calculated point row), including formulas and cached values where available, as a seven-day artifact. The raw workbook is not committed or retained. The extracted codebook sheets must be reviewed before any row-code mapping, player-perspective assumption, or denominator is accepted. Source attribution and CC BY-NC-SA 4.0 terms accompany the extraction.


## Lower-tier history research

A pinned aggregate-only audit covers 144 ATP Futures, ATP Challenger/qualifying, and WTA ITF/qualifying CSVs. It found 1,336,767 completed source rows and 1,325,071 unique natural match identities. WTA ITF/qualifying contains 11,696 exact duplicate groups and zero conflicting groups. Both-player core serve-stat coverage is 57.52% for ATP Challenger/qualifying, 4.84% for ATP Futures, and 8.99% for WTA ITF/qualifying. These are separate competitive populations; do not merge into the main-tour Elo stream until tier-aware rating transitions pass chronological holdout tests.

## Grand Slam point-by-point source

A pinned audit covers 49 singles Slam event pairs (2011–2024; 98 files). Candidate fields include serve speed, rally length, distance run, serve depth and return depth. Coverage is selective and varies by event/year; zero values may be sentinels. Do not use these fields as production player features until missingness/sentinel semantics, event-specific denominators, prior-match-only aggregation and chronological holdouts are validated.
