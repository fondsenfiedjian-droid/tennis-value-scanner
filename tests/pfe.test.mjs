import test from "node:test";
import assert from "node:assert/strict";
import { fusePredictions } from "../pfe.js";

test("General Elo and Surface Elo in the same family are one independent group", () => {
  const result = fusePredictions([
    { id: "general-elo-v2", dependencyGroup: "elo-ratings", probability: 0.68, quality: 1 },
    { id: "surface-elo", dependencyGroup: "elo-ratings", probability: 0.74, quality: 1 }
  ]);

  assert.equal(result.status, "provisional");
  assert.equal(result.modelCount, 2);
  assert.equal(result.independentGroups, 1);
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].modelIds, ["general-elo-v2", "surface-elo"]);
  assert.equal(result.groups[0].weight, 1);
  assert.ok(Math.abs(result.probability - 0.71) < 1e-12);
});

test("overlapping dependency sets merge transitively into one component", () => {
  const result = fusePredictions([
    { id: "elo", dependencyGroup: "elo-ratings", probability: 0.62 },
    { id: "hybrid", dependencyGroups: ["elo-ratings", "form-history"], probability: 0.66 },
    { id: "form", dependencyGroup: "form-history", probability: 0.70 },
    { id: "market", dependencyGroup: "bookmaker-market", probability: 0.64 }
  ]);

  assert.equal(result.independentGroups, 2);
  assert.equal(result.status, "provisional");
  assert.deepEqual(result.groups.map(group => group.modelIds), [
    ["elo", "hybrid", "form"],
    ["market"]
  ]);
});

test("independent sources reach consensus when their disagreement is below threshold", () => {
  const result = fusePredictions([
    { id: "elo", dependencyGroup: "elo-ratings", probability: 0.65 },
    { id: "independent-form", dependencyGroup: "form-model", probability: 0.72 }
  ]);

  assert.equal(result.status, "consensus");
  assert.equal(result.independentGroups, 2);
  assert.ok(Math.abs(result.probability - 0.685) < 1e-12);
});

test("one usable independent group is provisional, not a missing forecast", () => {
  const result = fusePredictions([
    { id: "elo", dependencyGroup: "elo-ratings", probability: 0.61 }
  ]);

  assert.equal(result.status, "provisional");
  assert.equal(result.independentGroups, 1);
  assert.equal(result.probability, 0.61);
});

test("strong disagreement between independent groups is marked conflict", () => {
  const result = fusePredictions([
    { id: "elo", dependencyGroup: "elo-ratings", probability: 0.82 },
    { id: "independent-model", dependencyGroup: "independent-model", probability: 0.60 }
  ]);

  assert.equal(result.status, "conflict");
  assert.ok(Math.abs(result.disagreement - 0.22) < 1e-12);
});

test("zero-quality models do not influence the fused probability", () => {
  const result = fusePredictions([
    { id: "untrusted", dependencyGroup: "weak-source", probability: 0.99, quality: 0 },
    { id: "elo", dependencyGroup: "elo-ratings", probability: 0.63, quality: 1 }
  ]);

  assert.equal(result.status, "provisional");
  assert.equal(result.modelCount, 1);
  assert.equal(result.independentGroups, 1);
  assert.equal(result.probability, 0.63);
});

test("all zero-quality models produce no_data", () => {
  const result = fusePredictions([
    { id: "a", dependencyGroup: "a", probability: 0.60, quality: 0 },
    { id: "b", dependencyGroup: "b", probability: 0.70, quality: 0 }
  ]);

  assert.equal(result.status, "no_data");
  assert.equal(result.probability, null);
  assert.equal(result.independentGroups, 0);
});

test("invalid probabilities, missing IDs and duplicate IDs are rejected", () => {
  const result = fusePredictions([
    { id: "elo", dependencyGroup: "elo", probability: 0.60 },
    { id: "elo", dependencyGroup: "other", probability: 0.70 },
    { id: "edge-low", probability: 0 },
    { id: "edge-high", probability: 1 },
    { id: "nan", probability: Number.NaN },
    { id: "   ", probability: 0.55 }
  ]);

  assert.equal(result.modelCount, 1);
  assert.equal(result.rejected.length, 5);
  assert.deepEqual(result.rejected.map(row => row.reason), [
    "duplicate_id",
    "invalid_probability",
    "invalid_probability",
    "invalid_probability",
    "missing_id"
  ]);
});

test("invalid quality and calibrated weights are rejected", () => {
  const result = fusePredictions([
    { id: "bad-quality", probability: 0.6, quality: 1.1 },
    { id: "negative-quality", probability: 0.6, quality: -0.1 },
    { id: "bad-weight", probability: 0.6, calibratedWeight: 11 },
    { id: "good", probability: 0.6, quality: 1, calibratedWeight: 1 }
  ]);

  assert.equal(result.modelCount, 1);
  assert.equal(result.rejected.length, 3);
  assert.ok(result.rejected.every(row => row.reason === "invalid_weight_or_quality"));
});

test("correlated models contribute the strongest weight, not summed weights", () => {
  const result = fusePredictions([
    { id: "elo", dependencyGroup: "elo-family", probability: 0.60, quality: 1, calibratedWeight: 1 },
    { id: "surface-elo", dependencyGroup: "elo-family", probability: 0.80, quality: 1, calibratedWeight: 2 },
    { id: "market", dependencyGroup: "market", probability: 0.70, quality: 1, calibratedWeight: 1 }
  ]);

  assert.equal(result.independentGroups, 2);
  assert.equal(result.groups[0].weight, 2);
  assert.ok(Math.abs(result.groups[0].probability - (0.60 + 1.60) / 3) < 1e-12);
  assert.ok(Math.abs(result.probability - (((0.60 + 1.60) / 3) * 2 + 0.70) / 3) < 1e-12);
});

test("uncertainty is averaged within a dependency component and omitted when incomplete", () => {
  const complete = fusePredictions([
    { id: "a", dependencyGroup: "shared", probability: 0.60, uncertainty: 0.10 },
    { id: "b", dependencyGroup: "shared", probability: 0.70, uncertainty: 0.20 }
  ]);
  assert.ok(Math.abs(complete.groups[0].uncertainty - 0.15) < 1e-12);

  const incomplete = fusePredictions([
    { id: "a", dependencyGroup: "shared", probability: 0.60, uncertainty: 0.10 },
    { id: "b", dependencyGroup: "shared", probability: 0.70 }
  ]);
  assert.equal(incomplete.groups[0].uncertainty, null);
});

test("conflict threshold is clamped to the supported range", () => {
  const predictions = [
    { id: "a", dependencyGroup: "a", probability: 0.70 },
    { id: "b", dependencyGroup: "b", probability: 0.72 }
  ];
  assert.equal(fusePredictions(predictions, { conflictThreshold: -1 }).status, "consensus");
  assert.equal(fusePredictions(predictions, { conflictThreshold: 0.001 }).status, "conflict");
});
