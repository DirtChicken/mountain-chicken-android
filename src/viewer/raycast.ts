import type { Vector3 } from "../domain/types";
import { add, cross, dot, scale, sub } from "../domain/vec";
import type { SurfaceMesh } from "../mesh/types";
import type { Ray } from "./math";

export type Hit = { point: Vector3; distance: number };

export function raycastMesh(mesh: SurfaceMesh, ray: Ray): Hit | null {
  const pos = mesh.positions;
  const idx = mesh.indices;
  let bestT = Infinity;
  let best: Vector3 | null = null;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const v0 = at(pos, a);
    const v1 = at(pos, b);
    const v2 = at(pos, c);
    const edge1 = sub(v1, v0);
    const edge2 = sub(v2, v0);
    const pvec = cross(ray.direction, edge2);
    const det = dot(edge1, pvec);
    if (Math.abs(det) < 1e-8) continue;
    const invDet = 1 / det;
    const tvec = sub(ray.origin, v0);
    const u = dot(tvec, pvec) * invDet;
    if (u < 0 || u > 1) continue;
    const qvec = cross(tvec, edge1);
    const v = dot(ray.direction, qvec) * invDet;
    if (v < 0 || u + v > 1) continue;
    const t = dot(edge2, qvec) * invDet;
    if (t > 1e-4 && t < bestT) {
      bestT = t;
      best = add(ray.origin, scale(ray.direction, t));
    }
  }
  return best ? { point: best, distance: bestT } : null;
}

function at(positions: Float32Array, offset: number): Vector3 {
  return { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
}
