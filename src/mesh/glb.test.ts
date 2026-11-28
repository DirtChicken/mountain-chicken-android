import assert from "node:assert/strict";
import test from "node:test";
import { meshToGlb } from "./glb";
import type { SurfaceMesh } from "./types";

test("the saved model packs vertex colors and the photo into one GLB", () => {
  const mesh: SurfaceMesh = {
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: Uint32Array.from([0, 1, 2]),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } },
  };
  const colors = Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  const uvs = Float32Array.from([0, 0, 1, 0, 0, 1]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const glb = meshToGlb(mesh, colors, uvs, jpeg);
  assert.equal(String.fromCharCode(glb[0], glb[1], glb[2], glb[3]), "glTF");
  const jsonLength = new DataView(glb.buffer).getUint32(12, true);
  const json = new TextDecoder().decode(glb.slice(20, 20 + jsonLength));
  assert.match(json, /COLOR_0/);
  assert.match(json, /image\/jpeg/);
  assert.match(json, /KHR_materials_unlit/);
  assert.ok(glb.includes(0xff) && glb.includes(0xd8));
});
