# TennisData.app source assessment — Aggregator 1

Research date: 2026-11-22

## Public source facts

- Downloads page: https://tennisdata.app/downloads/
- Terms: https://tennisdata.app/terms/
- Public free ATP and WTA season CSVs are advertised for 2021–2026.
- Each season file is said to include main-tour and Challenger matches.
- Free exports advertise 49 columns; members exports advertise 65.
- The page states that each player has a persistent unique ID across seasons.
- Match winner is stored as winner_code (1 = home, 2 = away).
- The page says match-winner and first-set-winner odds are included when available, usually closing odds.
- The provider describes coverage as above 95%, while explicitly disclaiming guaranteed completeness.
- Current-season exports are said to update hourly; live matches are excluded from the current-season CSV.

## Terms review

Terms last updated 2026-11-15: https://tennisdata.app/terms/

Section 18 (Intellectual Property and Permitted Data Use) expressly permits lawful downloaded data to be stored, processed, combined, transformed and analyzed for personal, academic, research, professional or commercial purposes. It explicitly includes model training, testing and evaluation, and commercial exploitation of original derived analyses/models.

Restrictions:
- Do not redistribute, sublicense, sell, license, publicly host or otherwise make available original CSVs/raw datasets, substantial database reproductions or materially equivalent replacement datasets.
- Do not use the data as a substitute data feed/database service for third parties.
- API integration is separately subject to API plans, authentication, endpoints and usage limits.
- The permissions do not transfer third-party rights that TennisDataApp does not own or license.

Assessment: the current written terms are materially more permissive for internal research and model training than TennisMyLife and Sackmann's CC BY-NC-SA data. Any use must remain within the no-raw-redistribution and no-substitute-feed restrictions. This is a practical reading of the published terms, not legal advice.

## Access test and blocker

The public downloads page was readable through public web indexing and its documented metadata was reviewed. A non-invasive GitHub Actions request to the same public page using a standard browser user-agent returned HTTP 403 before the HTML could be retrieved. The page itself displays a JavaScript bot-check message to automated readers.

No CAPTCHA, bot protection, login, rate limit or other access control was bypassed. No guessed CSV URLs were tried, and no CSV files were downloaded. Therefore:
- no actual row counts, schemas or checksums have yet been verified;
- no ATP/WTA overlap audit has been run;
- no player-ID crosswalk has been tested.

The provider advertises filenames in the form `yyyy-atp-season.csv` and `yyyy-wta-season.csv`, but that is a filename convention, not a verified direct-download URL.

## Next authorized step

Ask TennisDataApp support for an approved direct download route or a research-use bulk export method that does not require bypassing the website's bot check. If the provider confirms a permitted method, retrieve the free 2021–2025 ATP/WTA files and run aggregate-only comparisons against Valuebetennis and Sackmann. Do not purchase a subscription or API plan without explicit user approval.

## Source citations

- Downloads and field summary: https://tennisdata.app/downloads/
- Current terms, especially Sections 6, 7, 16 and 18: https://tennisdata.app/terms/
