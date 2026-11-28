import assert from "node:assert/strict";
import test from "node:test";
import { coverageAdvice, coverageGrid } from "./coverage";

test("a face with an empty bottom asks for a pass from below", () => {
  const points = [];
  for (let y = 1.6; y <= 2.6; y += 0.08) {
    for (let x = -0.8; x <= 0.8; x += 0.08) points.push({ x, y, z: 0 });
  }
  points.push({ x: 0, y: 0.1, z: 0 }, { x: 0.2, y: 0.2, z: 0 });
  const grid = coverageGrid(points);
  assert.match(coverageAdvice(grid, 1.2), /from below/);
});

test("standing far back asks the climber to move closer", () => {
  const points = [];
  for (let y = 0; y <= 2; y += 0.15) {
    for (let x = -1; x <= 1; x += 0.15) points.push({ x, y, z: 0 });
  }
  const grid = coverageGrid(points);
  assert.match(coverageAdvice(grid, 3.1), /Move closer/);
});

test("an even face does not end the scan", () => {
  const points = [];
  for (let y = 0; y <= 2; y += 0.1) {
    for (let x = -1; x <= 1; x += 0.1) points.push({ x, y, z: 0 });
  }
  const advice = coverageAdvice(coverageGrid(points), 1.4);
  assert.match(advice, /same scan|Finish only when/);
  assert.doesNotMatch(advice, /half-circle|auto/);
});
