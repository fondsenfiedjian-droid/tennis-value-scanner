import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("comparison view provides independent player autocomplete fields", () => {
  assert.match(html, /id="compareNameA"[^>]*aria-controls="compareSuggestionsA"/);
  assert.match(html, /id="compareNameB"[^>]*aria-controls="compareSuggestionsB"/);
  assert.match(html, /id="compareSuggestionsA" role="listbox" hidden/);
  assert.match(html, /id="compareSuggestionsB" role="listbox" hidden/);
});

test("player autocomplete uses the Worker search proxy and waits for a short typing pause", () => {
  assert.match(html, /API\+'\/players\/search\?search='/);
  assert.match(html, /encodeURIComponent\(apiQuery\).*limit=8/);
  assert.match(html, /setTimeout\(async\(\)=>/);
  assert.match(html, /},350\)/);
  assert.match(html, /sequence!==state\.sequence/);
});

test("selecting a search result fills the player name and API ID", () => {
  assert.match(html, /nameInput\.value=player\.name/);
  assert.match(html, /idInput\.value=String\(player\.id\)/);
  assert.match(html, /data-player-id=/);
  assert.match(html, /data-player-name=/);
});

test("manual player ID remains available as a fallback", () => {
  assert.match(html, /id="compareIdA" type="number"/);
  assert.match(html, /id="compareIdB" type="number"/);
  assert.match(html, /Выбери обоих игроков из поиска или введи их ID Live Tennis API вручную/);
});

test("Elo comparison renders independently of supplementary history and H2H requests", () => {
  assert.match(html, /async function loadCompareSupplementary\(/);
  assert.match(html, /status\.textContent='Elo рассчитан\. История и личные встречи загружаются отдельно/);
  assert.match(html, /loadCompareSupplementary\(requestId,idA,idB,exactNameA,exactNameB\)\.catch/);
  assert.match(html, /button\.disabled=false;button\.textContent='СРАВНИТЬ ИГРОКОВ'/);
  assert.match(html, /if\(requestId!==compareRequestSequence\)return/);
});

test("comparison rejects invalid Elo probabilities and ratings before rendering", () => {
  assert.match(html, /probabilityA<=0\|\|probabilityA>=100/);
  assert.match(html, /Math\.abs\(probabilityA\+probabilityB-100\)>0\.05/);
  assert.match(html, /API не вернул два корректных Elo-рейтинга/);
});

test("comparison displays a safe fair-odds fallback instead of NaN", () => {
  assert.match(html, /const fairOdds=\(value,probability\)=>/);
  assert.match(html, /fairOdds\(result\.fairOddsA,probA\)/);
  assert.match(html, /fairOdds\(result\.fairOddsB,probB\)/);
});


test("history parser accepts the documented Live Tennis HistoryMatch shape", () => {
  const start = html.indexOf("function deriveCompareHistory(");
  const end = html.indexOf("function renderCompareHistory(", start);
  assert.ok(start >= 0 && end > start, "history parser source must be present");
  const parserSource = html.slice(start, end);
  const sandbox = { Array, Date, Number, String, Object };
  vm.runInNewContext(parserSource + "\nglobalThis.deriveCompareHistory = deriveCompareHistory;", sandbox);

  const payload = {
    source: "Live Tennis API /history/matches",
    period: "2023-present",
    retrievedAt: "2026-11-22T12:00:00.000Z",
    data: [
      {
        id: 3003,
        scheduled_time: "2026-11-20T10:00:00.000Z",
        tournament: "ATP Example",
        surface: "hard",
        players: { p1: { id: 101, name: "Player A" }, p2: { id: 202, name: "Player B" } },
        winner: 1,
        score: { games: [[6, 7, 6], [4, 5, 2]] }
      },
      {
        id: 3002,
        scheduled_time: "2026-11-18T10:00:00.000Z",
        tournament: "WTA Example",
        surface: "clay",
        players: { p1: { id: 202, name: "Player B" }, p2: { id: 101, name: "Player A" } },
        winner: 1,
        score: { games: [[6, 6], [3, 4]] }
      },
      {
        id: 3001,
        scheduled_time: "2026-11-16T10:00:00.000Z",
        tournament: "ATP Older",
        surface: "grass",
        players: { p1: { id: 101, name: "Player A" }, p2: { id: 303, name: "Player C" } },
        winner: 2,
        score: { games: [[4, 4], [6, 6]] }
      },
      { id: 3999, winner: 1, surface: "hard" }
    ]
  };

  const historyA = sandbox.deriveCompareHistory(payload, 101);
  assert.equal(historyA.sample, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(historyA.last5.map(row => row.winner))), ["L", "W", "L"]);
  assert.deepEqual(JSON.parse(JSON.stringify(historyA.last5.map(row => row.opponent))), ["Player C", "Player B", "Player B"]);
  assert.deepEqual(JSON.parse(JSON.stringify(historyA.last5.map(row => row.date))), [
    "2026-11-16T10:00:00.000Z",
    "2026-11-18T10:00:00.000Z",
    "2026-11-20T10:00:00.000Z"
  ]);
  assert.equal(historyA.form10.wins, 1);
  assert.equal(historyA.form10.losses, 2);
  assert.equal(historyA.bySurface.hard.wins, 1);
  assert.equal(historyA.bySurface.clay.losses, 1);
  assert.equal(historyA.bySurface.grass.losses, 1);
  assert.equal(historyA.last5[2].score, "6-4 7-5 6-2");

  const historyB = sandbox.deriveCompareHistory(payload, 202);
  assert.equal(historyB.sample, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(historyB.last5.map(row => row.winner))), ["W", "L"]);
  assert.equal(historyB.last5[0].score, "6-3 6-4");
});
