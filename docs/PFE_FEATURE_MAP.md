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


## Aggregate-family codebook: verified mappings

The following mappings were checked against the pinned source CSVs and the extracted MatchChart 0.3.2 workbook. “Verified” here means the row orientation/category and arithmetic are supported by source examples/formulas; it does not establish predictive value or population representativeness.

### Overview — player and set orientation verified

- Each row belongs to the named `player`; `set=Total` is the whole-match aggregate and numeric set values are per-set rows.
- Verified fields: `serve_pts`, `aces`, `dfs`, `first_in`, `first_won`, `second_in`, `second_won`, `bk_pts`, `bp_saved`, `return_pts`, `return_pts_won`, winners and unforced-error splits.
- Safe candidate rates, when denominators are positive: first-serve-in = `first_in / serve_pts`; first-serve points won = `first_won / first_in`; second-serve points won = `second_won / second_in`; service points won = `(first_won + second_won) / serve_pts`; break points saved = `bp_saved / bk_pts`; return points won = `return_pts_won / return_pts`.
- The workbook MatchStats formulas independently confirm the service-point and first/second-serve denominators. Do not calculate second-serve rate with `second_in` as the denominator for second serves played; `second_in` is the number of second serves in, whereas the workbook's second-serve-points denominator is second-serve points played (service points minus first serves in).

### ServeBasics — player perspective and first/second serve rows verified

- `player` identifies the player; `row=1` is first-serve points, `row=2` is second-serve points, and `row=Total` is all service points. This is consistent with the workbook's first/second-serve definitions and the source arithmetic (the 1 and 2 point counts sum to Total in checked examples).
- `pts` and `pts_won` provide the natural denominator/numerator for serve-point win rate within each row. `aces`, `unret`, `forced_err` and `pts_won_lte_3_shots` are counts, not percentages.
- `wide`, `body`, and `t` are directional serve counts. Treat them as descriptive counts only until the source's direction denominator and treatment of first-serve faults are tested across the full file.

### Additional aggregate families — source-level arithmetic checks

- **ShotDirection:** the literal rows are `Total`, `F`, `B`, and `S`. Across 14,842 ATP player-match groups containing all four rows, each of the five direction columns in F+B+S summed exactly to Total (zero mismatches). This validates the row partition arithmetic, but the exact interpretation of `S` and the mapping from each aggregate direction bucket to an opponent-specific tactical pattern still require codebook review. Treat the categories as descriptive only.
- **SnV:** rows `SnV` and `nonSnV` have first-/second-serve subdivisions `SnV1st`, `SnV2nd`, `nonSnV1st`, `nonSnV2nd`. In 3,623 ATP player-match groups with all six rows, every reported count column in the first/second subdivisions summed exactly to its corresponding SnV/nonSnV row. This confirms the internal split, not the denominator for a whole-match frequency; missing/uncategorized points remain possible. A candidate within-category win rate is `pts_won / snv_pts`, with a sample-size gate.
- **ServeDirection:** row labels `1` and `2` correspond to first-/second-serve point categories. Direction columns are deuce/ad-court wide/middle/T. Across 15,087 ATP player-match groups, direction counts did not always equal ServeBasics point counts (620 mismatches), so direction shares must not use ServeBasics `pts` as an assumed denominator. Error columns are separate fault counts and are not added to in-play direction totals.
- **ServeInfluence:** row labels `1` and `2` are first-/second-serve categories, but its `pts` denominator did not consistently match ServeBasics point counts. The `won_1+` … `won_10+` percentage thresholds remain unmapped; do not treat them as simple point-win rates.
- **SvBreakSplit/SvBreakTotal:** workbook notation verifies serve direction codes 4=wide, 5=body, 6=T; the CSV row inventory also includes `d`/`a` and intersections such as `4d`/`4a`. These rows are overlapping slices, not additive partitions. Their first-/second-serve denominators and court-side intersection must be tested before feature calculation.

### Rally — explicit Player1/Player2 orientation verified; subrows partly decoded

