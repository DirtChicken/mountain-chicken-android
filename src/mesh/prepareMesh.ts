import { computeNormals, decimateMesh, meshBounds } from "./reconstruct";
import type { SurfaceMesh } from "./types";

/** Android GL crashes if a draw uses 32-bit indices or a mesh big enough to get the process killed. */
export const DISPLAY_LIMITS = {
  maxTriangles: 12000,
  maxVertices: 20000,
};

/** The AR bridge copies every vertex into native memory, so the in-room model stays smaller. */
export const AR_LIMITS = {
  maxTriangles: 2000,
  maxVertices: 4000,
};

/** Non-AR Viro view. Big enough to read a face, small enough for the React Native bridge. */
export const VIEWER_LIMITS = {
  maxTriangles: 8000,
  maxVertices: 12000,
};

const INDEX_LIMIT = 65535;

export function prepareMeshForDisplay(
  mesh: SurfaceMesh,
  limits: { maxTriangles: number; maxVertices: number } = DISPLAY_LIMITS,
): SurfaceMesh {
  let current = sanitizeMesh(mesh);
  let triangleCap = Math.max(1, limits.maxTriangles);
  for (let attempt = 0; attempt < 12; attempt++) {
    const reduced = decimateMesh(current, triangleCap);
    const fitted = reduced.positions.length / 3 <= limits.maxVertices ? reduced : decimateMesh(reduced, triangleCap);
    if (vertexCount(fitted) <= limits.maxVertices && highestIndex(fitted) <= INDEX_LIMIT && vertexCount(fitted) > 0) {
      return fitted;
    }
    triangleCap = Math.max(50, Math.floor(triangleCap / 2));
    current = fitted;
  }
  const last = decimateMesh(current, 50);
  if (vertexCount(last) === 0 || highestIndex(last) > INDEX_LIMIT) {
    throw new Error("The saved model has no surface this phone can draw.");
  }
  return last;
}

export function vertexCount(mesh: SurfaceMesh): number {
  return Math.floor(mesh.positions.length / 3);
}

export function highestIndex(mesh: SurfaceMesh): number {
  let highest = 0;
  for (let i = 0; i < mesh.indices.length; i++) {
    if (mesh.indices[i] > highest) highest = mesh.indices[i];
  }
  return highest;
}

function sanitizeMesh(mesh: SurfaceMesh): SurfaceMesh {
  if (!mesh?.positions || !mesh.indices) {
    throw new Error("The saved model is missing its surface.");
  }
  const count = vertexCount(mesh);
  const used = new Int32Array(count);
  used.fill(-1);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const normalSource = mesh.normals?.length === mesh.positions.length ? mesh.normals : null;

  const take = (index: number): number => {
    if (!Number.isInteger(index) || index < 0 || index >= count) return -1;
    const cached = used[index];
    if (cached >= 0) return cached;
    const offset = index * 3;
    const x = mesh.positions[offset];
    const y = mesh.positions[offset + 1];
    const z = mesh.positions[offset + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1;
    const next = positions.length / 3;
    used[index] = next;
    positions.push(x, y, z);
    if (normalSource) {
      const nx = normalSource[offset];
      const ny = normalSource[offset + 1];
      const nz = normalSource[offset + 2];
      if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) normals.push(nx, ny, nz);
      else normals.push(0, 1, 0);
    }
    return next;
  };

  for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
    const a = take(mesh.indices[i]);
    const b = take(mesh.indices[i + 1]);
    const c = take(mesh.indices[i + 2]);
    if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }

  if (indices.length < 3 || positions.length < 9) {
    throw new Error("The saved model has no surface this phone can draw.");
  }

  const positionArray = Float32Array.from(positions);
  const indexArray = Uint32Array.from(indices);
  const normalArray = normalSource ? Float32Array.from(normals) : computeNormals(positionArray, indexArray);
  return {
    positions: positionArray,
    normals: normalArray,
    indices: indexArray,
    bounds: meshBounds(positionArray),
  };
}
