import assert from "node:assert/strict";
import test from "node:test";
import { buildRoute, buildScan, makePoint } from "../domain/create";
import { createMemoryRepository } from "./repository";

test("scans and their routes stay together on the phone", async () => {
  const repo = createMemoryRepository();
  const scan = buildScan({
    name: "Sunset Boulder – East Face",
    latitude: 33.892,
    longitude: -118.411,
    scanQuality: "medium",
    now: "2026-11-27T00:00:00.000Z",
  });
  await repo.saveScan(scan);
  const route = buildRoute({
    rockScanId: scan.id,
    name: "Mountain Chicken Direct",
    grade: "V5",
    type: "boulder",
    points: [
      makePoint({ x: 0.12, y: 0.45, z: -0.08 }, "start", 0),
      makePoint({ x: 0.31, y: 1.22, z: -0.15 }, "hold", 1),
      makePoint({ x: 0.18, y: 2.1, z: -0.22 }, "finish", 2),
    ],
    now: "2026-11-27T00:00:00.000Z",
  });
  await repo.saveRoute(route);
  const loaded = await repo.load();
  assert.equal(loaded.scans.length, 1);
  assert.equal(loaded.routes[0].grade, "V5");
  await repo.deleteScan(scan.id);
  const empty = await repo.load();
  assert.equal(empty.scans.length, 0);
  assert.equal(empty.routes.length, 0);
});
