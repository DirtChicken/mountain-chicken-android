import assert from "node:assert/strict";
import test from "node:test";
import { meshToGlb } from "../mesh/glb";
import type { SurfaceMesh } from "../mesh/types";
import { applySimilarity, solveSimilarity, transformGlb } from "./similarity";

test("a scaled, turned, and shifted cloud lines back up with the scan", () => {
  const source = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 1, z: 1 },
  ];
  const target = [
    { x: 5, y: -1, z: 0 },
    { x: 7, y: -1, z: 2 },
    { x: 5, y: 1, z: 2 },
    { x: 7, y: 1, z: 0 },
  ];
  const similarity = solveSimilarity(source, target);
  assert.ok(similarity);
  assert.ok(Math.abs(similarity.scale - 2) < 1e-6);
  for (let i = 0; i < source.length; i++) {
    const moved = applySimilarity(similarity, source[i]);
    assert.ok(Math.abs(moved.x - target[i].x) < 1e-5);
    assert.ok(Math.abs(moved.y - target[i].y) < 1e-5);
    assert.ok(Math.abs(moved.z - target[i].z) < 1e-5);
  }
});

test("a straight line of cameras is not enough to fix a rock", () => {
  const line = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }];
  assert.equal(solveSimilarity(line, line), null);
});

test("the detailed GLB moves into the scan frame and keeps its header", () => {
  const mesh: SurfaceMesh = {
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: Uint32Array.from([0, 1, 2]),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } },
  };
  const glb = meshToGlb(mesh, new Uint8Array(9), new Float32Array(6), new Uint8Array([0xff, 0xd8]));
  const similarity = solveSimilarity(
    [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
    [{ x: 3, y: 4, z: 5 }, { x: 5, y: 4, z: 5 }, { x: 3, y: 6, z: 5 }],
  );
  assert.ok(similarity);
  const moved = transformGlb(glb, similarity);
  assert.equal(String.fromCharCode(...moved.slice(0, 4)), "glTF");
  const view = new DataView(moved.buffer, moved.byteOffset, moved.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(moved.slice(20, 20 + jsonLength))) as {
    accessors: { min: number[]; bufferView: number }[];
    bufferViews: { byteOffset: number }[];
  };
  const start = 20 + jsonLength + 8 + json.bufferViews[json.accessors[0].bufferView].byteOffset;
  const x = view.getFloat32(start, true);
  const y = view.getFloat32(start + 4, true);
  const z = view.getFloat32(start + 8, true);
  assert.ok(Math.abs(x - 3) < 1e-4);
  assert.ok(Math.abs(y - 4) < 1e-4);
  assert.ok(Math.abs(z - 5) < 1e-4);
});
