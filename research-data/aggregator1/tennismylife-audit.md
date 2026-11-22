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

## Valuebetennis ID-bridge test

A second aggregate-only test compared the direct Valuebetennis-name linkage with a route through the TennisMyLife ATP registry and the derived TML-ID-to-Sackmann-ID aliases. It covered ATP rows from 2021–2025 only.

Verified GitHub Actions run: [45067879384](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45067879384).

- Valuebetennis ATP rows: 232,093.
- Direct normalized-name method: 11,957 resolved links (5.15%).
- TennisMyLife ID bridge: 11,882 resolved links (5.12%).
- ID bridge added new resolved links beyond direct name matching: **0**.
- All 11,882 ID-bridge links agreed with the direct-name result; no disagreements were observed.
- The ID bridge had 75 fewer resolved rows because some Valuebetennis player names/IDs did not have a complete TML-to-Sackmann crosswalk.

Conclusion: in this tested period, TennisMyLife IDs do not increase Valuebetennis-to-Sackmann match coverage. They remain useful as an independent ATP player-identity validation layer, but there is no evidence to justify adding this bridge to the production matching pipeline.

## Data-use restrictions

TennisMyLife's public terms limit use to personal, educational and non-commercial research. Commercial model training or commercial use of derived predictions requires prior written permission. Sackmann data is CC BY-NC-SA 4.0. No data from this audit has been merged into Production.

## Reproducibility

- Script: `scripts/aggregator1-tennismylife-audit.mjs`
- Synthetic fixture: `scripts/test-aggregator1-tennismylife-audit.mjs`
- Workflow: `.github/workflows/aggregator1-tennismylife.yml`
- Report artifact retention: 14 days from 2026-11-22.


## TennisMyLife WTA linkage audit

The official TennisMyLife data-file manifest confirmed WTA annual CSV files for 2021–2025. All five files were downloaded successfully from their manifest URLs. Each file contains match-level player IDs (winner_id, loser_id), names, surface, tournament date, score, rankings, and match statistics. No WTA player registry was assumed or reused from the ATP audit.

Verified GitHub Actions run: [45068973252](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45068973252). Aggregate artifact: aggregator1-wta-linkage-report.

Across 13,281 TennisMyLife WTA match rows:

- 13,224 rows had a valid date and recognized surface.
- 13,142 rows (99.38% of valid rows) had a Sackmann candidate using exact normalized player pair, exact normalized surface, and a ±14-day tournament-date window.
- 12,812 rows had exactly one candidate.
- 319 additional rows were resolved by one exact score match.
- 11 additional rows were resolved by one exact tournament-name match.
- No candidate set remained ambiguous.
- 82 valid rows had no Sackmann candidate.
- 57 rows had an unknown/unusable surface.

Overall, 13,142 rows (98.95% of all TML WTA rows) were resolved.

### WTA player-ID crosswalk

- 707 distinct TennisMyLife WTA player IDs appeared in the files.
- 696 IDs (98.44%) linked to Sackmann IDs.
- 696 crosswalk edges were observed.
- 11 IDs were not mapped.
- No ID mapped to multiple Sackmann IDs.
- No age-conflict observations remained after the 0.6-year age guard.
- 107 nationality-code differences were flagged; nationality was not used as a hard rejection criterion.

The 107 IOC differences require caution and separate quality review before treating the crosswalk as a clean identity master. The audit exports only aggregate counts, not player-level links.

### Interpretation and limitations

The TML WTA files have very high match overlap with the Sackmann WTA archive for 2021–2025. The source's own notice warns that WTA data reliability may not yet match its ATP data; high overlap demonstrates coverage and structural compatibility, not independent accuracy or completeness.

This audit does not yet test whether TML WTA IDs increase Valuebetennis-to-Sackmann linkage. That is a separate bridge test. No WTA data or crosswalk has been merged into Production.

## WTA audit reproducibility

- Script: scripts/aggregator1-wta-tnm-linkage.mjs
- Synthetic fixture: scripts/test-aggregator1-wta-tnm-linkage.mjs
- Workflow: .github/workflows/aggregator1-tennismylife-wta-audit.yml
- Report artifact retention: 14 days from 2026-11-22.


## Valuebetennis WTA ID-bridge test

The WTA workflow was extended to compare direct Valuebetennis-name linkage against a route through TML WTA player IDs and the aggregate-derived TML-ID-to-Sackmann-ID crosswalk. The test covers 2021–2025 WTA rows only.

Verified GitHub Actions run: [45069152763](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45069152763). Updated aggregate artifact: aggregator1-wta-linkage-report.

- Valuebetennis WTA rows: 165,164.
- Direct normalized-name method: 10,391 resolved links (6.29%).
- TML WTA ID bridge: 10,250 resolved links (6.21%).
- ID bridge added new resolved links beyond direct name matching: **0**.
- All 10,250 ID-bridge links agreed with direct-name results; no disagreements were observed.
- The ID bridge had 141 fewer resolved rows than direct matching.
- Both Valuebetennis names mapped unambiguously to one TML WTA ID in 38,275 rows; 126,889 rows had at least one missing or ambiguous TML name.
- Both TML IDs had a Sackmann crosswalk in 37,635 rows; one or both lacked a crosswalk in 640 rows.
- The ID route generated 220 unresolved ambiguous candidate sets.

Conclusion: as in ATP, the TML WTA ID bridge does not improve Valuebetennis-to-Sackmann linkage for 2021–2025. It is not justified as an additional matching stage in the current pipeline. The direct-name result remains preferable because it resolves more rows with the same confirmed set.

No raw WTA data or player-level crosswalk was exported. No TML data has been merged into Production. The provider's WTA reliability caveat remains relevant even though the overlap with Sackmann is high.
