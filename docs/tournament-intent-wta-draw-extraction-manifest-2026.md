# WTA main-draw extraction manifest — 21 September to 21 November 2026

**Status:** official draw URLs resolved; bracket-slot baseline calculated; match-by-match extraction and pre-event ranking join are not complete. Do not describe the totals below as played-match counts or eligible top-150 observations.

## Inclusion scope

WTA Tour-level singles main draws whose match dates fall in the study window, plus WTA Finals. Qualifying and doubles are excluded. The official WTA preview identifies ten tour-level Asian Swing events from 21 September through 8 November. WTA Finals is separately included.

## Official draw register

| Event | Dates | Tier | Singles draw | Main-draw bracket slots* | Official draw |
|---|---|---:|---:|---:|---|
| Singapore | 21–27 Sep | WTA 500 | 28 | 27 | https://www.wtatennis.com/tournaments/1152/singapore/2026/draws |
| Seoul | 21–27 Sep | WTA 250 | 32 | 31 | https://www.wtatennis.com/tournaments/1024/seoul/2026/draws |
| Beijing | 29 Sep–11 Oct | WTA 1000 | 96 | 95 | https://www.wtatennis.com/tournaments/1020/beijing/2026/draws |
| Wuhan | 12–18 Oct | WTA 1000 | 56 | 55 | https://www.wtatennis.com/tournaments/wuhan-open/draws |
| Ningbo | 19–25 Oct | WTA 500 | 28 | 27 | https://www.wtatennis.com/tournaments/2092/ningbo/2026/draws |
| Osaka | 19–25 Oct | WTA 250 | 32 | 31 | https://www.wtatennis.com/tournaments/405/osaka/2026/draws |
| Tokyo | 26 Oct–1 Nov | WTA 500 | 28 | 27 | https://www.wtatennis.com/tournaments/1056/tokyo/2026/draws |
| Guangzhou | 26 Oct–1 Nov | WTA 250 | 32 | 31 | https://www.wtatennis.com/tournaments/1023/guangzhou/2026/draws |
| Chennai | 2–8 Nov | WTA 250 | 32 | 31 | https://www.wtatennis.com/tournaments/1148/chennai/2026/draws |
| Hong Kong | 2–8 Nov | WTA 250 | 32 | 31 | https://www.wtatennis.com/tournaments/1074/hong-kong/2026/draws |
| WTA Finals, Indian Wells | 8–15 Nov | Finals | 8 singles | 15 planned singles matches | https://www.wtatennis.com/tournaments/wta-finals/draws |

*For a completed single-elimination draw, bracket slots are draw size minus one. This is a structural count, not a count of matches actually played: walkovers, withdrawals, retirements, abandoned matches and unplayed slots must be resolved from the match records. For WTA Finals, 15 is the planned singles format (12 round-robin + 2 semifinals + final), not an asserted actual count.

## Preliminary structural arithmetic

- Ten WTA Tour-level event draws: **386 main-draw bracket slots**.
- WTA Finals: **15 planned singles slots**.
- Combined planning baseline: **401 bracket slots**.

This is only a draw-structure denominator. It is **not** the final retrospective sample because:
1. the study counts matches actually played in the date window, not merely bracket slots;
2. withdrawals and walkovers must be distinguished from played matches;
3. each player must be checked against the last official WTA ranking published before the event;
4. the eligible unit is a player–match observation for top-150 players, not a match slot;
5. both participants must be assessed symmetrically.

## Source basis

- WTA official Asian Swing preview (17 September 2026), which lists the ten tour-level events and gives the draw sizes for the events: https://www.wtatennis.com/news/4576359/asian-swing-2026-preview-dates-draws-prize-money-and-everything-you-need-to-know
- Official WTA Finals overview and dates (8–15 November 2026): https://www.wtatennis.com/tournaments/wta-finals
- Official draw pages listed individually above.

## Next extraction steps

1. Extract singles match rows from each official draw, excluding doubles and qualifying.
2. Resolve match date and status (played, retirement, walkover, cancelled, not played).
3. Keep only match start dates from 2026-09-21 through 2026-11-21 inclusive.
4. Join both players to the last official WTA ranking snapshot published before the event began.
5. Emit one row per eligible player per played match, with stable event/player/match identifiers.
6. Publish counts by event: bracket slots, played matches, walkovers/unplayed, eligible matches, eligible player–match observations, and ranking-join failures.
7. Freeze this denominator before searching for statements or other intent evidence.

## Explicit exclusions

- Jiangxi Open / Jiujiang: not a 2026 event in this window. The WTA says it was replaced by Athens Open in 2026; Athens was held in July and is outside this window.
- Athens Open: outside the 21 September–21 November period.
- Singapore and Seoul are included: both are explicitly listed for 21–27 September in the WTA's 2026 preview.
- Challenger, WTA 125, ITF, qualifying, doubles and team events are outside this WTA main-draw manifest and require separate declared strata.
