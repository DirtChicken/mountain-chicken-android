import assert from "node:assert/strict";
import test from "node:test";
import { fromBase64, toBase64 } from "./base64";
import { decodeJpegBytes, encodeRgba } from "./jpeg";
import { meshToGlb } from "../mesh/glb";
import type { SurfaceMesh } from "../mesh/types";

test("base64 round-trips without Buffer, atob, or btoa", () => {
  const host = globalThis as { Buffer?: unknown; atob?: unknown; btoa?: unknown };
  const saved = { Buffer: host.Buffer, atob: host.atob, btoa: host.btoa };
  host.Buffer = undefined;
  host.atob = undefined;
  host.btoa = undefined;
  try {
    const bytes = Uint8Array.from([0, 1, 2, 255, 128, 9, 10, 11, 12]);
    const encoded = toBase64(bytes);
    assert.equal(encoded.includes("Buffer"), false);
    assert.deepEqual(fromBase64(encoded), bytes);
    assert.deepEqual(fromBase64("YQ=="), Uint8Array.from([97]));
  } finally {
    Object.assign(host, saved);
  }
});

test("jpeg encode and decode return real pixels without Buffer", () => {
  const host = globalThis as { Buffer?: unknown };
  const saved = host.Buffer;
  host.Buffer = undefined;
  try {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 12;
      rgba[i + 1] = 180;
      rgba[i + 2] = 40;
      rgba[i + 3] = 255;
    }
    const jpeg = encodeRgba(rgba, 4, 4, 85);
    assert.equal(jpeg.constructor, Uint8Array);
    assert.equal(jpeg[0], 0xff);
    assert.equal(jpeg[1], 0xd8);
    const image = decodeJpegBytes(jpeg);
    assert.equal(image.width, 4);
    assert.equal(image.height, 4);
    assert.ok(image.data instanceof Uint8Array);
    assert.ok(image.data[1] > 100);
    assert.ok(image.data[0] < 80);
  } finally {
    host.Buffer = saved;
  }
});

test("GLB packing keeps the jpeg bytes without Buffer", () => {
  const host = globalThis as { Buffer?: unknown };
  const saved = host.Buffer;
  host.Buffer = undefined;
  try {
    const mesh: SurfaceMesh = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: Uint32Array.from([0, 1, 2]),
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } },
    };
    const jpeg = encodeRgba(Uint8Array.from([200, 10, 10, 255]), 1, 1, 70);
    const glb = meshToGlb(mesh, Uint8Array.from([200, 10, 10]), Float32Array.from([0, 0, 1, 0, 0, 1]), jpeg);
    const packed = fromBase64(toBase64(glb));
    assert.equal(packed.length, glb.length);
    assert.equal(String.fromCharCode(packed[0], packed[1], packed[2], packed[3]), "glTF");
    const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = new TextDecoder().decode(packed.slice(20, 20 + jsonLength));
    const image = JSON.parse(json).bufferViews[5] as { byteOffset: number; byteLength: number };
    const binStart = 20 + jsonLength + 8;
    const embedded = packed.slice(binStart + image.byteOffset, binStart + image.byteOffset + image.byteLength);
    assert.equal(embedded.length, jpeg.length);
    assert.equal(embedded[0], 0xff);
    assert.equal(embedded[1], 0xd8);
    assert.equal(embedded[embedded.length - 2], jpeg[jpeg.length - 2]);
    assert.equal(embedded[embedded.length - 1], jpeg[jpeg.length - 1]);
  } finally {
    host.Buffer = saved;
  }
});
