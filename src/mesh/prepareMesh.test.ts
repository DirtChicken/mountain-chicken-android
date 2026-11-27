import assert from "node:assert/strict";
import test from "node:test";
import { meshToObj, objToMesh } from "./obj";
import { AR_LIMITS, DISPLAY_LIMITS, highestIndex, prepareMeshForDisplay, vertexCount } from "./prepareMesh";
import { meshBounds } from "./reconstruct";
import type { SurfaceMesh } from "./types";

test("a large saved scan opens under the Android GL index limit", () => {
  const raw = largeRock(80_000);
  assert.ok(highestIndex(raw) > 65535, "the fixture has to be past the 16-bit index limit");
  const saved = objToMesh(meshToObj(raw));
  const view = prepareMeshForDisplay(saved);
  assert.ok(vertexCount(view) > 100);
  assert.ok(vertexCount(view) <= DISPLAY_LIMITS.maxVertices);
  assert.ok(view.indices.length / 3 <= DISPLAY_LIMITS.maxTriangles);
  assert.ok(highestIndex(view) <= 65535);
  assert.ok(highestIndex(view) < vertexCount(view));
  for (let i = 0; i < view.indices.length; i++) {
    assert.ok(view.indices[i] >= 0 && view.indices[i] < vertexCount(view));
  }
  for (let i = 0; i < view.positions.length; i++) assert.ok(Number.isFinite(view.positions[i]));
  assert.ok(Number.isFinite(view.bounds.min.x) && Number.isFinite(view.bounds.max.y));

  const inRoom = prepareMeshForDisplay(saved, AR_LIMITS);
  assert.ok(vertexCount(inRoom) <= AR_LIMITS.maxVertices);
  assert.ok(inRoom.indices.length / 3 <= AR_LIMITS.maxTriangles);
});

test("a broken vertex in a saved scan is left out instead of poisoning the model", () => {
  const mesh = largeRock(400, 20);
  mesh.positions[10] = Number.NaN;
  const view = prepareMeshForDisplay(mesh);
  for (let i = 0; i < view.positions.length; i++) assert.ok(Number.isFinite(view.positions[i]));
  assert.ok(vertexCount(view) < 400);
  assert.ok(vertexCount(view) > 10);
});

function largeRock(count: number, columns = 400): SurfaceMesh {
  const rows = Math.ceil(count / columns);
  const vertices = columns * rows;
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  for (let i = 0; i < vertices; i++) {
    const x = i % columns;
    const y = Math.floor(i / columns);
    positions[i * 3] = x * 0.02;
    positions[i * 3 + 1] = y * 0.02;
    positions[i * 3 + 2] = 0.04 * Math.sin(x * 0.2) * Math.cos(y * 0.15);
    normals[i * 3 + 2] = 1;
  }
  const indices: number[] = [];
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < columns - 1; x++) {
      const i = y * columns + x;
      indices.push(i, i + 1, i + columns, i + 1, i + columns + 1, i + columns);
    }
  }
  const positionArray = positions;
  return {
    positions: positionArray,
    normals,
    indices: Uint32Array.from(indices),
    bounds: meshBounds(positionArray),
  };
}
