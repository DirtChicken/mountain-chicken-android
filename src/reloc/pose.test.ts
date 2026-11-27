import assert from "node:assert/strict";
import test from "node:test";
import { multiply, transformPoint, type Mat4 } from "../viewer/math";
import { cameraBasisError, nudgeYaw, placedPoint, projectPoint, sessionFromScan, solvePnp, translate, type Intrinsics, type Observation } from "./pose";

const K: Intrinsics = { fx: 600, fy: 600, cx: 320, cy: 240 };

test("pose solve recovers a camera sitting in front of the rock", () => {
  const truth = translate(0.2, 1.4, 3);
  const solved = solvePnp(observe(truth), K, { seed: 3 });
  assert.ok(solved);
  const error = cameraBasisError(solved.worldFromCamera, truth);
  assert.ok(error.position < 0.05, `position ${error.position}`);
  assert.ok(error.direction < 0.05, `direction ${error.direction}`);
  assert.ok(solved.inliers >= 8);
});

test("pose solve ignores outliers and still lands the camera", () => {
  const truth = translate(-0.4, 0.8, 2.5);
  const clean = observe(truth);
  const dirty = clean.concat([
    { point: { x: 0.2, y: 1, z: 0.2 }, u: 12, v: 400 },
    { point: { x: -0.3, y: 0.4, z: 0.1 }, u: 600, v: 10 },
    { point: { x: 0.5, y: 1.2, z: -0.2 }, u: 20, v: 20 },
  ]);
  const solved = solvePnp(dirty, K, { seed: 9, thresholdPx: 6, iterations: 200 });
  assert.ok(solved);
  const error = cameraBasisError(solved.worldFromCamera, truth);
  assert.ok(error.position < 0.08, `position ${error.position}`);
  assert.equal(solved.inliers, clean.length);
});

test("pose solve recovers a camera that has turned to the side", () => {
  const truth = multiply(translate(0.3, 1.1, 3.2), rotateY(0.35));
  const solved = solvePnp(observe(truth), K, { seed: 4 });
  assert.ok(solved);
  const error = cameraBasisError(solved.worldFromCamera, truth);
  assert.ok(error.position < 0.08, `position ${error.position}`);
  assert.ok(error.direction < 0.08, `direction ${error.direction}`);
});

test("a solved pose puts the saved rock into the current session, and a nudge twists it", () => {
  const scanCamera: Mat4 = translate(0, 1, 4);
  const observations = observe(scanCamera);
  const solved = solvePnp(observations, K, { seed: 2 });
  assert.ok(solved);
  const live = multiply(translate(10, 0, 0), scanCamera);
  const placed = sessionFromScan(live, solved.cameraFromWorld);
  const hold = placedPoint(placed, { x: 0.3, y: 1.2, z: 0 });
  const expected = transformPoint(translate(10, 0, 0), { x: 0.3, y: 1.2, z: 0 });
  assert.ok(Math.hypot(hold.x - expected.x, hold.y - expected.y, hold.z - expected.z) < 0.08);
  const twisted = nudgeYaw(placed, Math.PI / 2);
  const spun = placedPoint(twisted, { x: 1, y: 0, z: 0 });
  const spunExpected = transformPoint(multiply(translate(10, 0, 0), rotateY(Math.PI / 2)), { x: 1, y: 0, z: 0 });
  assert.ok(Math.abs(spun.x - spunExpected.x) < 0.15);
  assert.ok(Math.abs(spun.z - spunExpected.z) < 0.15);
});

function observe(worldFromCamera: Mat4): Observation[] {
  const points = [
    { x: -0.6, y: 0.4, z: 0 },
    { x: 0.6, y: 0.4, z: 0.1 },
    { x: 0.5, y: 1.6, z: -0.1 },
    { x: -0.5, y: 1.7, z: 0.05 },
    { x: 0, y: 1, z: 0.2 },
    { x: 0.2, y: 0.7, z: -0.15 },
    { x: -0.2, y: 1.3, z: 0.12 },
    { x: 0.35, y: 1.15, z: -0.05 },
  ];
  return points.flatMap((point) => {
    const projected = projectPoint(point, worldFromCamera, K);
    return projected ? [{ point, u: projected.u, v: projected.v }] : [];
  });
}

function rotateY(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
