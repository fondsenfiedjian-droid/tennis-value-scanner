# Observed point-tape feature assessment

Status: diagnostics only. This document describes four explicitly selected observed tapes collected from the diagnostics Worker on 2026-11-24. It does not authorize merging PR #173 or deploying diagnostic code to Production.

## Sample inventory

The diagnostics workflow collected match IDs 179907, 201427, 212252 and 215017 using `points=default&sequence=raw`. All four records passed the collector's provenance and timestamp gates: `point_source=observed`, `coverage=from_start`, and every row had a timestamp.

| Match ID | Rows | points.complete | server present | serve present | winner present | outcome present | danger present | win_probability_p1 present | win_probability_p1_model present | tiebreak rows |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 179907 | 315 | false | 314 | 0 | 304 | 0 | 315 | 315 | 0 | 12 |
| 201427 | 121 | true | 120 | 105 | 119 | 104 | 121 | 121 | 121 | 0 |
| 212252 | 229 | true | 228 | 165 | 227 | 44 | 229 | 229 | 229 | 23 |
| 215017 | 184 | true | 183 | 152 | 182 | 149 | 184 | 184 | 184 | 0 |
| **Total** | **849** | **3 true / 1 false** | **845** | **422** | **832** | **297** | **849** | **849** | **534** | **35** |

These are counts of non-null fields, not counts of independent points. Raw tapes can contain repeated states and corrections. The 849 rows must not be described as 849 distinct played points.

## What the fields mean and what they do not mean

- `server`: the player serving the point represented by the state. The provider warns that raw history rows preserve each committed assertion; transient wrong-server values can appear and be corrected later. The clean sequence settles server assertions within ordinary games, but does not settle tiebreak servers. Do not build server-dependent tiebreak features unless the encoding is independently reconciled.
- `serve`: first or second serve, only when stated by the point source and successfully joined to the history row by exact score state (and clock proximity when a score state recurs). It is not safe to infer a missing value from the score or the serve pattern.
- `outcome`: ace, double fault, winner, forced error or unforced error, only when stated and successfully joined. Coverage differs by tour and event tier; some competitions do not provide these tags. Null is not a neutral outcome.
- `winner`: provider documentation says this is derived from the score transition between the current row and the previous row in the served sequence. It is null for the first row and for non-attributable transitions. It is not an independent official point-winner feed.
- `win_probability_p1`: provider model probability for player 1 at that observed state, when available.
- `win_probability_p1_model`: provider's same probability without the market-prior anchor; absent on older rows before the field existed.
- `danger`: provider model field included on history rows. The reference does not define its general numeric scale or full calculation. The BreakPoint schema says its `prob_swing` mirrors the REST score's `danger`, but this alone is not enough to assign a general interpretation to every tape row. Treat it as an opaque provider feature until its definition is confirmed.

## Important correction to the winner audit interpretation

The diagnostics audit found 825 agreements out of 825 comparable transitions and zero disagreements across the four samples. This proves internal consistency between the stored `winner` value and our score-transition implementation for those comparable transitions.

It is **not an independent validation of the real-world point winner**: the provider documents `winner` itself as being derived from the score step using the same class of transition rule. Therefore 100% agreement must not be presented as proof that an external scorer independently confirmed every point. The audit also excludes ambiguous transitions and sequence gaps from its agreement denominator.

## Modeling recommendations

1. Keep score-derived features (game pressure, break-point state, set context) separate from provider-supplied model fields.
2. Treat `danger` and provider win probabilities as benchmark/reference features, not ground truth and not independent predictors until their provenance and relationship are understood.
3. Use `serve` and `outcome` only when present; add explicit missingness indicators and stratify by tour/tier and match-level enrichment.
4. Exclude or separately handle tiebreak states for server-dependent features until the raw server sequence is reconciled.
5. Never interpret repeated raw rows as played points. Deduplicate/sequence according to the API's documented tape contract before calculating point-level rates.
6. Validate any feature against match outcomes using chronological train/test splits and compare against the existing Elo/form baseline. Avoid leakage from provider probabilities or post-match fields.

## Evidence and workflow

- Collection and feature-coverage audit: https://github.com/fondsenfiedjian-droid/tennis-value-scanner/actions/runs/45457458133
- Provider history tape schema: https://docs.livetennisapi.com/reference.html
- Provider point-by-point history guide: https://docs.livetennisapi.com/point-by-point-history.html
- Provider changelog on observed `serve`/`outcome` enrichment: https://docs.livetennisapi.com/changelog

This file belongs to the diagnostics branch only. Production remains unchanged.


## Provider-contract clarification (verified against API docs v1.13.91)

The raw/clean distinction is essential to interpreting this sample:

- `sequence=raw` is commit order, not authoritative point order. Independent sources can race; later committed rows can correct earlier states, and raw timestamps/order may be non-monotonic.
- `sequence=clean` keeps the last assertion for each distinct score state and orders states by match progress. This is the provider's authoritative order for ordinary point-sequence analysis, but deuce states can cycle and tie in progress ranking. The provider explicitly warns that clean rows are not guaranteed to be point-monotonic at deuce.
- The `winner` field on raw rows is judged against the previous raw row; on clean rows it is judged against the previous clean row. Re-sends, set openers, backward corrections and multi-game jumps can therefore have null `winner`. A transition where games total rises by exactly one attributes the game point to the side whose game count rose, even if intermediate points were missed.
- The earlier audit's 825/825 result is a raw-sequence implementation consistency check, not validation against an independent official point-winner source. It must not be used as a model-quality claim.
- `serve` and `outcome` are attached to observed rows only when the per-point stream matches the exact score state: set count, every set's games, in-game points and tiebreak flag. No score-based inference fills missing tags. A repeated score state (such as a deuce cycle) can be ambiguous and remains null.
- `serve=1|2` represents first/second serve. `outcome` vocabulary is `ace`, `double_fault`, `winner`, `forced_error`, `unforced_error`. Enrichment is not universal; inspect `meta.enrichment` for each match. A null tag is unknown/not joined, not a negative event.
- The provider's own description says raw rows can contain a transient incorrect `server` assertion that is later corrected by a higher-trust source. Do not use raw `server` as a clean feature without correction handling. Also exclude tiebreak server inference unless its sequence is independently validated.
- `danger` and `win_probability_p1` are model fields, not raw observations. The public docs describe `danger` as a per-state model field but do not provide a general numeric interpretation suitable for independent feature engineering. Keep it opaque until the provider supplies a precise definition.

For research, collect raw tapes to preserve provenance and corrections, but derive analytical sequences according to the documented clean ordering and explicitly handle deuce cycles, repeated states and ambiguous transitions. Do not silently treat raw rows as distinct played points.

Documentation checked:
- https://docs.livetennisapi.com/point-by-point-history.html (sections on raw/clean, points/default, coverage and metadata)
- https://docs.livetennisapi.com/changelog (2026-09-20 enrichment join and 2026-09-22 winner derivation)
- https://docs.livetennisapi.com/reference.html
