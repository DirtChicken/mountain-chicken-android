import assert from "node:assert/strict";
import test from "node:test";
import { toBase64 } from "../codec/base64";
import { encodeRgba } from "../codec/jpeg";
import type { SurfaceMesh } from "./types";
import { bakeFaceTexture, decodeScanPhoto, projectToPhoto, texturedObj, type ScanPhoto } from "./photo";

test("a point in front of the camera lands on the photo pixel", () => {
  const photo = identityPhoto();
  const hit = projectToPhoto({ x: 0, y: 0, z: -2 }, photo);
  assert.ok(hit);
  assert.ok(Math.abs(hit.x - 8) < 0.01);
  assert.ok(Math.abs(hit.y - 8) < 0.01);
  const right = projectToPhoto({ x: 0.5, y: 0, z: -2 }, photo);
  assert.ok(right);
  assert.ok(right.x > hit.x);
});

test("a saved face photo is painted onto the model and written next to the OBJ", () => {
  const photo = identityPhoto();
  photo.jpegBase64 = toBase64(encodeRgba(solid(photo.width, photo.height, [20, 140, 220]), photo.width, photo.height, 90));
  const image = decodeScanPhoto(photo);
  assert.ok(image.data[2] > 150);
  const mesh = frontQuad();
  const baked = bakeFaceTexture(mesh, [photo], [image], { x: 0, y: 0, z: 0 }, 32);
  assert.ok(baked);
  assert.ok(baked.coloredTexels > 10);
  assert.equal(baked.jpeg[0], 0xff);
  assert.equal(baked.jpeg[1], 0xd8);
  const files = texturedObj(mesh, baked.uvs);
  assert.match(files.obj, /vt /);
  assert.match(files.obj, /mtllib mesh.mtl/);
  assert.match(files.mtl, /map_Kd mesh.jpg/);
});

function identityPhoto(): ScanPhoto {
  return {
    width: 16,
    height: 16,
    fx: 16,
    fy: 16,
    cx: 8,
    cy: 8,
    worldFromCamera: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    jpegBase64: "",
  };
}

function frontQuad(): SurfaceMesh {
  return {
    positions: Float32Array.from([
      -0.4, -0.4, -2,
      0.4, -0.4, -2,
      0.4, 0.4, -2,
      -0.4, 0.4, -2,
    ]),
    normals: Float32Array.from([
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
    bounds: {
      min: { x: -0.4, y: -0.4, z: -2 },
      max: { x: 0.4, y: 0.4, z: -2 },
    },
  };
}

function solid(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return data;
}

