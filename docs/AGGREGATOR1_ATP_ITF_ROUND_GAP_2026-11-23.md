# Aggregator 1 — ATP ITF early-round linkage gap

**Date:** 2026-11-23  
**Status:** research finding; no source imported and no production change.

## Finding

The full linkage audit shows a strongly tour-asymmetric gap in ATP ITF round codes 1–3. The audit's current report records:

| Tour / ITF round code | Valuebet rows | Linked rows | Linkage |
|---|---:|---:|---:|
| ATP / 1 | 56,583 | 45 | 0.08% |
| ATP / 2 | 22,579 | 34 | 0.15% |
| ATP / 3 | 23,270 | 170 | 0.73% |
| ATP / 4 | 50,666 | 40,136 | 79.23% |
| WTA / 1 | 15,738 | 10,280 | 65.31% |
| WTA / 2 | 9,919 | 6,640 | 66.95% |
| WTA / 3 | 8,697 | 4,935 | 56.73% |

The event-year diagnostic also shows that this is not confined to a few tournaments: ATP ITF event-year groups with no candidate are 1,800/1,843 for code 1, 752/780 for code 2, and 1,703/1,840 for code 3. These are audit counts, not a statement that every absent row is a qualifying match.

## Round-code semantics: likely, not confirmed

Valuebetennis documents its `tour` field as the draw round, from 0 (pre-qualifying) through 12 (final), but its public schema does not define the exact meaning of codes 1, 2 and 3.

A separate MatchStat API round table maps 1, 2 and 3 to Q1, Q2 and Q3, and 4 to the first main-draw round. This is corroborative evidence only: it is a different provider's code system. Do not silently label Valuebetennis codes 1–3 as Q1–Q3 until Valuebetennis confirms the mapping.

## Source coverage and rights

### Jeff Sackmann archive

The pinned archive audit contains:
- ATP Futures: 501,940 completed rows;
- ATP Challenger + qualifying: 232,006 completed rows;
- WTA ITF + qualifying: 602,821 completed rows.

The ATP Futures family is not a substitute for a separately documented ATP Futures qualifying feed. The combined ATP qualifying/Challenger family principally addresses tour-level qualifying and Challenger main draws; it does not establish complete Futures qualifying coverage. The archive is CC BY-NC-SA 4.0: non-commercial use, attribution and share-alike apply. It is not cleared for a commercial model.

### TennisMyLife

The current website lists separate ATP Tour qualifying CSVs, including 2021 onward. Its published terms allow personal, educational and non-commercial research only. Commercial model training/validation requires prior express written permission; raw CSV redistribution/resale is not authorized. The public listing does not establish that its ATP qualifying files include ATP Futures qualifying. Therefore this source is not cleared to fill the commercial-model gap.

### Live Tennis API

The current Basic tier documents a historical results archive for 1968–2022, including qualifying, Challenger and Futures tiers. Its Terms of Use grant a limited license to use responses within an application and prohibit caching/storing data beyond what is reasonably necessary to operate that application. They do not expressly grant persistent historical-dataset retention or model-training rights. Do not use the API archive as a training corpus or create a persistent backfill without written clarification from the provider. No additional API calls or purchases were made for this audit.

### Other public mirrors

Mirrors/forks of Sackmann data do not create independent provenance or additional licensing rights. They must not be treated as a rights-cleared replacement source.

## Decision

1. Keep the current linkage results unchanged; do not auto-map round codes 1–3.
2. Do not widen date windows to compensate for the ATP ITF gap.
3. Do not add non-commercial datasets to a commercial training pipeline without written permission.
4. Seek written confirmation from Valuebetennis for the round-code mapping.
5. Seek explicit written permission/terms from a provider before using any additional ATP Futures qualifying archive for persistent storage or model training.
6. Until a source is rights-cleared and independently audited, mark ATP ITF early-round history as an unresolved coverage limitation rather than synthesizing or guessing missing matches.

## Sources

- Valuebetennis dataset schema and CC BY 4.0 licence: https://www.valuebetennis.com/en/donnees.htm
- MatchStat API round-code table (external corroboration only): https://tennisapidoc.matchstat.com/misc
- TennisMyLife database and usage terms: https://stats.tennismylife.org/tennis-match-database
- Live Tennis API historical archive: https://docs.livetennisapi.com/historical-results-archive.html
- Live Tennis API Terms of Use: https://livetennisapi.com/terms
- Jeff Sackmann ATP data: https://github.com/JeffSackmann/tennis_atp
- Jeff Sackmann WTA data: https://github.com/JeffSackmann/tennis_wta
