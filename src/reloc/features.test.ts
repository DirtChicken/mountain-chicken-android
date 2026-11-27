import assert from "node:assert/strict";
import test from "node:test";
import { extractFeatures, matchFeatures, sharpness } from "./features";

test("a flat frame is blurrier than a frame with edges, and corners match themselves", () => {
  const flat = solid(48, 48, 40);
  const edged = solid(48, 48, 30);
  fill(edged, 48, 8, 8, 20, 20, 220);
  assert.ok(sharpness(gray(flat), 48, 48) < sharpness(gray(edged), 48, 48));
  const first = extractFeatures(edged, 48, 48);
  const second = extractFeatures(edged, 48, 48);
  assert.ok(first.length >= 4);
  const pairs = matchFeatures(first, second);
  assert.ok(pairs.length >= 4);
});

function solid(width: number, height: number, value: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return data;
}

function fill(rgba: Uint8Array, width: number, x: number, y: number, w: number, h: number, value: number): void {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const index = (row * width + col) * 4;
      rgba[index] = value;
      rgba[index + 1] = value;
      rgba[index + 2] = value;
    }
  }
}

function gray(rgba: Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return out;
}
