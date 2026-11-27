import type { Vector3 } from "../domain/types";
import { boundsOf, cross, length, sub } from "../domain/vec";
import { surfaceNets } from "./surfaceNets";
import type { SurfaceMesh } from "./types";

export type ReconstructOptions = {
  voxelSize?: number;
  band?: number;
  maxAxis?: number;
};

/**
 * Fuse a metric point cloud into a solid shell.
 * Points are on the rock surface, in scan meters. The shell is the set of
 * places within `band` meters of a sample, so a walked face becomes a
 * continuous stone surface instead of a dot cloud.
 */
export function reconstructSurface(points: Vector3[], options: ReconstructOptions = {}): SurfaceMesh | null {
  if (points.length < 12) return null;
  const rawBounds = boundsOf(points);
  if (!rawBounds) return null;

  let voxel = options.voxelSize ?? 0.035;
  const maxAxis = options.maxAxis ?? 88;
  let spanX = rawBounds.max.x - rawBounds.min.x;
  let spanY = rawBounds.max.y - rawBounds.min.y;
  let spanZ = rawBounds.max.z - rawBounds.min.z;
  const longest = Math.max(spanX, spanY, spanZ, voxel);
  if (longest / voxel > maxAxis) voxel = longest / maxAxis;
  let band = options.band ?? Math.max(0.05, voxel * 1.75);
  if (band < voxel * 1.2) band = voxel * 1.2;

  const pad = band + voxel;
  const min: [number, number, number] = [
    rawBounds.min.x - pad,
    rawBounds.min.y - pad,
    rawBounds.min.z - pad,
  ];
  const max: [number, number, number] = [
    rawBounds.max.x + pad,
    rawBounds.max.y + pad,
    rawBounds.max.z + pad,
  ];
  spanX = max[0] - min[0];
  spanY = max[1] - min[1];
  spanZ = max[2] - min[2];
  const dims: [number, number, number] = [
    Math.max(4, Math.ceil(spanX / voxel)),
    Math.max(4, Math.ceil(spanY / voxel)),
    Math.max(4, Math.ceil(spanZ / voxel)),
  ];

  const hash = new Map<string, Vector3[]>();
  const cell = band;
  for (const point of points) {
    const key = bucketKey(point, cell);
    const list = hash.get(key);
    if (list) list.push(point);
    else hash.set(key, [point]);
  }
  const reach = 1;

  const potential = (x: number, y: number, z: number) => {
    const ix = Math.floor(x / cell);
    const iy = Math.floor(y / cell);
    const iz = Math.floor(z / cell);
    let best = band * 4;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const bucket = hash.get(`${ix + dx}|${iy + dy}|${iz + dz}`);
          if (!bucket) continue;
          for (const point of bucket) {
            const d = Math.hypot(x - point.x, y - point.y, z - point.z);
            if (d < best) best = d;
          }
        }
      }
    }
    return best - band;
  };

  const net = surfaceNets(dims, potential, [min, max]);
  if (net.positions.length < 20 || net.cells.length < 12) return null;

  const positions = new Float32Array(net.positions.length * 3);
  net.positions.forEach((position, index) => {
    positions[index * 3] = position[0];
    positions[index * 3 + 1] = position[1];
    positions[index * 3 + 2] = position[2];
  });
  const indices = new Uint32Array(net.cells.length * 3);
  net.cells.forEach((cell, index) => {
    indices[index * 3] = cell[0];
    indices[index * 3 + 1] = cell[1];
    indices[index * 3 + 2] = cell[2];
  });
  const normals = computeNormals(positions, indices);
  const bounds = meshBounds(positions);
  return { positions, normals, indices, bounds };
}

export function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ab = sub(at(positions, b), at(positions, a));
    const ac = sub(at(positions, c), at(positions, a));
    const n = cross(ab, ac);
    if (length(n) < 1e-10) continue;
    addNormal(normals, a, n);
    addNormal(normals, b, n);
    addNormal(normals, c, n);
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len < 1e-8) {
      normals[i + 1] = 1;
      continue;
    }
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }
  return normals;
}

export function meshBounds(positions: Float32Array): { min: Vector3; max: Vector3 } {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < positions.length; i += 3) {
    min.x = Math.min(min.x, positions[i]);
    min.y = Math.min(min.y, positions[i + 1]);
    min.z = Math.min(min.z, positions[i + 2]);
    max.x = Math.max(max.x, positions[i]);
    max.y = Math.max(max.y, positions[i + 1]);
    max.z = Math.max(max.z, positions[i + 2]);
  }
  return { min, max };
}

/** Average of the lowest 8% of vertices — the base you tap when placing the rock. */
export function basePoint(mesh: SurfaceMesh): Vector3 {
  const ys: number[] = [];
  for (let i = 1; i < mesh.positions.length; i += 3) ys.push(mesh.positions[i]);
  ys.sort((a, b) => a - b);
  const cutoff = ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.08))];
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (mesh.positions[i + 1] <= cutoff + 1e-5) {
      x += mesh.positions[i];
      y += mesh.positions[i + 1];
      z += mesh.positions[i + 2];
      n++;
    }
  }
  if (n === 0) return { x: 0, y: 0, z: 0 };
  return { x: x / n, y: y / n, z: z / n };
}

export function decimateMesh(mesh: SurfaceMesh, maxTriangles: number): SurfaceMesh {
  const triangles = mesh.indices.length / 3;
  if (triangles <= maxTriangles) return mesh;
  const step = Math.ceil(triangles / maxTriangles);
  const kept: number[] = [];
  for (let t = 0; t < triangles; t += step) {
    const i = t * 3;
    kept.push(mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]);
  }
  return { ...mesh, indices: Uint32Array.from(kept) };
}

function bucketKey(point: Vector3, cell: number): string {
  return `${Math.floor(point.x / cell)}|${Math.floor(point.y / cell)}|${Math.floor(point.z / cell)}`;
}

function at(positions: Float32Array, offset: number): Vector3 {
  return { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
}

function addNormal(normals: Float32Array, offset: number, n: Vector3): void {
  normals[offset] += n.x;
  normals[offset + 1] += n.y;
  normals[offset + 2] += n.z;
}
