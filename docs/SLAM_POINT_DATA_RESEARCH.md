# Grand Slam point-by-point research audit

## Source and scope

This research audit covers the pinned Jeff Sackmann Grand Slam point-by-point archive at commit 83733587353df8a41f2fd4f516147d5aa83f5a8d. The selected scope is singles main-draw match metadata and point files for the four Grand Slams from 2011 through 2024. The pinned archive contains 49 event pairs (98 CSV files); doubles and mixed doubles files are excluded.

The upstream README warns that coverage is selective, commonly missing first-round matches and matches on courts without tracking systems. Serve speed, first/second serve indicators, rally length, distance run, serve depth and return depth are not consistently available across years/events. In some 2018–2019 Australian/French Open records, zero serve speed and rally-length values are sentinels for missing data.

## Audit method

The completed audit covers 49 Slam events, 10,513 match metadata IDs and 1,922,136 point rows. Of the 10,513 metadata IDs, 10,508 have point data; there are no point IDs absent from metadata and five metadata matches without point rows. Player names are present in 99.84% of metadata rows, but winner, status, event name, round, court and player IDs are populated in only 8.16% on average (four events). This means robust match linkage to the historical results archive is a separate required step.

The workflow downloads the pinned files to an ephemeral GitHub Actions runner, processes one Slam event at a time, and retains only aggregate JSON for 30 days. It reports event/match/point counts, match-ID linkage, orphan point IDs, matches without point rows, and candidate field non-missing/zero rates across the full sample and per event. No raw point rows or player-level derived data are committed or uploaded.

## Candidate PFE signals

Potential descriptive signals include first/second serve speed, serve and return depth, rally length, distance run, and point outcomes. In this snapshot, Speed_KMH is non-empty on 95.20% of point rows (47 events) but 24.78% of numeric values are zero; Speed_MPH is non-empty on 85.52% (43 events) with 25.75% zeros. RallyCount is non-empty on 63.55% (28 events), P1/P2DistanceRun on 52.49% (24 events), ServeDepth and ServeWidth on 33.90% (20 events), and ReturnDepth on 28.35% (20 events). These are availability rates, not proof that zero values are valid measurements.

ServeDepth categories are CTL/NCTL; ServeWidth categories are C/W/BW/BC/B; ReturnDepth categories are D/ND. WinnerShotType uses F/B and WinnerType includes S, but the numeric portion of these fields is zero-only in the audited events and must not be treated as numeric magnitude. The upstream README specifically warns that some 2018–2019 Australian/French Open serve-speed zeros and rally-length values are missing-data sentinels. These fields are not approved for production. Missing values must remain missing, and all candidate features require event-specific denominator validation, prior-match-only player aggregation, coverage thresholds and chronological holdout testing.

## License

The upstream data is CC BY-NC-SA 4.0. Attribution is required, use is non-commercial only, and share-alike obligations apply. Commercial use requires separate permission. Source: https://github.com/JeffSackmann/tennis_slam_pointbypoint.
