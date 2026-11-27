import assert from "node:assert/strict";
import test from "node:test";
import { buildRoute, makePoint } from "./create";
import { holdCount, routeLengthMeters } from "./route";

test("route length and hold count stay in scan meters", () => {
  const points = [
    makePoint({ x: 3, y: 0, z: 0 }, "hold", 1),
    makePoint({ x: 0, y: 0, z: 0 }, "start", 0),
    makePoint({ x: 3, y: 4, z: 0 }, "finish", 2),
  ];
  assert.equal(routeLengthMeters(points), 7);
  assert.equal(holdCount(points), 3);
  const route = buildRoute({
    rockScanId: "scan_abc",
    name: "The Chicken Wing",
    grade: "V5",
    type: "boulder",
    points,
    now: "2026-11-27T00:00:00.000Z",
  });
  assert.equal(route.lengthMeters, 7);
  assert.equal(route.numberOfHolds, 3);
  assert.deepEqual(route.points.map((point) => point.order), [0, 1, 2]);
  assert.equal(route.points[0].type, "start");
  assert.equal(route.points[2].position.y, 4);
});

test("a route with one point is refused", () => {
  assert.throws(() =>
    buildRoute({
      rockScanId: "scan_abc",
      name: "Too short",
      type: "boulder",
      points: [makePoint({ x: 0, y: 0, z: 0 }, "start", 0)],
    }),
  );
});
