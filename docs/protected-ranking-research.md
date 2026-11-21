# Protected Ranking / Special Ranking research plan

Status: research-only. No production-model changes.

## 1. Data availability

The current Sackmann normalized archive contains tournament-date ordinary ranking fields (`winner_rank`, `loser_rank`, ranking points, player IDs and match dates). It does not contain an official ATP Entry Protection or WTA Special Ranking field. An ordinary ranking, last-known ranking, or long gap must never be relabelled as a protected ranking.

Player matching must use the exact archive player ID. No fuzzy name-only joins.

## 2. Separate concepts

Keep these values distinct:

- `ordinary_rank_at_match`: ordinary ranking recorded for the match/tournament.
- `pre_absence_rank`: ordinary ranking immediately before the documented out-of-competition period.
- `protected_rank`: official protected/special ranking and its basis date, when independently verified.
- `protection_status_at_match`: whether the official protection is documented as active on the match date.
- `return_date` and `matches_since_return`: observed competition history, not a diagnosis.

Protected ranking is a proxy for prior level, not proof of current strength. Do not replace Elo or current ranking with it.

## 3. Proposed input file

Keep the source file outside the public repository, e.g. `~/tennis-data/protected-rankings.csv`.

CSV columns:

| Column | Meaning |
|---|---|
| `tour` | `atp` or `wta` |
| `player_id` | Exact Sackmann / archive numeric player ID |
| `discipline` | `singles` or `doubles`; this project initially uses singles only |
| `protection_type` | `atp_entry_protection` or `wta_special_ranking` |
| `protected_rank` | Official protected/special ranking position |
| `ranking_basis_date` | Date used by the tour to determine the protected rank, YYYYMMDD |
| `absence_start_date` | Documented start of out-of-competition period, YYYYMMDD |
| `last_event_date` | Last tennis event before the absence, YYYYMMDD |
| `return_date` | First documented event after absence, YYYYMMDD |
| `active_from` | First date on which the documented protection can be used, YYYYMMDD |
| `active_to` | Last verified date of the protection window, YYYYMMDD; blank if not known |
| `source_url` | Official tour source or primary document |
| `verified_at` | Date the record was checked, YYYYMMDD |
| `evidence_note` | Short explanation; never include private medical details |

Unknown values stay blank. Do not infer an active period or protected rank from ordinary rankings.

## 4. Tour-rule distinctions

### ATP

The ATP calls this Entry Protection. Under the 2026 rules, eligibility generally requires a qualifying documented circumstance and at least six months without competing in a tennis event. The protected position is based on the average ATP ranking during the first three months after the last event. The standard usage window is limited by both tournament count and elapsed time: 9 tournaments / up to 9 months after a 6–<12 month absence, or 12 tournaments / up to 12 months after an absence of at least 12 months. There is also a three-year activation limit. Entry Protection is not used for seeding or Lucky Loser consideration.

Official sources:
- https://www.atptour.com/en/rankings/rankings-faq
- https://www.atptour.com/-/media/files/rulebook/2026/2026-rulebook_27apr26.pdf

### WTA

The WTA uses the term Special Ranking. The 2026 rulebook has its own eligibility, application, usage and duration rules. The Special Ranking is based on the WTA ranking at the specified point immediately after the last tournament's points are added (or the last Tennis Event, as defined by the rule). It is not interchangeable with ATP Entry Protection. Verify the exact rulebook version applicable to each historical record.

Official source:
- https://photoresources.wtatennis.com/wta/document/2025/12/24/b300b2a4-8d71-4346-969f-1f6b9399661f/2026-WTA-Rulebook-12-22-2025-.pdf

## 5. Research protocol

1. Build a small manually verified seed dataset first; record the primary source URL and verification date for every row.
2. Audit exact player-ID matches and duplicate/conflicting records before any modeling.
3. Join records only when `tour`, `player_id`, discipline and dates agree. No name-only fallback.
4. Evaluate separately for ATP and WTA with annual walk-forward training. For each evaluation year, fit only on earlier years and freeze coefficients for the full year.
5. Compare on identical eligible matches:
   - baseline: pre-date Elo;
   - candidate A: Elo + ordinary rank information;
   - candidate B: Elo + protected rank / pre-absence rank;
   - candidate C: Elo + protected rank + verified protection/return status;
   - candidate D: Elo + protected rank + existing layoff features (research diagnostic only).
6. Report overall metrics and separate cohorts: protected-ranking observations, first return match, matches 2–3 after return, Elo favorite/underdog, and time since return.
7. Test data coverage and recent-year robustness. A tiny hand-collected sample is a feasibility audit, not evidence of predictive value.
8. Do not ship any feature unless it improves out-of-sample Brier and LogLoss without material subgroup regressions and has adequate verified coverage.

## 6. Known limitations

- Sackmann's top-level match archive does not cover every lower-tier event. An archive gap is not proof of inactivity.
- Protected ranking is primarily an entry mechanism, not a direct measure of current playing strength.
- Public historical records may not expose all granted protections, usage counts, freezes, or exact validity dates.
- Missing protection data means unknown, not “no protected ranking”.
- Do not collect or store private medical diagnoses. Store only the minimum public eligibility/evidence metadata needed for reproducibility.
