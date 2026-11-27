import assert from "node:assert/strict";
import test from "node:test";
import { dist } from "../domain/vec";
import type { SurfaceMesh } from "../mesh/types";
import { rayFromScreen } from "./math";
import { raycastMesh } from "./raycast";

test("a screen-center ray looks at the orbit target and hits a triangle", () => {
  const mesh: SurfaceMesh = {
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: Uint32Array.from([0, 1, 2]),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } },
  };
  const ray = rayFromScreen({
    touchX: 100,
    touchY: 100,
    width: 200,
    height: 200,
    target: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    distance: 5,
  });
  assert.ok(Math.abs(ray.direction.x) < 0.05);
  assert.ok(Math.abs(ray.direction.y) < 0.05);
  assert.ok(ray.direction.z < -0.9);

  const hit = raycastMesh(mesh, {
    origin: { x: 0.2, y: 0.2, z: 1 },
    direction: { x: 0, y: 0, z: -1 },
  });
  if (!hit) throw new Error("ray missed the triangle");
  assert.ok(dist(hit.point, { x: 0.2, y: 0.2, z: 0 }) < 1e-5);
});
