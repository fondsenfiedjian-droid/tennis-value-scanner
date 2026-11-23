# AcesAPI tournament catalogue preflight findings — 2026-11-23

## Scope and execution

Two identical manual GitHub Actions runs were triggered on `main` for the bounded 2025 ATP/WTA catalogue preflight:

- [Run #1](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45090206181)
- [Run #2](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45090252673)

Both completed successfully. Each run completed the secret check, exactly-two-request step, and aggregate-only artifact upload. Each generated the same aggregate report. Because the workflow was inadvertently submitted twice, the actual request count was four (two ATP/WTA pairs), with an expected total cost of **4 credits**, not 2. No further live requests are authorized by this finding.

Only aggregate reports were uploaded as workflow artifacts; raw provider responses remained in ephemeral runner storage and were not committed.

## Observed first-page results

| Field | ATP 2025 | WTA 2025 |
|---|---:|---:|
| Returned tournaments | 61 | 100 |
| next_offset | null | 100 |
| Complete core rows | 61 | 91 |
| Hard | 36 | 47 |
| Clay | 18 | 34 |
| Grass | 7 | 10 |
| Surface missing | 0 | 9 |
| Major | 4 | 4 |
| Non-major | 57 | 96 |
| Unknown major flag | 0 | 0 |
| Status final | 61 | 99 |
| Status live | 0 | 1 |
| Earliest start | 2024-12-26 | 2024-12-26 |
| Latest end | 2025-12-22 | 2025-11-10 |

The WTA page is demonstrably incomplete because `next_offset=100`. The nine missing-surface rows and nine rows failing the script's completeness predicate require field-level inspection; the aggregate report does not establish whether these are exactly the same records. The WTA catalogue also includes one `live` status row despite season=2025 and ends on 2025-11-10; verify the underlying record semantics before treating status/date as a data defect.

ATP returned fewer than the requested limit and no next offset, which indicates the endpoint returned its available first-page result set for this query. It does **not** independently prove full ATP season coverage or coverage of Challenger/Futures/ITF events.

Both tours include four records flagged as majors. The endpoint's `major` flag is not a sufficient competition-tier taxonomy. Do not infer Challenger, Futures, ITF, ATP 250/500/1000 or WTA 125 tiers from this catalogue alone.

## Data quality interpretation

1. This preflight confirms that the endpoint is reachable and returns usable tournament-level fields.
2. It does not establish full match-level coverage, complete annual event coverage, or lower-tier coverage.
3. WTA requires pagination before any completeness estimate. Do not issue further API calls until a separate explicit credit ceiling is approved.
4. Missing surfaces and incomplete core rows must be handled as unknowns, not silently imputed.
5. The date span crossing into 2024-12-26 is not automatically an error: season catalogues may include events whose tournament start precedes January 1.
6. The single WTA `live` status is anomalous for a historical 2025 catalogue and should be checked against the raw response only if an already-authorized local copy is available; do not spend credits to investigate it now.

## Next offline work

- Extend the aggregate parser/tests to report per-field missingness independently (tournament_id, name, start_date, end_date, surface, city, country, indoor, major, status, main_draw_matches).
- Add a consistency warning when `next_offset` is non-null or returnedRows equals requestedLimit.
- Keep ATP and WTA coverage claims explicitly separate.
- Compare tournament catalogue counts against independently available historical event inventories, with exact/ambiguous/unmatched classifications.
- Do not fetch WTA page 2 or any tournament detail until separately authorized.

## Safety and scope

Research branch only. No Production integration, model training, deployment, or raw-data redistribution. AcesAPI source data remains subject to provider terms.
