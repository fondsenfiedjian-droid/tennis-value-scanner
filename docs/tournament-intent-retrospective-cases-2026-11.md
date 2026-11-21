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
