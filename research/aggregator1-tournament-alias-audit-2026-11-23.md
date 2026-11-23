# Aggregator 1 tournament alias audit — 2026-11-23

## Scope

Compared full aggregate audit run #74 (commit `34a367889ba41477860429638cad8543127536f6`) with run #78 (commit `216e0f13e5abae53f3c85e369d52377be568df1e`). The second run includes the additional tournament alias batch and its regression fixtures.

- [Run #74](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45092350384)
- [Run #78](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45092559565)
- [Research checks #115](https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45092559558)

The audit remains aggregate-only. No raw source datasets, match-level mappings, player names, or source IDs are included here.

## Linkage outcome

| Metric | Run #74 | Run #78 | Change |
|---|---:|---:|---:|
| Valid Valuebetennis rows | 478,601 | 478,601 | 0 |
| Candidate rows | 289,039 | 289,039 | 0 |
| Unique links | 282,934 | 283,020 | +86 |
| Ambiguous rows | 6,105 | 6,019 | -86 |
| No candidate | 189,567 | 189,567 | 0 |
| Exact normalized event-name links | 256,893 | 260,396 | +3,503 |
| Event-name mismatches among accepted links | 26,041 | 22,624 | -3,417 |
| Linkage rate | 59.12% | 59.13% | +0.01 pp |

The alias work resolved 86 previously ambiguous match rows. It did not change the number of rows with no candidate. The larger reduction in event-name mismatches reflects normalization of event-name variants on accepted links; it is a diagnostic improvement, not 3,503 additional match links.

## Tour-level change

| Tour | Unique links #74 → #78 | Ambiguous #74 → #78 | Linkage rate #78 |
|---|---:|---:|---:|
| ATP | 141,458 → 141,502 | 2,314 → 2,270 | 50.49% |
| WTA | 141,476 → 141,518 | 3,791 → 3,749 | 71.35% |

Both tours gained 44 unique links. The higher WTA linkage rate remains largely a property of source coverage and competition mix, not evidence that WTA identities are inherently easier to resolve.

## Category coverage after run #78

- Grand Slam: 82.63% (9,183 / 11,113)
- Main tour: 80.66% (18,625 / 23,091)
- Masters: 80.99% (8,779 / 10,839)
- Challenger: 74.44% (112,690 / 151,393)
- ITF: 47.78% (132,952 / 278,278)
- Davis Cup / BJK Cup: 67.64% (790 / 1,168)

The low ITF rate is the main coverage weakness, especially ATP ITF (38.63%; 77,500 / 200,632). This should be treated as source coverage limitation until independently validated, not repaired by looser fuzzy matching.

## Remaining event-name mismatches

The largest remaining normalized-name pairs in run #78 include:

| Source → Sackmann | Accepted rows |
|---|---:|
| St Tropez CH → Saint-Tropez CH | 226 |
| Francavilla CH → Francavilla al Mare CH | 213 |
| Genoa CH → Genoa CH variant | 163 |
| St Brieuc CH → Saint-Brieuc CH | 143 |
| Bratislava 1 CH → Bratislava CH | 138 |
| Adelaide International 2 Adelaide → Adelaide 2 | 137 |
| Morelos CH → Cuernavaca CH | 127 |
| Canada Masters → Toronto | 127 |
| Bastad → Bastad 125 | 110 |
| Buenos Aires → Buenos Aires 125 | 100 |

These pairs are diagnostics only. Some may represent harmless naming variants; others may encode different editions, tournament tiers, or event identities. They must not be indiscriminately merged. In particular, numbered editions and category suffixes (for example, Prague 1/2/3 or Bastad vs Bastad 125) need date, tier, and tournament identity checks before alias admission.

**Open verification item:** the aggregate report still lists some pairs that appear to have alias candidates in the current normalizer (notably Morelos/Cuernavaca and St Brieuc/Saint-Brieuc). The exact reason should be traced against the normalization path and run commit before further alias additions. Do not assume the presence of an alias-table entry proves the full audit applied it to every row.

## Player identity and duplicate integrity

Player crosswalk aggregate figures did not change between runs:

- ATP: 6,942 resolved of 14,185 source IDs (48.94%); 134 ambiguous; 7,109 unmapped.
- WTA: 7,472 resolved of 9,790 source IDs (76.32%); 630 ambiguous; 1,688 unmapped.
- Name collisions remain substantial: ATP 1,900; WTA 3,703. Exact normalized full-name matching remains a candidate crosswalk only; DOB, IOC/country, and playing hand checks are still required.
- All 478,606 match rows have a match ID; no duplicate match-ID groups.
- 54 composite-fingerprint groups (0.01%), including 2 material score-conflict groups and 10 winner-field differences that still identify the same player side.
- Five invalid core rows remain. No rows were automatically deleted or merged.

## Method and limitations

- Match linkage uses exact normalized full-name pairs, exact normalized surface, and a ±14-day window around the Sackmann event-week date.
- Tournament names are used to disambiguate multiple candidates; a single player-pair/surface/date candidate can still be accepted without event-name agreement. Event mismatch counts therefore do not mean those links are necessarily wrong.
- No fuzzy player-name matching or automatic player-ID merging is used.
- 2026 is a partial snapshot. No year is certified complete by this audit.
- Denominators are observed Valuebetennis archive rows, not official tournament schedules.
- Sackmann data is CC BY-NC-SA 4.0. Any downstream use must respect non-commercial, attribution, and share-alike conditions.

## Decision

Run #78 passes the research checks and full aggregate audit. Keep the current conservative matching rules. Next work should investigate why selected alias entries remain visible in the mismatch diagnostics, then audit the highest-volume unresolved tournament-name pairs with year/tier/date evidence. Do not loosen player matching or certify the archive complete yet.
