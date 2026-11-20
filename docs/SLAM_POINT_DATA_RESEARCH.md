# Grand Slam point-by-point research audit

## Source and scope

This research audit covers the pinned Jeff Sackmann Grand Slam point-by-point archive at commit 83733587353df8a41f2fd4f516147d5aa83f5a8d. The selected scope is singles main-draw match metadata and point files for the four Grand Slams from 2011 through 2024. The pinned archive contains 49 event pairs (98 CSV files); doubles and mixed doubles files are excluded.

The upstream README warns that coverage is selective, commonly missing first-round matches and matches on courts without tracking systems. Serve speed, first/second serve indicators, rally length, distance run, serve depth and return depth are not consistently available across years/events. In some 2018–2019 Australian/French Open records, zero serve speed and rally-length values are sentinels for missing data.

## Audit method

The workflow downloads the pinned files to an ephemeral GitHub Actions runner, processes one Slam event at a time, and retains only aggregate JSON for 30 days. It reports event/match/point counts, match-ID linkage, orphan point IDs, matches without point rows, and candidate field non-missing/zero rates across the full sample and per event. No raw point rows or player-level derived data are committed or uploaded.

## Candidate PFE signals

Potential descriptive signals include first/second serve speed, serve and return depth, rally length, distance run, and point outcomes. These fields are not approved for production. Zero values may be sentinels; field names and availability differ by tournament and year. Missing values must remain missing, and all candidate features require event-specific denominator validation, prior-match-only player aggregation, coverage thresholds and chronological holdout testing.

## License

The upstream data is CC BY-NC-SA 4.0. Attribution is required, use is non-commercial only, and share-alike obligations apply. Commercial use requires separate permission. Source: https://github.com/JeffSackmann/tennis_slam_pointbypoint.
