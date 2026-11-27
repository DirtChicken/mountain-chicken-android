import type { Vector3 } from "../domain/types";
import { boundsOf, diagonal } from "../domain/vec";
import type { Accum, SampleKind } from "./types";

const KIND_RANK: Record<SampleKind, number> = { plane: 0, feature: 1, depth: 2 };

export function voxelKey(point: Vector3, voxel: number): string {
  const x = Math.round(point.x / voxel);
  const y = Math.round(point.y / voxel);
  const z = Math.round(point.z / voxel);
  return `${x}|${y}|${z}`;
}

export function accumulateSample(
  map: Map<string, Accum>,
  point: Vector3,
  kind: SampleKind,
  voxel = 0.02,
): void {
  const key = voxelKey(point, voxel);
  const current = map.get(key);
  if (!current) {
    map.set(key, { x: point.x, y: point.y, z: point.z, n: 1, kind });
    return;
  }
  current.x += point.x;
  current.y += point.y;
  current.z += point.z;
  current.n += 1;
  if (KIND_RANK[kind] > KIND_RANK[current.kind]) current.kind = kind;
}

export function pointsFromMap(map: Map<string, Accum>): Record<SampleKind, Vector3[]> {
  const groups: Record<SampleKind, Vector3[]> = { depth: [], feature: [], plane: [] };
  for (const sample of map.values()) {
    groups[sample.kind].push({
      x: sample.x / sample.n,
      y: sample.y / sample.n,
      z: sample.z / sample.n,
    });
  }
  return groups;
}

export type MeshSampleChoice = {
  points: Vector3[];
  quality: "low" | "medium" | "high";
  warning?: string;
};

/** Prefer real depth. Feature points fill gaps. Planes are a last resort. */
export function chooseMeshPoints(groups: Record<SampleKind, Vector3[]>): MeshSampleChoice {
  const depth = groups.depth;
  const feature = groups.feature;
  const plane = groups.plane;
  let points: Vector3[];
  let warning: string | undefined;
  if (depth.length >= 60) {
    points = depth;
  } else if (depth.length + feature.length >= 60) {
    points = depth.concat(feature);
    warning =
      depth.length < 20
        ? "Depth barely locked. The model is built from camera features, so treat the shape as a sketch."
        : undefined;
  } else {
    points = depth.concat(feature, plane);
    warning =
      "The phone mostly found flat planes. Save only if the outline is enough — a depth or LiDAR phone will hold the real face.";
  }

  const bounds = boundsOf(points);
  const span = bounds ? diagonal(bounds) : 0;
  let quality: MeshSampleChoice["quality"] = "low";
  if (depth.length >= 1500 && span > 0.8) quality = "high";
  else if (depth.length >= 250 || points.length >= 800) quality = "medium";

  if (points.length < 40) {
    return {
      points: [],
      quality: "low",
      warning: "Not enough of the rock locked in. Walk a slower half-circle and keep the face in frame.",
    };
  }
  return { points, quality, warning };
}
