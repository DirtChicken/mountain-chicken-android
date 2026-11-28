import assert from "node:assert/strict";
import test from "node:test";
import type { Vector3 } from "../domain/types";
import { meshToObj, objToMesh } from "./obj";
import { practiceBoulder, practiceCloud } from "./practiceBoulder";
import { reconstructSurface } from "./reconstruct";
import { accumulateSample, chooseMeshPoints, pointsFromMap } from "./samples";
import type { Accum } from "./types";

test("a walked wall becomes a thin vertical surface", () => {
  const points: Vector3[] = [];
  for (let y = 0; y <= 1.2; y += 0.06) {
    for (let x = -0.8; x <= 0.8; x += 0.06) {
      points.push({ x, y, z: 0.02 * Math.sin(x * 6) });
    }
  }
  const mesh = reconstructSurface(points, { voxelSize: 0.04, band: 0.07 });
  if (!mesh) throw new Error("wall did not reconstruct");
  let nearPlane = 0;
  for (let i = 2; i < mesh.positions.length; i += 3) {
    if (Math.abs(mesh.positions[i]) < 0.12) nearPlane++;
  }
  assert.ok(nearPlane / (mesh.positions.length / 3) > 0.9);
  assert.ok(mesh.bounds.max.x - mesh.bounds.min.x > 1.2);
  assert.ok(mesh.bounds.max.y - mesh.bounds.min.y > 0.9);
});

test("depth samples beat planes when both exist", () => {
  const map = new Map<string, Accum>();
  for (let i = 0; i < 80; i++) accumulateSample(map, { x: i * 0.03, y: 1, z: 0 }, "depth");
  for (let i = 0; i < 40; i++) accumulateSample(map, { x: 0, y: 0, z: i * 0.03 }, "plane");
  const choice = chooseMeshPoints(pointsFromMap(map));
  assert.equal(choice.points.length, 80);
  assert.ok(choice.points.every((point) => point.y === 1));
});

test("practice boulder round-trips through OBJ", () => {
  const { mesh, points } = practiceBoulder();
  assert.ok(mesh.indices.length > 30);
  assert.equal(points[0].type, "start");
  const again = objToMesh(meshToObj(mesh));
  assert.equal(again.indices.length, mesh.indices.length);
  assert.ok(Math.abs(again.positions[0] - mesh.positions[0]) < 1e-4);
  assert.ok(practiceCloud(200).length > 50);
});
