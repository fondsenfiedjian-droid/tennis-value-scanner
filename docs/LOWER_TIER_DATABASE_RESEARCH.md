# Lower-tier historical tennis data audit

## Scope

This research-only audit expands the historical database beyond main-tour singles. It examines the pinned Aneeshers/tennis-sackmann-archive snapshot at commit 83733587353df8a41f2fd4f516147d5aa83f5a8d, which mirrors Jeff Sackmann's ATP/WTA datasets.

The workflow discovers and downloads the archive's 144 lower-tier/qualifying CSVs:
- ATP Futures results;
- ATP combined qualifying and Challenger results;
- WTA qualifying and ITF results.

Raw CSV files are used only on the ephemeral GitHub Actions runner. The workflow retains an aggregate-only report for 30 days; it does not commit match rows or player-level derived datasets.

## Audit measures

For each tour and source family, the report includes file/year coverage, source rows, valid dates, valid player pairs, completed score-verified matches, distinct player count, rank/age/surface coverage, core serve-stat coverage, and repeated natural-match identity groups.

## First completed audit (pinned snapshot)

| Source family | Source rows | Completed rows | Unique match identities | Distinct players | Both ranks | Both ages | Both-side core serve stats |
|---|---:|---:|---:|---:|---:|---:|---:|
| ATP Futures | 523,355 | 501,940 | 501,940 | 24,076 | 76.16% | 97.15% | 4.84% |
| ATP Challenger + qualifying | 240,471 | 232,006 | 232,006 | 10,740 | 92.89% | 98.64% | 57.52% |
| WTA ITF + qualifying | 624,475 | 602,821 | 591,125 | 27,712 | 62.42% | 91.88% | 8.99% |

The three families contain 1,336,767 completed source rows and 1,325,071 unique natural match identities after within-family deduplication. WTA ITF/qualifying has 11,696 duplicate groups; all 11,696 are exact repeated records by the audited signature, with zero conflicting groups. ATP Futures and ATP Challenger/qualifying have no repeated natural-match groups in this audit. Surface coverage is 99.76%, 100% and 99.59%, respectively.

Serve-stat availability differs sharply by level: 57.52% in ATP Challenger/qualifying, 4.84% in ATP Futures and 8.99% in WTA ITF/qualifying. Do not interpret missing lower-tier stats as poor performance; the denominator reflects source availability.

The audit deliberately does not merge these records into the existing main-tour Elo stream. Challenger, Futures, qualifying and ITF levels have different competitive populations and selection mechanisms. They need tier-aware rating transitions and chronological validation before they can improve the main-tour model.

## License and attribution

The upstream data is CC BY-NC-SA 4.0. Attribution is required, use is non-commercial only, and share-alike obligations apply. Commercial use requires separate permission. Sources: Jeff Sackmann's ATP repository https://github.com/JeffSackmann/tennis_atp and WTA repository https://github.com/JeffSackmann/tennis_wta.

## Next research step

Use the aggregate coverage report to decide which source families are sufficiently complete. Then test a separate lower-tier Elo state that feeds main-tour player priors, without treating a Futures win as equivalent to an ATP main-draw win. Compare against the current baseline on identical eligible main-tour matches and untouched chronological holdouts.
