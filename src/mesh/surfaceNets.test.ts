import assert from "node:assert/strict";
import test from "node:test";
import { surfaceNets } from "./surfaceNets";

test("surface nets extracts a sphere", () => {
  const mesh = surfaceNets(
    [28, 28, 28],
    (x, y, z) => Math.hypot(x - 0.5, y - 0.5, z - 0.5) - 0.28,
    [[0, 0, 0], [1, 1, 1]],
  );
  assert.ok(mesh.positions.length > 80);
  assert.ok(mesh.cells.length > 80);
  let outward = 0;
  for (const cell of mesh.cells) {
    const a = mesh.positions[cell[0]];
    const b = mesh.positions[cell[1]];
    const c = mesh.positions[cell[2]];
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const cx = (a[0] + b[0] + c[0]) / 3 - 0.5;
    const cy = (a[1] + b[1] + c[1]) / 3 - 0.5;
    const cz = (a[2] + b[2] + c[2]) / 3 - 0.5;
    if (nx * cx + ny * cy + nz * cz > 0) outward++;
  }
  assert.ok(outward / mesh.cells.length > 0.7);
});
