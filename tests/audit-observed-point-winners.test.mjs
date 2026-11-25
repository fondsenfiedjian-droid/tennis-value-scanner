import test from "node:test";
import assert from "node:assert/strict";
import { auditObservedWinnerTransitions } from "../scripts/audit-observed-point-winners.mjs";

test("winner matches ordinary point-score advances for either player", () => {
  const tape = [
    { sequence: 1, sets: [0,0], games: [[0],[0]], points: ["0","0"], winner: null },
    { sequence: 2, sets: [0,0], games: [[0],[0]], points: ["15","0"], winner: 1 },
    { sequence: 3, sets: [0,0], games: [[0],[0]], points: ["15","15"], winner: 2 }
  ];
  const result = auditObservedWinnerTransitions(tape);
  assert.equal(result.comparableTransitions, 2);
  assert.equal(result.agreements, 2);
  assert.equal(result.disagreements, 0);
});

test("winner matches advantage loss and completed-game score transition", () => {
  const tape = [
    { sequence: 1, sets: [0,0], games: [[0],[0]], points: ["40","AD"], winner: null },
    { sequence: 2, sets: [0,0], games: [[0],[0]], points: ["40","40"], winner: 1 },
    { sequence: 3, sets: [0,0], games: [[0],[0]], points: ["40","AD"], winner: 2 },
    { sequence: 4, sets: [0,0], games: [[1],[0]], points: ["0","0"], winner: 1 }
  ];
  const result = auditObservedWinnerTransitions(tape);
  assert.equal(result.comparableTransitions, 3);
  assert.equal(result.agreements, 3);
  assert.equal(result.disagreements, 0);
});

test("numeric tiebreak point scores are compared without assuming regular scoring", () => {
  const tape = [
    { sequence: 1, sets: [1,1], games: [[6,6],[6,6]], points: ["4","3"], winner: null },
    { sequence: 2, sets: [1,1], games: [[6,6],[6,6]], points: ["5","3"], winner: 1 },
    { sequence: 3, sets: [1,1], games: [[6,6],[6,6]], points: ["5","4"], winner: 2 }
  ];
  const result = auditObservedWinnerTransitions(tape);
  assert.equal(result.comparableTransitions, 2);
  assert.equal(result.agreements, 2);
});

test("ambiguous transitions and sequence gaps are not falsely scored", () => {
  const tape = [
    { sequence: 1, sets: [0,0], games: [[0],[0]], points: ["0","0"], winner: null },
    { sequence: 3, sets: [0,0], games: [[0],[0]], points: ["15","15"], winner: 1 },
    { sequence: 4, sets: [0,0], games: [[0],[0]], points: ["15","15"], winner: 2 }
  ];
  const result = auditObservedWinnerTransitions(tape);
  assert.equal(result.sequenceGaps, 1);
  assert.equal(result.unclassifiedTransitions, 1);
  assert.equal(result.comparableTransitions, 0);
  assert.equal(result.disagreements, 0);
});

test("set-score increments classify completed-set transitions", () => {
  const tape = [
    { sequence: 10, sets: [0,0], games: [[6],[6]], points: ["6","5"], winner: null },
    { sequence: 11, sets: [1,0], games: [[7,0],[6,0]], points: ["0","0"], winner: 1 },
    { sequence: 12, sets: [1,1], games: [[7,5],[6,6]], points: ["0","0"], winner: 2 },
    { sequence: 13, sets: [2,1], games: [[7,5,7],[6,6,6]], points: ["0","0"], winner: 1 }
  ];
  const result = auditObservedWinnerTransitions(tape);
  assert.equal(result.comparableTransitions, 3);
  assert.equal(result.agreements, 3);
  assert.equal(result.disagreements, 0);
});
