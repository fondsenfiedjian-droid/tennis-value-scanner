# Retrospective tournament-intent research cases — November 2026

**Purpose:** use recently completed matches to discover candidate signals and improve the research taxonomy. This is a retrospective research log, not a pre-match evidence registry.

## Critical temporal rule

The sources below were retrieved after the relevant matches. Even when an article itself was published before a match, a source first captured after the match does **not** satisfy the registry's pre-match capture requirement. These cases must not be imported into `data/tournament-intent-evidence.json`, used as historical pre-match features, or used to claim that the information was available to the model at the time.

Use these cases for taxonomy development and hypothesis generation only. A separate prospective capture process must archive sources before target match start.

## Case 1 — Holger Rune, Stockholm Open, 10 November 2026

- Target match: Holger Rune vs Zizou Bergs, Stockholm Open, singles R32.
- Result: Rune won 6-3, 6-4.
- Official match identifier on tournament statistics page: `ms019`.
- Official match stats: https://www.stockholmopen.se/en/tournament/match-statistik/2026/ms019
- Official tournament/ATP feature published 9 November 2026: https://www.stockholmopen.se/en/tournament/nyheter/rune-stockholm-2026-preview-feature
- Relevant statement: Rune said that continuing to build and getting matches under his belt before next year was crucial.
- Context: 11-month rehabilitation after Achilles rupture; returned to competition in September 2026; this was his fifth ATP Tour event of the season. He described his physical condition as good and said he wanted to build match by match in the tournament report.
- Candidate taxonomy: `explicit_preparation` / return-to-competition match-rhythm signal.
- Interpretation: **confirmed preparation objective**, but not evidence of low effort, low competitive intent, or willingness to lose. His statement also expressed a desire to give a strong effort and hopefully do well.
- Temporal status: article publication preceded the match, but this research capture is retrospective. Exclude from the pre-match registry.

## Case 2 — Alexander Zverev vs Arthur Fils, ATP Finals, 19 November 2026

- Target match: Alexander Zverev vs Arthur Fils, round robin.
- Result: Zverev won 6-4, 7-6(6).
- Official match report: https://www.nittoatpfinals.com/en/news/zverev-fils-nitto-atp-finals-2026-thursday
- Post-match transcript: https://asaptext.com/asap_media/media/1004/1114/transcripts/172948.pdf
- Relevant information: after the match, Zverev discussed a recurring ankle problem and said he would work with his physiotherapist and team to be ready for Saturday.
- Candidate taxonomy: post-match physical-status observation; **not** a pre-match tournament-priority signal.
- Interpretation: do not backfill this information into the pre-match assessment of Zverev–Fils. It may be relevant to a later match only if independently confirmed and captured before that later match begins.
- Temporal status: post-match; exclude from the pre-match registry for Zverev–Fils.

## Case 3 — Karolina Muchova, WTA Finals 2026

- Official WTA media-day quotes: https://www.wtatennis.com/news/4605779/top-quotes-from-2026-wta-finals-indian-wells-media-day
- Official press-conference transcript: https://asaptext.com/asap_media/media/1004/1345/browse_file.php?browse_file_name=transcripts%2F172666.html
- Relevant statement: Muchova said that after Wuhan she chose not to enter further tournaments because her energy was depleted and she needed rest; she accepted that she might fail to qualify for the WTA Finals.
- Candidate taxonomy: `schedule_bridge` / explicit recovery and schedule-management decision before the WTA Finals.
- Interpretation: this documents a deliberate recovery decision in the preceding schedule. It does **not** establish that she deprioritized the WTA Finals after qualifying; in her media-day comments she said she was preparing for the first match and focusing on it.
- Temporal status: media-day source predates the WTA Finals matches, but this research capture is retrospective. Do not import as a pre-match registry record.

## Research conclusions

1. Preparation, recovery, and low competitive priority are separate concepts. Do not collapse them into a single “unmotivated” label.
2. A player can explicitly seek match rhythm and still intend to compete hard and win.
3. A post-match injury disclosure cannot be used to explain a pre-match prediction unless the same information was independently available and captured before the match.
4. A player choosing rest before a target event is not evidence that the target event itself is low priority.
5. These retrospective cases are qualitative examples only. They do not justify classifier weight changes, probability adjustments, EV changes, or betting rules.

## Next research step

Continue reviewing official match reports, press conferences, and player/team statements from completed ATP, WTA, and Challenger events in the 14–21 November 2026 window. For every candidate, record both the source publication date and the actual research capture time. Keep retrospective discoveries in this log; only prospective, pre-match captures may enter the reviewed evidence registry.


## Expanded review window: 21 September–21 November 2026

The following additional official/public sources were identified in the two-month window. These are candidate observations for the retrospective research log; they are not pre-match registry records because they were collected retrospectively in this research session.

### Case 4 — Holger Rune, Shanghai Masters, 5 October 2026

- Official source: https://en.rolexshanghaimasters.com/en/media/news/shanghai-a-key-step-in-rune-return
- Pre-tournament statement: Rune said he wanted to get into a good rhythm and finish the year having played many matches, to put himself in position for a good preseason before Australia.
- Context: return after almost a year away with an Achilles tear; had played Davis Cup and Tokyo before Shanghai.
- Candidate taxonomy: `explicit_preparation`, return-to-competition match-rhythm objective.
- Interpretation: unusually clear preparation objective, but no evidence he did not want to win individual matches. Strong candidate for future prospective capture examples.

