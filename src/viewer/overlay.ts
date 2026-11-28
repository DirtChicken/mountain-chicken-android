import type { Route, RoutePoint, Vector3 } from "../domain/types";
import { cross, length, normalize, sub } from "../domain/vec";

export type ColoredMesh = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
};

const COPPER: [number, number, number] = [0.83, 0.47, 0.23];
const AMBER: [number, number, number] = [0.94, 0.71, 0.16];
const CHALK: [number, number, number] = [0.96, 0.95, 0.91];
const FINISH: [number, number, number] = [0.88, 0.36, 0.29];
const SAND: [number, number, number] = [0.77, 0.65, 0.45];

export function rockColors(vertexCount: number): Float32Array {
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = SAND[0];
    colors[i * 3 + 1] = SAND[1];
    colors[i * 3 + 2] = SAND[2];
  }
  return colors;
}

export function routeOverlay(routes: Route[], draft: RoutePoint[] = []): ColoredMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const pushRoute = (points: RoutePoint[], color: [number, number, number], draftLine: boolean) => {
    const ordered = [...points].sort((a, b) => a.order - b.order);
    for (let i = 1; i < ordered.length; i++) {
      addRod(positions, normals, colors, indices, ordered[i - 1].position, ordered[i].position, draftLine ? AMBER : color);
    }
    for (const point of ordered) {
      if (point.type === "path") continue;
      const marker =
        point.type === "start" ? AMBER : point.type === "finish" ? FINISH : point.type === "anchor" ? SAND : CHALK;
      addOctahedron(positions, normals, colors, indices, point.position, point.type === "start" ? 0.09 : 0.07, marker);
    }
  };

  for (const route of routes) pushRoute(route.points, COPPER, false);
  if (draft.length) pushRoute(draft, AMBER, true);

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
  };
}

function addRod(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  a: Vector3,
  b: Vector3,
  color: [number, number, number],
) {
  const dir = sub(b, a);
  if (length(dir) < 0.01) return;
  const axis = normalize(dir);
  const up = Math.abs(axis.y) > 0.85 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const side = normalize(cross(axis, up));
  const lift = normalize(cross(side, axis));
  addRibbon(positions, normals, colors, indices, a, b, side, 0.028, color);
  addRibbon(positions, normals, colors, indices, a, b, lift, 0.028, color);
}

function addRibbon(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  a: Vector3,
  b: Vector3,
  side: Vector3,
  radius: number,
  color: [number, number, number],
) {
  const base = positions.length / 3;
  const corners = [
    { x: a.x - side.x * radius, y: a.y - side.y * radius, z: a.z - side.z * radius },
    { x: a.x + side.x * radius, y: a.y + side.y * radius, z: a.z + side.z * radius },
    { x: b.x - side.x * radius, y: b.y - side.y * radius, z: b.z - side.z * radius },
    { x: b.x + side.x * radius, y: b.y + side.y * radius, z: b.z + side.z * radius },
  ];
  const normal = normalize(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])));
  for (const corner of corners) {
    positions.push(corner.x, corner.y, corner.z);
    normals.push(normal.x, normal.y, normal.z);
    colors.push(color[0], color[1], color[2]);
  }
  indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

function addOctahedron(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  center: Vector3,
  radius: number,
  color: [number, number, number],
) {
  const base = positions.length / 3;
  const verts = [
    [0, radius, 0],
    [radius, 0, 0],
    [0, 0, radius],
    [-radius, 0, 0],
    [0, 0, -radius],
    [0, -radius, 0],
  ];
  for (const [x, y, z] of verts) {
    positions.push(center.x + x, center.y + y, center.z + z);
    const n = normalize({ x, y, z });
    normals.push(n.x, n.y, n.z);
    colors.push(color[0], color[1], color[2]);
  }
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 1],
    [5, 2, 1],
    [5, 3, 2],
    [5, 4, 3],
    [5, 1, 4],
  ];
  for (const face of faces) indices.push(base + face[0], base + face[1], base + face[2]);
}
