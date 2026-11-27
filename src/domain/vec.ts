import type { Vector3 } from "./types";

export function vec(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

export function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vector3, s: number): Vector3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a: Vector3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function dist(a: Vector3, b: Vector3): number {
  return length(sub(a, b));
}

export function normalize(a: Vector3): Vector3 {
  const len = length(a);
  if (len < 1e-8) return { x: 0, y: 1, z: 0 };
  return scale(a, 1 / len);
}

export function midpoint(a: Vector3, b: Vector3): Vector3 {
  return scale(add(a, b), 0.5);
}

export function finiteVec(v: Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function boundsOf(points: Vector3[]): { min: Vector3; max: Vector3 } | null {
  if (points.length === 0) return null;
  const min = { ...points[0] };
  const max = { ...points[0] };
  for (const p of points) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  return { min, max };
}

export function diagonal(bounds: { min: Vector3; max: Vector3 }): number {
  return dist(bounds.min, bounds.max);
}
