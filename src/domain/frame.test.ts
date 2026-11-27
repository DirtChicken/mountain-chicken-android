import assert from "node:assert/strict";
import test from "node:test";
import { originForAnchor, scanPointToWorld, worldPointToScan } from "./frame";
import { dist } from "./vec";

test("a placed scan point comes back out of the AR frame", () => {
  const origin = originForAnchor({ x: 2, y: 0.1, z: -3 }, { x: 0.4, y: 0.2, z: 0.5 }, 0.4, 1.2);
  const world = scanPointToWorld({ x: 0.15, y: 1.4, z: -0.2 }, origin, 0.4, 1.2);
  const scan = worldPointToScan(world, origin, 0.4, 1.2);
  assert.ok(dist(scan, { x: 0.15, y: 1.4, z: -0.2 }) < 1e-6);
  const anchorWorld = scanPointToWorld({ x: 0.4, y: 0.2, z: 0.5 }, origin, 0.4, 1.2);
  assert.ok(dist(anchorWorld, { x: 2, y: 0.1, z: -3 }) < 1e-6);
});
