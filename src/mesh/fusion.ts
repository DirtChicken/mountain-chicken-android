import type { Vector3 } from "../domain/types";
import { accumulateSample, voxelKey } from "./samples";
import type { Accum, SampleKind } from "./types";

export const FUSION_VOXEL = 0.02;
export const FUSION_CAP = 40000;

/** One surface cell. Repeat hits add weight to the same cell instead of a second shell. */
export function fuseSample(
  map: Map<string, Accum>,
  point: Vector3,
  kind: SampleKind,
  voxel: number,
  cap = FUSION_CAP,
): number {
  let size = voxel;
  let key = voxelKey(point, size);
  if (!map.has(key) && map.size >= cap) {
    if (size < 0.08) {
      size *= 2;
      coarsenFusion(map, size);
      key = voxelKey(point, size);
    }
    if (!map.has(key) && map.size >= cap) {
      reinforceNearest(map, point, kind);
      return size;
    }
  }
  accumulateSample(map, point, kind, size);
  return size;
}

export function coarsenFusion(map: Map<string, Accum>, voxel: number): void {
  const merged = new Map<string, Accum>();
  for (const cell of map.values()) {
    const mean = { x: cell.x / cell.n, y: cell.y / cell.n, z: cell.z / cell.n };
    const key = voxelKey(mean, voxel);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { x: cell.x, y: cell.y, z: cell.z, n: cell.n, kind: cell.kind });
      continue;
    }
    current.x += cell.x;
    current.y += cell.y;
    current.z += cell.z;
    current.n += cell.n;
    if (cell.kind === "depth" || (cell.kind === "feature" && current.kind === "plane")) current.kind = cell.kind;
  }
  map.clear();
  for (const [key, cell] of merged) map.set(key, cell);
}

function reinforceNearest(map: Map<string, Accum>, point: Vector3, kind: SampleKind): void {
  let best: Accum | null = null;
  let bestDistance = Infinity;
  for (const cell of map.values()) {
    const meanX = cell.x / cell.n;
    const meanY = cell.y / cell.n;
    const meanZ = cell.z / cell.n;
    const distance = (meanX - point.x) ** 2 + (meanY - point.y) ** 2 + (meanZ - point.z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cell;
    }
  }
  if (!best) return;
  best.x += point.x;
  best.y += point.y;
  best.z += point.z;
  best.n += 1;
  if (kind === "depth" || (kind === "feature" && best.kind === "plane")) best.kind = kind;
}
