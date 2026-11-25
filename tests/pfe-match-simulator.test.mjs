import test from "node:test";
import assert from "node:assert/strict";
import PFE from "../pfe.js";

const { runMatchMonteCarlo } = PFE;

test("PFE match simulation accepts a fixed first server and reports it", () => {
  const result = runMatchMonteCarlo(0.68, 0.58, {
    bestOf: 3, iterations: 20000, seed: 12345, firstServer: "A"
  });
  assert.equal(result.status, "scenario");
  assert.equal(result.firstServer, "A");
  assert.equal(result.iterations, 20000);
});

test("changing the first server changes the simulated service sequence", () => {
  const options = { bestOf: 3, iterations: 30000, seed: 24680 };
  const firstA = runMatchMonteCarlo(0.68, 0.58, { ...options, firstServer: "A" });
  const firstB = runMatchMonteCarlo(0.68, 0.58, { ...options, firstServer: "B" });
  assert.equal(firstA.firstServer, "A");
  assert.equal(firstB.firstServer, "B");
  assert.notEqual(firstA.probabilityA, firstB.probabilityA);
});

test("PFE match simulation preserves random-first-server default", () => {
  const result = runMatchMonteCarlo(0.64, 0.61, {
    bestOf: 3, iterations: 1000, seed: 987
  });
  assert.equal(result.status, "scenario");
  assert.equal(result.firstServer, "random");
});

test("PFE match simulation rejects an unsupported first-server value", () => {
  const result = runMatchMonteCarlo(0.64, 0.61, {
    bestOf: 3, iterations: 1000, firstServer: "C"
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "invalid_first_server");
});
