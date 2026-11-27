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
  const triangles = Math.floor(mesh.indices.length / 3);
  const safeCap = Math.max(1, maxTriangles);
  if (triangles <= safeCap) return compactReferencedVertices(mesh);
  return compactReferencedVertices({ ...mesh, indices: spatialTriangles(mesh, safeCap) });
}

/** Keep triangles spread across the face so a hold is not deleted just because of triangle order. */
function spatialTriangles(mesh: SurfaceMesh, maxTriangles: number): Uint32Array {
  const triangles = Math.floor(mesh.indices.length / 3);
  const centroids = new Float32Array(triangles * 3);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let triangle = 0; triangle < triangles; triangle++) {
    const a = mesh.indices[triangle * 3] * 3;
    const b = mesh.indices[triangle * 3 + 1] * 3;
    const c = mesh.indices[triangle * 3 + 2] * 3;
    const x = (mesh.positions[a] + mesh.positions[b] + mesh.positions[c]) / 3;
    const y = (mesh.positions[a + 1] + mesh.positions[b + 1] + mesh.positions[c + 1]) / 3;
    const z = (mesh.positions[a + 2] + mesh.positions[b + 2] + mesh.positions[c + 2]) / 3;
    centroids[triangle * 3] = x;
    centroids[triangle * 3 + 1] = y;
    centroids[triangle * 3 + 2] = z;
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-3);
  let low = span / 512;
  let high = span;
  let chosen: number[] = [];
  for (let attempt = 0; attempt < 16; attempt++) {
    const voxel = (low + high) / 2;
    const cells = new Map<string, number>();
    for (let triangle = 0; triangle < triangles; triangle++) {
      const key = `${Math.floor(centroids[triangle * 3] / voxel)}|${Math.floor(centroids[triangle * 3 + 1] / voxel)}|${Math.floor(centroids[triangle * 3 + 2] / voxel)}`;
      if (!cells.has(key)) cells.set(key, triangle);
    }
    if (cells.size > maxTriangles) low = voxel;
    else {
      high = voxel;
      chosen = [...cells.values()];
    }
  }
  if (chosen.length === 0) {
    const step = Math.ceil(triangles / maxTriangles);
    chosen = [];
    for (let triangle = 0; triangle < triangles; triangle += step) chosen.push(triangle);
  }
  const indices = new Uint32Array(chosen.length * 3);
  chosen.forEach((triangle, index) => {
    indices[index * 3] = mesh.indices[triangle * 3];
    indices[index * 3 + 1] = mesh.indices[triangle * 3 + 1];
    indices[index * 3 + 2] = mesh.indices[triangle * 3 + 2];
  });
  return indices;
}

/** Drop vertices no remaining triangle uses, so indices stay dense and inside 16-bit GL. */
export function compactReferencedVertices(mesh: SurfaceMesh): SurfaceMesh {
  const count = Math.floor(mesh.positions.length / 3);
  const remap = new Int32Array(count);
  remap.fill(-1);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const sourceNormals = mesh.normals?.length === mesh.positions.length ? mesh.normals : null;

  const take = (index: number): number => {
    if (index < 0 || index >= count) return -1;
    const existing = remap[index];
    if (existing >= 0) return existing;
    const offset = index * 3;
    const next = positions.length / 3;
    remap[index] = next;
    positions.push(mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]);
    if (sourceNormals) {
      normals.push(sourceNormals[offset], sourceNormals[offset + 1], sourceNormals[offset + 2]);
    }
    return next;
  };

  for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
    const a = take(mesh.indices[i]);
    const b = take(mesh.indices[i + 1]);
    const c = take(mesh.indices[i + 2]);
    if (a < 0 || b < 0 || c < 0) continue;
    indices.push(a, b, c);
  }

  const positionArray = Float32Array.from(positions);
  const indexArray = Uint32Array.from(indices);
  return {
    positions: positionArray,
    normals: sourceNormals ? Float32Array.from(normals) : computeNormals(positionArray, indexArray),
    indices: indexArray,
    bounds: positions.length >= 3 ? meshBounds(positionArray) : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
  };
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
