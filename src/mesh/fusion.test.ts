import assert from "node:assert/strict";
import test from "node:test";
import { coarsenFusion, fuseSample } from "./fusion";
import type { Accum } from "./types";

test("repeat looks fuse into the same cell and average down the noise", () => {
  const map = new Map<string, Accum>();
  let voxel = 0.02;
  voxel = fuseSample(map, { x: 1, y: 2, z: 3 }, "depth", voxel);
  voxel = fuseSample(map, { x: 1.004, y: 2.002, z: 2.998 }, "depth", voxel);
  assert.equal(map.size, 1);
  const cell = [...map.values()][0];
  assert.equal(cell.n, 2);
  assert.ok(Math.abs(cell.x / cell.n - 1.002) < 1e-6);
  assert.equal(voxel, 0.02);
});

test("a full map coarsens instead of growing a second surface", () => {
  const map = new Map<string, Accum>();
  let voxel = 0.02;
  for (let i = 0; i < 8; i++) {
    voxel = fuseSample(map, { x: i * 0.05, y: 0, z: 0 }, "depth", voxel, 4);
  }
  assert.ok(map.size <= 4);
  assert.ok(voxel >= 0.04);
  const weight = [...map.values()].reduce((sum, cell) => sum + cell.n, 0);
  assert.equal(weight, 8);
});

test("coarsening keeps the weighted mean", () => {
  const map = new Map<string, Accum>();
  map.set("a", { x: 0, y: 0, z: 0, n: 1, kind: "depth" });
  map.set("b", { x: 0.09, y: 0, z: 0, n: 3, kind: "depth" });
  coarsenFusion(map, 0.1);
  assert.equal(map.size, 1);
  const cell = [...map.values()][0];
  assert.equal(cell.n, 4);
  assert.ok(Math.abs(cell.x / cell.n - 0.0225) < 1e-6);
});
