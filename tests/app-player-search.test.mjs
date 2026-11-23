import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
