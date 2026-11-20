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

The audit deliberately does not merge these records into the existing main-tour Elo stream. Challenger, Futures, qualifying and ITF levels have different competitive populations and selection mechanisms. They need tier-aware rating transitions and chronological validation before they can improve the main-tour model.

## License and attribution

The upstream data is CC BY-NC-SA 4.0. Attribution is required, use is non-commercial only, and share-alike obligations apply. Commercial use requires separate permission. Sources: Jeff Sackmann's ATP repository https://github.com/JeffSackmann/tennis_atp and WTA repository https://github.com/JeffSackmann/tennis_wta.

## Next research step

Use the aggregate coverage report to decide which source families are sufficiently complete. Then test a separate lower-tier Elo state that feeds main-tour player priors, without treating a Futures win as equivalent to an ATP main-draw win. Compare against the current baseline on identical eligible main-tour matches and untouched chronological holdouts.