- The file identifies `server` and `returner` by name. `pl1_*` and `pl2_*` are match Player1/Player2 fields; in the workbook Player1 is the player who served first in the match. Do not reinterpret pl1/pl2 as current server/returner.
- `row=Total` is the whole-match rally aggregate; `1-3`, `4-6`, `7-9`, and `10` are rally-length buckets. The workbook counts shots including the serve and excludes errors, so do not equate these bins with number of post-serve groundstrokes.
- Suffix rows such as `1-3-1`, `1-3-2` remain unmapped until their additional dimension is independently verified. Exclude them from features rather than guessing.

### Still blocked pending family-specific verification

ReturnDepth, ReturnOutcomes, ShotTypes, ShotDirection, ServeDirection, ServeInfluence, NetPoints, KeyPointsReturn, KeyPointsServe, ShotDirOutcomes, SnV, SvBreakSplit and SvBreakTotal have been inspected for schema and literal category values, but their row orientation, category intersections and/or denominators are not yet sufficiently verified for player features. In particular:
- Return-depth codes 7/8/9 in the point notation describe return landing depth (service boxes / mid-court / near baseline); that does not automatically decode every aggregate `row` label such as `89`, `4D` or `v1st`.
- Key-point labels and serve/break split labels must not be treated as mutually exclusive or additive without formula-level checks.
- Serve-direction counts need a validated attempt denominator; serve-in and error columns may represent different populations.
- Shot-direction and shot-type counts may overlap at point-ending shots and serve returns; do not sum them as if they partition all strokes.

No aggregate-family feature is production-enabled. The next implementation stage is a row-code/denominator audit using source match reports and workbook formulas, followed by exact prior-match linkage and chronological testing.

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

## Grand Slam point-by-point audit findings

Grand Slam point-by-point audit results: 49 events, 10,513 match metadata IDs, 1,922,136 point rows; 10,508 metadata matches have point data, zero orphan point IDs, five matches without point rows. Player names are 99.84% complete, but winner/status/event/round/court/player IDs are populated in only 8.16% of rows on average. Candidate availability: Speed_KMH 95.20% (47 events; 24.78% zeros), Speed_MPH 85.52% (43 events; 25.75% zeros), RallyCount 63.55% (28 events), distance run 52.49% (24 events), ServeDepth/ServeWidth 33.90% (20 events), ReturnDepth 28.35% (20 events). Zero values and field definitions require event-specific validation; no production feature activation.

## Slam match-to-results linkage

A separate exact-linkage audit connects Slam match metadata to ATP/WTA main-tour results using normalized full player-name pairs, Slam and year. It accepts only unique links and reports ambiguity, unmatched pairs, missing names and round conflicts. The linked tournament date is the event-week date, not the exact match date; within-event chronology remains unproven. No linked player-level data is retained and no features are production-enabled.


## Grand Slam metadata linkage audit

A research-only audit linked the 49 event metadata files (2011–2024) to ATP/WTA main-tour results from the same pinned archive. Initial aggregate result: 10,110 of 10,513 metadata rows linked (96.16%); 8,048 by normalized full names and 2,062 by unique initial-surname aliases; 371 unmatched named rows split into 330 with at least one player alias absent from the event result roster and 41 with an ambiguous initial-surname alias; no pair was ambiguously linked after unique-only resolution. A further 32 rows lack player names, and 636 available winner cross-checks had zero mismatches. Winner fields are absent in much of the metadata, so this is not a universal winner validation. Event dates in Sackmann results are tournament-week dates, not match-specific dates; they cannot establish within-event match order. Alias-based links are weaker than full-name links and must remain separately tagged. No player-level linked dataset is retained and no feature is enabled.


## Live Tennis API point-state feature candidates (research only)

The Live Tennis API academic dataset records scoreboard states rather than strokes. A point outcome can be inferred from the transition between consecutive states in the same match, but the public sample may begin mid-match or stop before the final point. The `server` field is recorded at each state; its exact alignment to the transition must be validated before attributing the point to a server. The public sample does not contain the external Sackmann player-ID crosswalk in version 1.0.3.

