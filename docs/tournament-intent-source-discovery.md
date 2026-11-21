# Tournament-intent source discovery — ATP/WTA

Status: source reconnaissance, 21 November 2026. This is a reviewed-source shortlist, not a claim of complete coverage, an API integration, or evidence about any specific player's intentions. No automatic crawler is enabled.

## 1. Primary official source entry points

| Tour/source | Public entry point | What it can provide | Limit |
|---|---|---|---|
| ATP Tour news | https://www.atptour.com/en/news | Tournament previews, player quotes, pre/post-match press-conference reporting, withdrawals and player updates | Editorial selection; not every player/event is covered |
| ATP Tour videos | https://www.atptour.com/en/video | Player interviews and tour-produced video | Video may need manual transcription; some clips are promotional rather than event-intent evidence |
| WTA news | https://www.wtatennis.com/news | Player features, tournament news, match reaction and player updates | Editorial selection; coverage varies by event |
| WTA press conferences | https://www.wtatennis.com/videos/press-conferences | Dedicated press-conference videos with player/event context | Some videos require registration; manual review/transcription may be necessary |
| WTA videos | https://www.wtatennis.com/videos | Player interviews, press conferences and event video | Mixed editorial purpose; inspect the actual statement |
| Tournament official website/media | Event-specific official website and press releases | Local pre-tournament interviews, schedule, withdrawals, return announcements | Must verify that the site is genuinely operated by the event; coverage and retention vary |
| Official tour/tournament schedule | ATP/WTA draw and schedule pages | Whether a player is entered, event sequence and match timing | Entry or schedule is context only; it does not establish intent or priority |

### Verified examples that demonstrate the source types

- ATP pre-tournament press-conference reporting: https://www.atptour.com/en/news/alcaraz-vienna-2026-preview — Alcaraz described needing competition and match rhythm after a gap. This is evidence of a stated preparation/rhythm goal, not proof that he did not want to win Vienna.
- ATP pre-tournament press-conference reporting: https://www.atptour.com/en/news/zverev-montreal-2026-preview — Zverev discussed a longer-term ranking ambition before Montreal. A broader career goal does not establish low priority for the current tournament.
- ATP injury/physical-status reporting: https://www.atptour.com/en/news/fritz-reaction-wimbledon-2026-qf — Fritz discussed knee tendinitis after the match. Because this is post-match, it must not be used as pre-match evidence for that match; it may only inform a later target match if publication and capture both precede it.
- WTA official press-conference video index: https://www.wtatennis.com/videos/press-conferences
- WTA official news index: https://www.wtatennis.com/news

The examples above validate that official sources publish useful material; they are not a dataset and do not justify a model adjustment.

## 2. Source priority

1. Direct, dated player/team statement on an official ATP/WTA or tournament channel.
2. Official press conference or interview transcript/video, with event and publication date.
3. Verified player/team social account, with the original post URL and timestamp.
4. Reputable tennis media quoting the player directly and identifying when/where the statement was made.
5. Official schedule/draw data for context only.

Do not use unattributed reposts, fan accounts, anonymous claims, betting previews, odds movement or search snippets as evidence. A search snippet is a discovery aid; open and review the original source before creating a record.

## 3. What counts as evidence

| Registry type | Accept only when the source explicitly says… | Do not infer from… |
|---|---|---|
| `explicit_preparation` | This event is being used for practice, match rhythm, preparation or a controlled return | A player says they need matches but also clearly wants the title; code the literal statement and retain context |
| `explicit_next_event_priority` | A named upcoming event is the player's priority over the current event | The next event is a Slam or higher-tier event by calendar alone |
| `official_return_cautious` | Player/team/official source confirms restricted workload, gradual return or explicit physical management | Recent injury alone, age, ranking, or an observer's guess |
| `recent_injury_return` | A reliable source confirms the injury/absence and the return timeline before the target match | A post-match injury report, vague discomfort, or an old unrelated injury |
| `major_event_soon` | A verified schedule places a clearly defined priority event soon after the target | Event prestige alone; this is schedule context, not proof of the player's personal priorities |
| `schedule_bridge` | Verified calendar facts show the target event between named commitments | Travel distance or fatigue guessed from geography |
| `explicit_title_focus` | Player/team explicitly states that winning this event or taking the title is a goal | Generic competitive language or marketing copy |
| `home_event_commitment` | Player explicitly describes this home event as personally important | Nationality/home-country inference alone |

A quote may support more than one interpretation. Preserve the exact short quote and surrounding context, and prefer a neutral note when ambiguous. Do not force a type merely to fill the registry.

## 4. Point-in-time collection checklist

Before importing a record, a reviewer must establish:

- exact player identity (prefer tour player ID, not name alone);
- exact tournament/event and target match ID;
- original public HTTPS URL, source category and source name;
- publication timestamp from the original source, not the search-engine crawl date;
- capture timestamp when the reviewer actually inspected the source;
- target match start timestamp in a consistent timezone;
- direct quote or concise factual detail and the reason it supports the selected evidence type;
- reviewer identity and `verified: true`.

Both publication and capture must precede the target match start. If the original publication time is unavailable, do not invent it: defer the record until it can be verified or exclude it. Never backdate capture. Later interviews, injury reports, withdrawals and match results must not leak into the pre-match record.

## 5. Manual workflow for the first pilot

1. Select a small, predeclared sample of upcoming ATP/WTA singles matches, including top seeds and returning players; do not select matches because a surprising result later occurred.
2. Search the official tour news/video index and the tournament's official news/press pages for each player.
3. Review original pages/videos manually. Search snippets alone are not enough.
4. Record positive evidence and explicit contrary evidence (for example, a clear title-focus statement); also record that a search was performed but found no relevant statement, separately from a missing search.
5. Import reviewed rows with `scripts/import-tournament-intent-evidence.mjs`. Run `--dry-run` first and inspect every rejection.
6. Keep the pilot registry separate from production. Do not use absence of evidence as evidence of low motivation.

Suggested pilot coverage fields (keep outside the classifier until a measured sample exists): matches searched, players searched, sources opened, relevant statements found, publication-time verified, source-type counts, and reason search failed.

## 6. Current technical decision

- No official source endpoint has yet been verified as a stable, permitted machine-readable feed for this use. Do not invent an API or assume the HTML pages can be scraped.
- Start with manual review and the local importer. No new API key, paid provider, crawler, scheduled job, frontend display, model adjustment or Production deployment is justified at this stage.
- The registry's current 45-day freshness default is a conservative operational filter, not a scientifically established decay curve. Review it after collecting enough dated examples.
- Keep intent, physical readiness and workload as separate concepts. The existing `human-factor.js` measures observable workload/recovery; it must not be relabelled as motivation.
- Evaluate predictive usefulness only on chronological holdouts, comparing against the same-match baseline. Report coverage and missingness. A signal that appears only in press-covered top events may not generalize to Challenger/ITF.

## 7. Next research gate

Do not change probabilities until a pre-match dataset exists with:
- source-reviewed labels and timestamp integrity;
- a defined sample-selection protocol including negative/no-evidence cases;
- inter-reviewer agreement on evidence classification;
- sufficient ATP and WTA coverage assessed separately;
- chronological holdout results with calibration metrics and matched-sample baselines.

A statement about preparation is evidence of a stated goal, not proof of deliberate underperformance or a forecast of defeat.
