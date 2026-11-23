# TVS 2.0 scanner, comparison and settings QA

Date: 2026-11-23  
Branch: `ui/tennis-value-scanner-2`  
PR: #167 — still draft  
Scope: isolated Preview Worker and Netlify Deploy Preview only. No production merge or production deployment.

## Verified results

### Player comparison

The Preview Worker end-to-end smoke test passed:
- Player search resolved both test players.
- `POST /predict` returned two valid Elo ratings and probabilities summing to 100%.
- Both `/player-history` requests returned valid Basic history payloads.
- `/player-h2h` returned a valid H2H payload with player identity matching the requested order.

The comparison UI was hardened so the Elo result renders as soon as the core prediction returns. History and H2H load separately and cannot overwrite a newer comparison. Invalid probability/rating payloads are rejected, and missing fair odds fall back to the implied fair price instead of displaying `NaN`.

### Schedule scanner

The Live Tennis API seven-day singles window returned **323 matches across two pages**. The old UI requested only the first 200; the new UI follows `meta.has_more` and `meta.offset` until the filtered schedule is complete, with a four-page safety cap. If the cap is reached, the UI displays a partial-coverage warning instead of silently implying the schedule is complete.

The local schedule cache was bumped from `tvs-match-cache-v2` to `v3` so an old one-page cache cannot hide the newly fetched second page.

### Winamax feed

The Preview Worker read the latest successful Apify task dataset without starting a scraper run:
- 8 dataset rows;
- 8 valid decimal quotes;
- 8 quotes within the six-hour freshness window;
- newest scrape timestamp: `2026-11-23T06:13:06.000Z`.

### API quota management

The scan batch size now adapts to the saved refresh interval, reserving a bounded share of the BASIC 1,000-request daily quota for player profiles while leaving capacity for schedule pages, result checks and comparison:
- 30-minute refresh: 7 new matches per scan;
- 60-minute refresh: 14 new matches per scan;
- 180-minute refresh: 42 new matches per scan;
- auto-refresh disabled: 20 new matches on a manual scan.

Fresh cached predictions continue to be reused. The UI reports checked matches, queued matches and failed calculations.

### Settings and usability

- Theme and tournament filters preview while the settings modal is open.
- Save commits the values; Cancel restores the last saved settings.
- Missing saved fields return to the documented defaults when the modal is reopened.
- Save verifies persisted thresholds, refresh interval, theme and tournament filters.
- Returning to the app preserves the auto-refresh deadline and catches up if an update became due while the app was suspended.
- The alternate theme label now correctly describes its steel-blue palette.

## Automated checks

Latest verified regression run: **514 tests passed, 0 failed**.  
Latest Preview Worker deployment and smoke checks passed, including:
- Worker health and Live Tennis API secret presence;
- player search, Elo comparison, both Basic history calls and Basic H2H;
- complete seven-day schedule pagination;
- Winamax dataset structure and freshness diagnostics.

## Plan clarification

The current comparison does not require the $29.99 PRO tier. BASIC includes `/history/matches` and `/h2h`; current per-player Elo is available from `/players/{id}`. PRO adds the richer `/players/{id}/stats` records and other endpoints. See the provider's current plan table: https://docs.livetennisapi.com/reference.html

## Remaining manual verification

Automated checks cannot confirm the actual mobile layout and touch interaction in the user's browser. The Netlify Deploy Preview should be opened on Android to verify:
1. selecting two players and seeing the comparison card;
2. opening settings, changing a filter/theme, then testing Save and Cancel;
3. confirming the full match list and the partial-coverage warning behavior if more than four pages are ever returned.

No production code, secrets, or user data were changed.
