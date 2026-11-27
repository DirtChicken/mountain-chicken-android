import type { Vector3 } from "../domain/types";
import { add, dot, length, scale, sub } from "../domain/vec";
import type { ScanPhoto } from "./photo";
import { cameraMatrix } from "./photo";
import type { Mat4 } from "../viewer/math";

export type Ray = { origin: Vector3; direction: Vector3 };

/** Closest point between two camera rays. Rejects rays that miss or sit behind either camera. */
export function triangulateRays(a: Ray, b: Ray): Vector3 | null {
  const directionA = unit(a.direction);
  const directionB = unit(b.direction);
  if (!directionA || !directionB) return null;
  const between = sub(b.origin, a.origin);
  const aa = dot(directionA, directionA);
  const bb = dot(directionB, directionB);
  const ab = dot(directionA, directionB);
  const denom = aa * bb - ab * ab;
  if (Math.abs(denom) < 1e-6) return null;
  const alongA = (dot(between, directionA) * bb - dot(between, directionB) * ab) / denom;
  const alongB = (dot(between, directionA) * ab - dot(between, directionB) * aa) / denom;
  if (alongA < 0.15 || alongB < 0.15 || alongA > 8 || alongB > 8) return null;
  const pointA = add(a.origin, scale(directionA, alongA));
  const pointB = add(b.origin, scale(directionB, alongB));
  if (length(sub(pointA, pointB)) > 0.08) return null;
  return {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
    z: (pointA.z + pointB.z) / 2,
  };
}

export function rayThroughPixel(photo: ScanPhoto, u: number, v: number): Ray | null {
  const matrix = cameraMatrix(photo);
  if (!matrix || photo.fx <= 0 || photo.fy <= 0) return null;
  const xn = (u - photo.cx) / photo.fx;
  const yn = (photo.cy - v) / photo.fy;
  const direction = rotate(matrix, { x: xn, y: yn, z: -1 });
  return {
    origin: { x: matrix[12], y: matrix[13], z: matrix[14] },
    direction,
  };
}

function rotate(matrix: Mat4, vector: Vector3): Vector3 {
  return {
    x: matrix[0] * vector.x + matrix[4] * vector.y + matrix[8] * vector.z,
    y: matrix[1] * vector.x + matrix[5] * vector.y + matrix[9] * vector.z,
    z: matrix[2] * vector.x + matrix[6] * vector.y + matrix[10] * vector.z,
  };
}

function unit(vector: Vector3): Vector3 | null {
  const len = length(vector);
  if (len < 1e-6) return null;
  return scale(vector, 1 / len);
}
