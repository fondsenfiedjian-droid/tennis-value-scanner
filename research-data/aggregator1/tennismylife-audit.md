# Aggregator 1 — TennisMyLife ATP linkage audit

Audit date: 2026-11-22  
Research branch: `research/aggregator1-linkage-audit`

## Scope

Compared TennisMyLife ATP annual match files for 2021–2025 with the matching Jeff Sackmann ATP annual match files. Also used the TennisMyLife `ATP_Database.csv` registry to validate source player IDs. Raw datasets were downloaded only into the GitHub Actions runner temporary directory; the workflow artifact contains aggregate JSON and checksums only.

## Verified results

The GitHub Actions run completed successfully:

- Workflow run: [45067614470](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45067614470)
- Aggregate artifact: `aggregator1-tennismylife-report`
- Report schema: 1

Across 14,668 TennisMyLife ATP match rows:

- 14,271 rows (97.29%) had at least one Sackmann candidate using exact normalized player pair, exact surface, and a date window of ±14 days.
- 13,818 rows had one candidate without further disambiguation.
- 438 additional rows were resolved by one exact score match.
- 9 additional rows were resolved by one exact tournament-name match.
- 6 rows remained ambiguous.
- 344 rows had no candidate.
- 53 rows had an unknown/unusable surface and were excluded from candidate matching.

Overall, 14,265 rows (97.25%) were resolved under these conservative rules.

## Player-ID crosswalk

- 823 distinct TennisMyLife player IDs appeared in the 2021–2025 match files.
- 774 IDs (94.05%) were linked to one or more Sackmann player IDs.
- 776 crosswalk edges were observed.
- 2 TennisMyLife IDs linked to multiple Sackmann IDs across years. These are retained as aliases rather than silently collapsed.
- 49 TennisMyLife IDs were not linked in this audit.
- No age-conflict observations remained after the age guard.
- 24 nationality-code differences and 3 registry-name differences were flagged for review; nationality codes are not used as a hard rejection because source codes can differ.

The two multi-ID cases are consistent with player identity continuity across years, but should be treated as source-ID aliasing until individually verified. This audit does not export the player-level crosswalk.

## Interpretation

TennisMyLife is a strong ATP identity bridge for the covered 2021–2025 ATP rows: its IDs can be linked to Sackmann with high coverage, and score matching resolves most remaining duplicate match candidates.

This does **not** yet demonstrate an increase in the 478,606-row Valuebetennis ↔ Sackmann linkage. The next research step is to test whether TennisMyLife's player registry names and IDs can safely normalize Valuebetennis player names and increase confirmed links without introducing false positives.

## Data-use restrictions

TennisMyLife's public terms limit use to personal, educational and non-commercial research. Commercial model training or commercial use of derived predictions requires prior written permission. Sackmann data is CC BY-NC-SA 4.0. No data from this audit has been merged into Production.

## Reproducibility

- Script: `scripts/aggregator1-tennismylife-audit.mjs`
- Synthetic fixture: `scripts/test-aggregator1-tennismylife-audit.mjs`
- Workflow: `.github/workflows/aggregator1-tennismylife.yml`
- Report artifact retention: 14 days from 2026-11-22.
