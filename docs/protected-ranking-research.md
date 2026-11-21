# Protected Ranking / Special Ranking research plan

Status: research-only. No production-model changes.

## 1. Data availability

The current Sackmann normalized archive contains tournament-date ordinary ranking fields (`winner_rank`, `loser_rank`, ranking points, player IDs and match dates). It does not contain an official ATP Entry Protection or WTA Special Ranking field. An ordinary ranking, last-known ranking, or long gap must never be relabelled as a protected ranking.

Player matching must use the exact archive player ID. No fuzzy name-only joins.

Official tournament entry-list articles are a practical public source for observed protected-ranking use:
- ATP reported four players using protected rankings at Roland-Garros 2025 (Reilly Opelka, Jenson Brooksby, Sebastian Ofner and Emil Ruusuvuori): https://www.atptour.com/en/news/roland-garros-2025-entry-list
- ATP reported Rafael Nadal entering Roland-Garros 2024 with protected ranking No. 9, and named four other protected-ranking entrants: https://www.atptour.com/en/news/roland-garros-2024-entry-list
- WTA reported three Australian Open 2026 entrants using Special Rankings and published the values: Karolina Pliskova No. 40, Wang Yafan No. 71 and Mananchaya Sawangkaew No. 100: https://www.wtatennis.com/news/4416794/sabalenka-swiatek-head-australian-open-entry-list
- WTA reported five direct Wimbledon 2025 main-draw entrants using Special Rankings: Sorana Cirstea No. 38, Zhu Lin No. 52, Anastasija Sevastova No. 68, Caty McNally No. 75 and Yanina Wickmayer No. 96: https://www.wtatennis.com/news/4270347/2025-wimbledon-entries-sabalenka-gauff-seek-first-sw19-crown. These are new candidate observations; add them to the private CSV only after exact player IDs and corresponding event matches are verified against the local normalized archive.
- WTA reported Naomi Osaka as a direct 2024 Doha entrant using Special Ranking No. 46: https://www.wtatennis.com/news/3864882/swiatek-sabalenka-gauff-osaka-on-doha-entry-list. This is a candidate event observation; verify exact archive ID and event match coverage before adding it to the private CSV.
- WTA reported Ajla Tomljanovic as the only 2024 Wuhan direct main-draw entrant using a Special Ranking, No. 33: https://www.wtatennis.com/news/4115274/defending-champion-sabalenka-entire-top-25-on-wuhan-entry-list. Other named special-ranking players in that article were alternates, not direct entrants, and are not counted as confirmed event-use observations.-101-of-top-103-entered

These are event-specific observations, not a complete official registry and not proof of the full validity period.

## 2. Separate concepts

Keep these values distinct:

- `ordinary_rank_at_match`: ordinary ranking recorded for the match/tournament.
- `pre_absence_rank`: ordinary ranking immediately before the documented out-of-competition period.
- `protected_rank`: official protected/special ranking and its basis date, when independently verified.
- `protection_status_at_match`: whether the official protection is documented as active on the match date.
- `return_date` and `matches_since_return`: observed competition history, not a diagnosis.
- `observed_entry_use`: an official entry list explicitly says that the player used a protected/special ranking for a particular tournament.

Protected ranking is a proxy for prior level, not proof of current strength. Do not replace Elo or current ranking with it.

## 3. Proposed input files

Keep source files outside the public repository.

### A. Event-specific observations

Start with `~/tennis-data/protected-ranking-observations.csv`. One row represents one documented tournament entry using a protected/special ranking.

| Column | Meaning |
|---|---|
| `tour` | `atp` or `wta` |
| `player_id` | Exact Sackmann / archive numeric player ID |
| `discipline` | `singles` or `doubles`; initially singles only |
| `protection_type` | `atp_entry_protection` or `wta_special_ranking` |
| `protected_rank` | Published protected/special ranking position |
| `observed_date` | Date the official entry-list report was published, YYYYMMDD |
| `tournament_name` | Tournament for which the player used the ranking |
| `tournament_year` | Four-digit year |
| `source_url` | Official tour source |
| `verified_at` | Date checked, YYYYMMDD |

Only enter an observation when the official source explicitly identifies protected-ranking use. If the source names a player but gives no protected-rank number, leave the rank blank or record it in a separate notes field; do not infer it.

### B. Player-level protection details (only when documented)

Optional `~/tennis-data/protected-rankings.csv` columns:

| Column | Meaning |
|---|---|
| `tour` | `atp` or `wta` |
| `player_id` | Exact archive player ID |
| `discipline` | `singles` or `doubles` |
| `protection_type` | `atp_entry_protection` or `wta_special_ranking` |
| `protected_rank` | Official protected/special ranking |
| `ranking_basis_date` | Date used by the tour to determine the protected rank, YYYYMMDD |
| `absence_start_date` | Documented start of out-of-competition period, YYYYMMDD |
| `last_event_date` | Last tennis event before absence, YYYYMMDD |
| `return_date` | First documented event after absence, YYYYMMDD |
| `active_from` | First documented date protection can be used, YYYYMMDD |
| `active_to` | Last verified date of protection, YYYYMMDD; blank if unknown |
| `source_url` | Official tour source or primary document |
| `verified_at` | Date checked, YYYYMMDD |
| `evidence_note` | Short public-evidence note; no private medical details |

Unknown values stay blank. Do not infer an active period or protected rank from ordinary rankings. An event-specific observation must not be expanded into a player-level validity window without evidence.

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

1. Build a manually verified seed dataset from official entry-list articles and primary documents; retain source URL and verification date for every row.
2. Audit exact player-ID matches and duplicate/conflicting records before any modeling.
3. Join records only when `tour`, `player_id`, discipline and dates agree. No name-only fallback.
4. Treat an event-specific entry observation as evidence of use at that tournament only. Do not backfill an active period.
5. Evaluate separately for ATP and WTA with annual walk-forward training. For each evaluation year, fit only on earlier years and freeze coefficients for the full year.
6. Compare on identical eligible matches:
   - baseline: pre-date Elo;
   - candidate A: Elo + ordinary rank information;
   - candidate B: Elo + protected rank / pre-absence rank;
   - candidate C: Elo + protected rank + verified protection/return status;
   - candidate D: Elo + protected rank + existing layoff features (research diagnostic only).
7. Report overall metrics and separate cohorts: documented protected-ranking observations, first return match, matches 2–3 after return, Elo favorite/underdog, and time since return.
8. Test data coverage and recent-year robustness. A tiny hand-collected sample is a feasibility audit, not evidence of predictive value.
9. Do not ship any feature unless it improves out-of-sample Brier and LogLoss without material subgroup regressions and has adequate verified coverage.

## 6. Known limitations

- Sackmann's top-level match archive does not cover every lower-tier event. An archive gap is not proof of inactivity.
- Protected ranking is primarily an entry mechanism, not a direct measure of current playing strength.
- Public historical records may not expose all granted protections, usage counts, freezes, or exact validity dates.
- Missing protection data means unknown, not “no protected ranking”.
- Do not collect or store private medical diagnoses. Store only the minimum public eligibility/evidence metadata needed for reproducibility.
