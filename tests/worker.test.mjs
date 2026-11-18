import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const workerSource = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const helperSource = workerSource.slice(0, workerSource.indexOf("async function getPlayerProfile"));
const sandbox = { Response, URL, Request, Set, Object, Number, Math, JSON };
vm.runInNewContext(
  helperSource + "\\nglobalThis.testHelpers = { findElo, eloProbability, response };",
  sandbox
);
const { findElo, eloProbability, response } = sandbox.testHelpers;

test("overall Elo takes precedence over surface Elo", () => {
  assert.equal(findElo({ clay_elo: 2100, stats: { overall_elo: 1850 } }), 1850);
});

test("generic Elo is used when overall Elo is absent", () => {
  assert.equal(findElo({ stats: { elo: 1725 } }), 1725);
});

test("surface-only ratings are not mistaken for overall Elo", () => {
  assert.equal(findElo({ clay_elo: 1900, hard_elo: 1800, grass_elo: 1700 }), null);
});

test("invalid overall rating falls back to valid generic Elo", () => {
  assert.equal(findElo({ overall_elo: 0, elo: 1660 }), 1660);
});

test("Elo values outside the accepted range are rejected", () => {
  assert.equal(findElo({ overall_elo: 5001 }), null);
  assert.equal(findElo({ overall_elo: -10 }), null);
});

test("cyclic profile objects do not cause recursion failure", () => {
  const profile = { elo: 1777 };
  profile.self = profile;
  assert.equal(findElo(profile), 1777);
});

test("equal Elo ratings produce equal win probabilities", () => {
  assert.equal(eloProbability(1800, 1800), 0.5);
});

test("a 400-point Elo advantage produces about 90.91% probability", () => {
  assert.ok(Math.abs(eloProbability(2000, 1600) - 0.9090909) < 0.000001);
});

test("probabilities for reversed players sum to one", () => {
  const pA = eloProbability(1940, 1810);
  const pB = eloProbability(1810, 1940);
  assert.ok(Math.abs(pA + pB - 1) < 1e-12);
});

test("JSON responses include CORS and content type headers", () => {
  const result = response({ ok: true });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(result.headers.get("Content-Type"), /application\\/json/);
});
