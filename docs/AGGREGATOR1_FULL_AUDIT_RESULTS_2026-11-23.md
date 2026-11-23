# Aggregator 1 — verified full audit results

Date: 2026-11-23  
Workflow commit: `58abfc842fbcd8cf6a88c2b09e382d784b1fc118`  
Workflow run: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45123081003  
Artifact: `aggregator1-full-audit-report`

This note records aggregate results from the workflow artifact. Raw licensed datasets and row-level identifiers are not included.

## 1. Valuebetennis archive integrity

- Rows: 478,975.
- Rows with Match ID: 478,975 (100%).
- Missing Match ID: 0.
- Duplicate Match ID groups: 0.
- Conflicting Match ID groups: 0.
- Repeated composite-fingerprint groups: 54 (0.01% of rows).
- Material score-conflict fingerprint groups: 2.
- Winner-conflict groups: 10; all 10 are classified as same-player winner conflicts by the audit's available comparison.
- Invalid core rows: 5.

Interpretation: no repeated Match IDs were detected. Composite fingerprints are only review flags, not proof of duplicate matches. The two material score-conflict groups must not be auto-deduplicated.

## 2. Match linkage to Sackmann archive

- Valuebetennis rows: 478,975.
- Valid rows: 478,970.
- Candidate rows: 289,039.
- Unique linked matches: 283,020.
- Linkage rate: 59.09%.
- Ambiguous: 6,019.
- No candidate: 189,936.
- No-candidate reasons: pair absent 178,814; surface absent 2,873; date-window miss 8,244; invalid player pair 5.
- Linked date offset: median 2 days; p90 4 days; range −14 to +14 days.

The denominator is the observed Valuebetennis archive with valid tour/date/player pair, not an official event schedule. 2026 is partial; no year is certified complete. Sackmann tournament dates are generally event-week dates, not exact match dates.

## 3. Round-specific ATP ITF gap

| Valuebetennis round code | Rows | Linked | Linkage |
|---|---:|---:|---:|
| 1 | 56,733 | 44 | 0.08% |
| 2 | 22,579 | 33 | 0.15% |
| 3 | 23,270 | 171 | 0.73% |
| 4 | 50,666 | 40,145 | 79.23% |

Codes 1–3 are consistent with qualifying rounds based on external documentation, but the full code mapping has not been confirmed by Valuebetennis. The large difference from code 4 is a strong diagnostic signal, not proof of the exact semantics of every code.

## 4. Player ID crosswalk diagnostics

Direct exact-name registry comparison:
- ATP: 14,205 distinct Valuebetennis source IDs; 6,943 uniquely resolved (48.88%), 134 ambiguous, 7,128 unmapped.
- WTA: 9,803 distinct source IDs; 7,473 uniquely resolved (76.23%), 630 ambiguous, 1,700 unmapped.

Accepted match-evidence crosswalk (a separate, more conservative diagnostic):
- ATP: 5,679 resolved to one Sackmann ID; 62 conflicting source IDs.
- WTA: 7,693 resolved to one Sackmann ID; 120 conflicting source IDs.

These are different denominators and methods; do not combine them. DOB/IOC/hand metadata profiles describe candidate differences but do not prove identity. No ambiguous identity is auto-selected.

## 5. Source scope in this run

Sackmann rows downloaded:
- ATP main: 16,105
- ATP Futures: 88,988
- ATP Challenger qualifying: 56,740
- WTA main: 14,780
- WTA qualifying/ITF: 160,487

The ATP Futures tier is not a separately documented ATP Futures qualifying archive in this source set. This remains a plausible contributor to the ATP ITF qualifying coverage gap, not a proven complete explanation.

## 6. Conclusions and restrictions

1. The broad ATP ITF round 1–3 gap is real in this particular source snapshot.
2. Widening the date window is unlikely to solve the dominant missing-player-pair problem.
3. Player ID/name crosswalks must remain conservative; ambiguous candidates are not identity assertions.
4. No new provider data should be added until retention, model-training and commercial-use rights are clarified in writing.
5. Sackmann is CC BY-NC-SA 4.0 and is not cleared for commercial model training.
6. This is a research-only aggregate report. Do not merge rows or crosswalks into Production.

## Reproducibility

The workflow artifact includes aggregate JSON reports and a source manifest with checksums for the downloaded source files. It does not contain the raw datasets, player names, match IDs, or row-level crosswalks.
