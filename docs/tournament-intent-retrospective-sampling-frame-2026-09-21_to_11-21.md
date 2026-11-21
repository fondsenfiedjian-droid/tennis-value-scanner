# Retrospective sampling frame — 21 September to 21 November 2026

Status: predeclared event-level frame for systematic retrospective discovery. This is not a completed match sample and contains no player-intent labels.

## Research question

Across a fixed two-month period, how often can a reviewer locate public statements that distinguish (a) preparation/match-rhythm objectives, (b) cautious return or recovery management, (c) explicit priority for a later event, and (d) explicit commitment to the current event?

The study does **not** assume that preparation objectives imply low effort or low intent to win. It does not estimate private motivation.

## Cutoff and temporal handling

- Calendar window: 2026-09-21 through 2026-11-21 inclusive.
- Eligible observations: singles matches played inside the window at the events listed below.
- For a match-level record, include each player who was in the top 150 on the last official ranking snapshot published before that event began.
- Keep ATP and WTA separate; record ranking bands 1–50, 51–100 and 101–150.
- For each match, assess both players symmetrically.
- Team competitions (Davis Cup, Billie Jean King Cup and Laver Cup) are excluded from this individual-event frame; their team-selection and national-duty incentives require a separate protocol.
- A tournament crossing the date boundary contributes only matches played within the window. The ATP Finals is treated this way: matches through 21 November are eligible; the 22 November final is outside the window.
- Do not select observations based on match outcome, retirement, upset, or whether a player later made an interesting statement.

## Event frame

This list is derived from the published 2026 ATP and WTA calendars and official tournament pages. It is the event frame, not proof that every draw/result has already been extracted.

### ATP

| Event | Scheduled period / calendar week | Tier |
|---|---|---|
| Chengdu Open | 23–29 Sep | ATP 250 |
| Hangzhou Open | 23–29 Sep | ATP 250 |
| China Open, Beijing | 30 Sep–6 Oct | ATP 500 |
| Japan Open, Tokyo | 30 Sep–6 Oct | ATP 500 |
| Rolex Shanghai Masters | 7–18 Oct | Masters 1000 |
| Almaty Open | week of 19 Oct | ATP 250 |
| European Open, Brussels | week of 19 Oct | ATP 250 |
| Grand Prix Auvergne-Rhône-Alpes, Lyon | week of 19 Oct | ATP 250 |
| Erste Bank Open, Vienna | week of 26 Oct | ATP 500 |
| Swiss Indoors Basel | week of 26 Oct | ATP 500 |
| Rolex Paris Masters | November calendar week | Masters 1000 |
| Stockholm Open | November calendar week | ATP 250 |
| Nitto ATP Finals | 15–22 Nov; include matches through 21 Nov only | Finals |

### WTA

| Event | Scheduled period / calendar week | Tier |
|---|---|---|
| Singapore Tennis Open | 21–27 Sep | WTA 250 |
| Korea Open, Seoul | 21–27 Sep | WTA 500 |
| China Open, Beijing | 29 Sep–11 Oct (calendar weeks 39–40) | WTA 1000 |
| Wuhan Open | 12–18 Oct | WTA 1000 |
| Ningbo Open | 19–25 Oct | WTA 500 |
| Kinoshita Group Japan Open, Osaka | 19–25 Oct | WTA 250 |
| Toray Pan Pacific Open, Tokyo | 26 Oct–1 Nov | WTA 500 |
| Guangzhou Open | 26 Oct–1 Nov | WTA 250 |
| Chennai Open | 2–8 Nov | WTA 250 |
| Prudential Hong Kong Tennis Open | 2–8 Nov | WTA 250 |
| Jiangxi Open, Jiujiang | November calendar week | WTA 250 |
| WTA Finals | 7–14 Nov | Finals |

## Match-list construction — required before source review

1. Retrieve official singles draws and completed match results for every event above.
2. Preserve event name, tour, round, match date/time and official match identifier.
3. Join each player to the ranking snapshot published before the event; do not use end-of-event or current rankings.
4. Exclude doubles, qualifying unless explicitly added in a separately declared stratum, exhibitions and team competitions.
5. Deduplicate player–match rows by official match identifier plus player identifier.
6. Publish counts before reviewing interviews: events found, matches found, eligible player–match observations, exclusions and missing identifiers.
7. If official draw/results cannot be retrieved for an event, record it as unavailable. Do not silently replace it with a convenient event.

## Source review after the frame is frozen

For every eligible player–match, search the same source categories and order defined in `tournament-intent-pilot-protocol.md`. Record publication timestamp separately from research capture timestamp. Use the same fixed search budget for both players.

A retrospective article published before a match can be coded as a historical pre-match publication, but it must still be marked as retrospectively discovered/captured. It cannot be represented as information the live scanner had captured at that time and must not be imported into the prospective registry.

## Reporting

Report the denominator first. Break down:
- ATP/WTA and event tier;
- ranking band;
- evidence found / no evidence found / source unavailable / search incomplete;
- preparation, cautious return, schedule/recovery, later-event priority, current-event priority, mixed and unknown;
- source category and publication lead time before match;
- reviewer agreement and adjudication.

Do not report a prevalence estimate until the full match frame and all observation outcomes are accounted for. Do not change classifier weights, probabilities, EV, bet selection or Production from this retrospective study.

## Calendar sources

- ATP 2026 Media Guide / calendar PDF: https://www.atptour.com/-/media/files/media-guide/2026/2026-atp-media-guide-full.pdf
- WTA 2026 official calendar PDF: https://wtafiles.wtatennis.com/pdf/calendar/calendar.pdf
- WTA 2026 Asian swing preview and event dates: https://www.wtatennis.com/news/4576359/asian-swing-2026-preview-dates-draws-prize-money-and-everything-you-need-to-know
- WTA Tokyo 2026 official event page: https://www.wtatennis.com/tournaments/1056/Tokyo/2026/
- WTA Hong Kong 2026 official event page: https://www.wtatennis.com/tournaments/1074/prudential-hong-kong-tennis-open/2026/

Calendar pages can be revised; when extracting draws, retain the actual official event page and date accessed for each event. The list above should be reconciled against the source event pages before the final denominator is frozen.
