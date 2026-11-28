import assert from "node:assert/strict";
import test from "node:test";
import { transformPoint } from "../viewer/math";
import { projectPoint, translate, type Intrinsics } from "./pose";
import { recognizeFrame, toBase64, type FingerprintMap } from "./map";
import type { Feature } from "./features";

const K: Intrinsics = { fx: 500, fy: 500, cx: 240, cy: 320 };

test("stored fingerprints put the saved rock back into this visit", () => {
  const pose = translate(0.15, 1.1, 2.8);
  const anchors = [
    { x: -0.5, y: 0.5, z: 0.05 },
    { x: 0.55, y: 0.45, z: -0.08 },
    { x: 0.4, y: 1.5, z: 0.1 },
    { x: -0.45, y: 1.55, z: -0.04 },
    { x: 0.05, y: 1, z: 0.2 },
    { x: 0.25, y: 0.75, z: -0.12 },
    { x: -0.15, y: 1.25, z: 0.08 },
    { x: 0.3, y: 1.2, z: 0 },
  ];
  const live: Feature[] = [];
  const mapPoints = anchors.map((point, index) => {
    const projected = projectPoint(point, pose, K);
    if (!projected) throw new Error("anchor is behind the camera");
    const descriptor = new Uint8Array(32);
    descriptor[index] = 255;
    descriptor[31] = index + 3;
    live.push({ x: projected.u, y: projected.v, descriptor });
    return { ...point, d: toBase64(descriptor) };
  });
  const map: FingerprintMap = {
    version: 1,
    scanId: "scan_east",
    name: "East face",
    frames: [{ fx: K.fx, fy: K.fy, cx: K.cx, cy: K.cy, points: mapPoints }],
  };
  const found = recognizeFrame(live, K, pose, [map]);
  assert.ok(found);
  assert.equal(found.name, "East face");
  assert.equal(found.confidence, "fair");
  const hold = transformPoint(found.sessionFromScan, { x: 0.4, y: 1.2, z: 0 });
  assert.ok(Math.hypot(hold.x - 0.4, hold.y - 1.2, hold.z) < 0.1);
});