### Case 5 — Sonay Kartal, Wuhan, 16 October 2026

- Official WTA source: https://www.wtatennis.com/news/4593140/kartals-comeback-gathers-pace-with-landmark-run-to-wuhan-semifinals
- Context: returned after six months out with a back injury; discussed patience, not rushing the comeback, and using the first tournaments to regain match conditions. By Wuhan she had reached the final after beating several highly ranked opponents.
- Candidate taxonomy: `official_return_cautious` / gradual return after injury.
- Interpretation: evidence of cautious return planning, but her results and comments show strong competitive engagement. Not a low-priority label.

### Case 6 — Jessica Pegula, Wuhan, 11 October 2026

- Official WTA source: https://www.wtatennis.com/news/4590642/back-to-normal-pegula-ready-for-late-season-push-in-wuhan
- Context: after a physically demanding summer and US Open semifinal, she withdrew from Singapore and Beijing, then returned in Wuhan. She said she was healthy again and motivated to finish the season strongly.
- Candidate taxonomy: schedule/recovery management followed by explicit high competitive priority.
- Interpretation: important counterexample. Withdrawals and recovery periods do not imply weak intent at the next tournament; her stated aim was a strong late-season finish.

### Case 7 — Anastasia Potapova, 5 October 2026

- Official WTA source: https://www.wtatennis.com/news/4586609/anastasia-potapova-shuts-down-2026-season-after-beijing-retirement
- Context: after retiring in Beijing with a shoulder injury, Potapova announced the end of her season to recover and return in 2027.
- Candidate taxonomy: explicit season-ending recovery decision.
- Interpretation: this is useful for assessing future scheduled events after the announcement, but it is not evidence that she entered Beijing intending not to compete. The statement followed her retirement and must not be used as a pre-match feature for Beijing.

### Case 8 — Iga Swiatek, 20 October 2026

- Official WTA source: https://www.wtatennis.com/news/4595282/swiatek-withdraws-from-ningbo-open-with-thigh-injury
- Context: withdrew from Ningbo and ended the season early because of an ongoing left-thigh problem, choosing rest and recovery despite still being in contention for the last WTA Finals place.
- Candidate taxonomy: explicit recovery priority / season-ending withdrawal.
- Interpretation: strong evidence of a health-driven decision not to continue the schedule. Not evidence of low motivation in the preceding Wuhan or other completed matches.

### Case 9 — Amanda Anisimova, 28 September 2026

- Official WTA source: https://www.wtatennis.com/news/4583223/amanda-anisimova-shuts-down-season-to-recover-from-wrist-injury
- Context: announced she would not play again in 2026 because of a recurring wrist injury, after withdrawing from Singapore and Beijing.
- Candidate taxonomy: explicit recovery priority / season-ending withdrawal.
- Interpretation: use only for events scheduled after the announcement. Do not retroactively mark prior matches as low-priority or low-effort.

### Case 10 — Carlos Alcaraz, Vienna, 26 October 2026

- Official tournament source: https://www.erstebank-open.com/en/news/storys/alcaraz-vienna-2026-preview
- Pre-tournament statement: said he needed competition and match rhythm to return to his best level after a gap in competition; described Vienna as an important week and a good opportunity to improve. He also spoke of his ambitions and enjoyment of competing.
- Candidate taxonomy: `explicit_preparation` with simultaneous evidence of strong competitive commitment.
- Interpretation: a particularly useful mixed-signal case. Preparation objective and title/competitive ambition can coexist; do not translate this statement into low motivation.

### Case 11 — Elina Svitolina, WTA Finals, 6 November 2026

- Official press-conference transcript: https://asaptext.com/asap_media/media/1004/1345/browse_file.php?browse_file_name=transcripts%2F172665.html
- Context: described taking time to rest and train after Wuhan, then preparing specifically for the WTA Finals. She said she needed to be mentally and physically ready because the event has no easy matches and described her usual match mentality as consistent across tournament levels.
- Candidate taxonomy: recovery between events followed by explicit high priority for target event.
- Interpretation: another useful counterexample to the assumption that rest or a lighter schedule means low motivation at the next tournament.

## Revised retrospective taxonomy lessons

- **Preparation objective:** match rhythm, practice against strong opponents, regain level after injury or absence. This may coexist with strong desire to win.
- **Cautious return:** gradual progression, workload control, listening to medical/team advice. This describes physical strategy, not match intent.
- **Schedule/recovery decision:** skipping events or ending a season to recover. Apply only to events after the decision was publicly made.
- **Explicit high priority:** statements about title ambitions, giving maximum effort, finishing season strongly, or preparing specifically for the target event.
- **Mixed evidence:** preparation/recovery objective and high competitive commitment both present. Preserve both; do not force a binary label.
- **Unknown:** no reliable public evidence. Absence of evidence is not evidence of low motivation.

These cases are not a statistically representative sample and have no denominator. They must not be used to infer prevalence or alter model probabilities. The next phase should collect a systematic list of completed matches in the window, then search both players symmetrically rather than selecting only players with interesting statements.
