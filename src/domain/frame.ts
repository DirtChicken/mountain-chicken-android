import { scale, sub } from "./vec";
import type { Vector3 } from "./types";

/** Right-handed yaw about Y, radians. Positive yaw turns X toward -Z. */
export function rotateY(v: Vector3, yaw: number): Vector3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

export function scanPointToWorld(
  scan: Vector3,
  origin: Vector3,
  yaw: number,
  uniformScale: number,
): Vector3 {
  const turned = rotateY(scan, yaw);
  return {
    x: origin.x + turned.x * uniformScale,
    y: origin.y + turned.y * uniformScale,
    z: origin.z + turned.z * uniformScale,
  };
}

export function worldPointToScan(
  world: Vector3,
  origin: Vector3,
  yaw: number,
  uniformScale: number,
): Vector3 {
  const safe = Math.abs(uniformScale) < 1e-6 ? 1 : uniformScale;
  return rotateY(scale(sub(world, origin), 1 / safe), -yaw);
}

/** Origin that puts `anchor` (scan meters) on `hit` (AR world meters). */
export function originForAnchor(
  hit: Vector3,
  anchor: Vector3,
  yaw: number,
  uniformScale: number,
): Vector3 {
  const placed = rotateY(anchor, yaw);
  return {
    x: hit.x - placed.x * uniformScale,
    y: hit.y - placed.y * uniformScale,
    z: hit.z - placed.z * uniformScale,
  };
}