Potential derived signals, after transition validation:
- Serve-point win rate and return-point win rate, separately by tour and surface.
- Hold/break and tiebreak performance, with denominators and sample sizes.
- Deciding-set and high-pressure score-state outcomes, with strong shrinkage toward tour/surface baselines.
- Live score-state features (sets, games, points, server, tiebreak flag) for a separate in-play probability model.

Research safeguards:
1. Reconstruct outcomes only from consecutive states in capture order; do not treat rows as individual point results.
2. Validate point transitions for standard games, deuce/advantage, tiebreaks, set changes, missing states and service changes against hand-checked matches.
3. Retain match-level observed coverage: tape start state, final state, observed duration/points, and whether the full match is present. Do not extrapolate missing segments as losses or zeros.
4. Keep live-observed and post-match reconstructed provenance separate. Public sample contains observed rows only; reconstructed history is not part of the public deposit.
5. For pre-match features, aggregate only matches completed before the target match start. For same-event matches, require reliable match-specific timestamps/order; otherwise exclude same-event history.
6. Require minimum prior match/point counts, shrink sparse player estimates, and test on untouched chronological holdouts.
7. Keep ATP, WTA, Challenger and ITF populations separate until tier-specific calibration and transitions are validated.

These candidates are not shot-style or serve-speed features: the dataset explicitly has no serve speed, serve direction or shot-level fields. No production PFE feature is enabled.


## Match Charting linkage to historical results

A new research-only audit links MCP ATP/WTA metadata to the pinned Sackmann result archive: all 118 ATP/WTA main-tour annual files (1968–2026) plus 144 ATP/WTA Futures, Challenger/qualifying and ITF/qualifying files. It accepts only a unique exact normalized full-name pair, tour, year, event (with a small explicit alias table) and round. Each accepted link is classified by source tier. Initials, fuzzy names and ambiguous candidates are never accepted. The result file's `tourney_date` is treated only as a tournament-week date; the MCP metadata `Date` is the charted match date. Their offset is a diagnostic, not proof of match order within an event.

The audit emits aggregate counts only: unique metadata IDs, exact unique links by source tier, ambiguous candidates, round conflicts, event-name mismatches, pairs absent from that year, and date-quality/offset diagnostics. Negative match-date offsets and offsets over 21 days are flagged separately; an exact name/event/round match with a date anomaly is not automatically considered chronology-safe.

The completed full-history audit (all 118 main-tour annual files, 1968–2026, plus 144 lower-tier files) linked 10,671 of 11,822 unique MCP metadata IDs (90.26%): ATP 7,045/7,565 (93.13%) and WTA 3,626/4,257 (85.18%). By source tier, 10,193 links were main-tour, 401 ATP Challenger/qualifying, 5 ATP Futures, and 72 WTA ITF/qualifying. There were zero ambiguous exact candidates, 50 round conflicts, 830 event mismatches and 271 pairs with no candidate in the archive. There were zero ambiguous exact candidates, 44 round conflicts and 627 event-name mismatches. A further 3,125 player pairs had no candidate in that year's supplied archive. These figures show the benefit of adding lower-tier databases, but the unmatched pool is not automatically evidence of missing records.

Date diagnostics flagged 282 links where the MCP match date precedes the Sackmann event-week date, plus 11 offsets greater than 21 days. The remaining 10,378 linked records have offsets from 0 to 21 days, but this is only a chronology plausibility check, not proof of exact within-event order. Large outliers remain (minimum -261 days for WTA; maximum +361 days for ATP) and require separate source review. Do not use these links for rolling pre-match features until date anomalies are resolved and match chronology is proven.
 It does not write player names, match IDs or player-level linked data. Raw files exist only on the ephemeral CI runner. The MCP and archive sources declare CC BY-NC-SA 4.0; use remains non-commercial and attribution/share-alike obligations apply.

Even a successful match link does not make the charted match representative or authorize a model feature. Before rolling PFE features are calculated, the linked sample must be assessed for charting date, event/tour coverage, metadata anomalies, duplicate match IDs, and match chronology. Same-event prior-match ordering is not inferred from Sackmann tournament-week dates.
