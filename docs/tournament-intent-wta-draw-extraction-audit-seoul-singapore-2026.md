# WTA draw extraction audit — Seoul and Singapore, 2026

**Study window:** 2026-09-21 through 2026-11-21  
**Audit status:** partial manual extraction from official WTA singles-draw pages. This is not a frozen match denominator and must not be used for prevalence or predictive claims.

## Source pages inspected

- Korea Open, Seoul, singles draw: https://www.wtatennis.com/tournaments/1024/Seoul/2026/draws
- Singapore Tennis Open, singles draw: https://www.wtatennis.com/tournaments/1152/singapore-tennis-open-presented-by-bnp-paribas-singapore-sgp/2026/draws

## What the pages expose

| Event | Main-draw bracket slots | Score-bearing match rows visible | Explicit walkovers visible | Unresolved / incomplete |
|---|---:|---:|---:|---|
| Korea Open, Seoul | 31 | 24 (16 R32 + 8 R16) | 0 explicitly visible in those rows | 7 later-round slots have no scores in the extracted page view (4 QF, 2 SF, final) |
| Singapore Tennis Open | 27 | 24 (12 R32 + 7 R16 + 4 QF + 1 SF) | 2 (Mertens WO in R16; Gibson WO in SF) | Final slot has no score; draw view does not expose exact match dates |

Counts above describe only the visible official draw-page rendering at audit time. They are not certified played-match counts. In particular, a score-bearing row is not enough to classify retirement versus completed match unless the official match record explicitly gives the status. A walkover is not a played match and must not generate a player–match observation.

## Specific extraction observations

### Seoul
- Singles draw has 32 entrants and 31 bracket slots.
- The official page visibly provides scorelines for all 16 Round-of-32 matchups and all 8 Round-of-16 matchups.
- The four quarterfinal, two semifinal and final slots are present but blank in the accessible page rendering.
- Therefore 24 score-bearing rows are confirmed as visible; the remaining seven slots are unresolved from this source view.

### Singapore
- Singles draw has 28 entrants and 27 bracket slots, with four first-round BYEs. BYE advances are not matches.
- The page visibly provides 12 score-bearing first-round matchups, seven score-bearing Round-of-16 matchups, four quarterfinal scorelines and one semifinal scoreline.
- The page explicitly marks Elise Mertens' Round-of-16 advance as WO and Talia Gibson's semifinal advance as WO. Neither is a played match.
- The final is shown as an empty slot despite the event being marked Completed in the event header.
- Thus the visible page does not fully reconcile the tournament bracket.

## Why no top-150 denominator is reported

The draw pages do not supply the required ranking snapshot for each entrant as of the last official ranking published before the event began. The accessible rendering also does not expose reliable individual match dates or complete status metadata. No player–match observation is marked eligible until those fields are joined and verified.

## Required next data sources / actions

1. Obtain official WTA match-level results with stable match identifiers, date/time and status for both events.
2. Resolve the incomplete late-round slots and explicitly distinguish played, retirement, walkover, cancelled and unplayed.
3. Retrieve the official pre-event ranking snapshot for each tournament.
4. Join each player to that snapshot and retain only top-150 players.
5. Create one row per eligible player per played match, deduplicated by official match ID + player ID.
6. Repeat for the remaining eight WTA events and WTA Finals before freezing the WTA denominator.

## Research safeguards

- Do not infer player intent from a scoreline, retirement, upset or tournament progression.
- Do not count BYEs or walkovers as played matches.
- Do not silently fill missing dates, rankings or outcomes from current rankings or later information.
- Keep ATP, WTA, Challenger, WTA 125 and ITF strata separate.
- No model probability, EV, bet-selection or Production changes are authorized by this audit.

## Audit conclusion

The official WTA draw pages are useful for identifying bracket structure, player pairings, visible scorelines and explicit WO markers. They are not, in their currently accessible rendering, a sufficient single source for a complete match-level denominator. The extraction pipeline must combine official draw pages with match-level results and pre-event ranking snapshots, and preserve unresolved records rather than guessing.
