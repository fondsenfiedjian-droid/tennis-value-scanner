import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("deploy preview calls the branch-isolated Cloudflare Worker while production keeps its Worker", () => {
  assert.match(html, /location\.hostname\.startsWith\('deploy-preview-'\)\?'https:\/\/ui-tennis-value-scanner-2-tennis-value-api\.fonds-enfiedjian\.workers\.dev'/);
  assert.match(html, /:'https:\/\/tennis-value-api\.fonds-enfiedjian\.workers\.dev'/);
});

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
