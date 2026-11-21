# SMA raw serve-stat coverage audit — 2026-11-21

## Method

Local archive audit of `~/tennis-data/atp/atp_matches_YYYY.csv` and `~/tennis-data/wta/wta_matches_YYYY.csv`. A match counts as **both sides valid** only if all eight service-point fields are present, integer-valued and internally possible for both winner and loser:

- `svpt > 0`
- `0 <= 1stIn <= svpt`
- `0 <= 1stWon <= 1stIn`
- `0 <= 2ndWon <= svpt - 1stIn`

Empty cells are treated as missing, not zero. This is a denominator/consistency audit, not proof that every other optional field (aces, double faults, break points) is complete.

## ATP

| Year | Matches | Both sides valid | Coverage |
|---:|---:|---:|---:|
| 2000 | 3,378 | 2,941 | 87.1% |
| 2001 | 3,307 | 2,968 | 89.7% |
| 2002 | 3,213 | 2,839 | 88.4% |
| 2003 | 3,218 | 2,809 | 87.3% |
| 2004 | 3,288 | 2,880 | 87.6% |
| 2005 | 3,264 | 2,912 | 89.2% |
| 2006 | 3,267 | 2,908 | 89.0% |
| 2007 | 3,192 | 2,807 | 87.9% |
| 2008 | 3,123 | 2,764 | 88.5% |
| 2009 | 3,085 | 2,726 | 88.4% |
| 2010 | 3,030 | 2,686 | 88.6% |
| 2011 | 3,015 | 2,685 | 89.1% |
| 2012 | 3,009 | 2,680 | 89.1% |
| 2013 | 2,944 | 2,613 | 88.8% |
| 2014 | 2,901 | 2,573 | 88.7% |
| 2015 | 2,943 | 2,620 | 89.0% |
| 2016 | 2,941 | 2,916 | 99.1% |
| 2017 | 2,911 | 2,867 | 98.5% |
| 2018 | 2,897 | 2,862 | 98.8% |
| 2019 | 2,806 | 2,694 | 96.0% |
| 2020 | 1,462 | 1,415 | 96.8% |
| 2021 | 2,733 | 2,636 | 96.5% |
| 2022 | 2,917 | 2,745 | 94.1% |
| 2023 | 2,986 | 2,815 | 94.3% |
| 2024 | 3,076 | 3,015 | 98.0% |
| 2025 | 2,944 | 2,670 | 90.7% |
| 2026 | 1,449 | 1,186 | 81.8% |

## WTA

| Year | Matches | Both sides valid | Coverage |
|---:|---:|---:|---:|
| 2000 | 2,893 | 0 | 0.0% |
| 2001 | 3,098 | 0 | 0.0% |
| 2002 | 3,140 | 0 | 0.0% |
| 2003 | 2,933 | 366 | 12.5% |
| 2004 | 2,805 | 410 | 14.6% |
| 2005 | 2,843 | 552 | 19.4% |
| 2006 | 2,787 | 1,340 | 48.1% |
| 2007 | 2,778 | 1,889 | 68.0% |
| 2008 | 2,791 | 1,962 | 70.3% |
| 2009 | 2,722 | 2,153 | 79.1% |
| 2010 | 2,781 | 2,177 | 78.3% |
| 2011 | 2,804 | 2,145 | 76.5% |
| 2012 | 2,849 | 2,184 | 76.7% |
| 2013 | 2,714 | 2,131 | 78.5% |
| 2014 | 2,785 | 2,228 | 80.0% |
| 2015 | 2,651 | 1,945 | 73.4% |
| 2016 | 2,923 | 2,747 | 94.0% |
| 2017 | 2,862 | 2,843 | 99.3% |
| 2018 | 2,756 | 2,733 | 99.2% |
| 2019 | 2,743 | 2,684 | 97.8% |
| 2020 | 1,276 | 1,268 | 99.4% |
| 2021 | 2,597 | 2,482 | 95.6% |
| 2022 | 2,594 | 2,486 | 95.8% |
| 2023 | 2,810 | 2,571 | 91.5% |
| 2024 | 2,689 | 2,624 | 97.6% |
| 2025 | 2,795 | 2,713 | 97.1% |
| 2026 | 1,295 | 1,112 | 85.9% |

## Implications for SMA

1. ATP core serve-point features have broad coverage across the archive. Coverage is around 87–90% in 2000–2015, rises above 94% in 2016–2024, and is lower in the partial 2026 file.
2. WTA core serve-point coverage is not adequate for a uniform long-history model before 2016. It improves sharply from 2016 onward. Do not silently treat 2000–2002 WTA blanks as zero.
3. Optional metrics require their own feature-specific denominator audit. The builder correctly allows a missing optional counter to suppress only that metric rather than discard valid core serve/return points.
4. These figures came from the user's local archive and strict CSV parser. Re-run the audit against the exact archive snapshot used by each CI research run before treating coverage as identical across environments.
5. The audit does not authorize a production integration. Keep SMA in research/shadow mode.

**Recommended training policy:** maintain separate ATP and WTA history eligibility; use only valid prior observations; report feature-level counts; never impute missing match statistics as zero. For WTA pre-2016, treat the low and changing coverage as a separate data regime rather than mixing it into the same unqualified training pool.
