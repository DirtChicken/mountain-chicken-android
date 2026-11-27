import assert from "node:assert/strict";
import test from "node:test";
import type { ScanPhoto } from "./photo";
import { rayThroughPixel, triangulateRays } from "./stereoDepth";

test("two looks at the same hold meet on that hold", () => {
  const left = photoAt(0);
  const right = photoAt(0.4);
  const rayA = rayThroughPixel(left, left.cx, left.cy);
  const rayB = rayThroughPixel(right, right.cx - (0.4 * right.fx) / 2, right.cy);
  assert.ok(rayA && rayB);
  const point = triangulateRays(rayA, rayB);
  assert.ok(point);
  assert.ok(Math.abs(point.x) < 0.05, `x ${point.x}`);
  assert.ok(Math.abs(point.y) < 0.05, `y ${point.y}`);
  assert.ok(Math.abs(point.z + 2) < 0.08, `z ${point.z}`);
});

function photoAt(x: number): ScanPhoto {
  return {
    width: 200,
    height: 200,
    fx: 100,
    fy: 100,
    cx: 100,
    cy: 100,
    worldFromCamera: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1],
    jpegBase64: "",
  };
}
