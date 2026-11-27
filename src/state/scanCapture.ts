import { dist, sub } from "../domain/vec";
import type { Vector3 } from "../domain/types";
import type { ScanPhoto } from "../mesh/photo";
import { accumulateSample, pointsFromMap } from "../mesh/samples";
import type { Accum, SampleKind } from "../mesh/types";

export type CaptureSnapshot = {
  sampleCount: number;
  depthCount: number;
  featureCount: number;
  planeCount: number;
  tracking: string;
  source: string;
  worldVertices: number;
  worldTriangles: number;
  accumulated: boolean;
  coaching: string;
};

const map = new Map<string, Accum>();
const photos: ScanPhoto[] = [];
let origin: Vector3 | null = null;
let tracking = "starting";
let source = "waiting";
let worldVertices = 0;
let worldTriangles = 0;
let accumulated = false;
let coaching = "Point the camera at the rock.";
let snapshot: CaptureSnapshot = emptySnapshot();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function resetCapture(): void {
  map.clear();
  photos.length = 0;
  origin = null;
  tracking = "starting";
  source = "waiting";
  worldVertices = 0;
  worldTriangles = 0;
  accumulated = false;
  coaching = "Point the camera at the rock.";
  publish();
}

export function noteCameraOrigin(position: Vector3): void {
  if (!origin) origin = { ...position };
}

export function noteSample(world: Vector3, kind: SampleKind): void {
  const local = origin ? sub(world, origin) : world;
  accumulateSample(map, local, kind, 0.02);
  schedule();
}

export function noteTracking(next: string, message: string): void {
  tracking = next;
  coaching = message;
  schedule();
}

export function noteWorldMesh(stats: {
  source?: string;
  vertexCount?: number;
  triangleCount?: number;
  accumulated?: boolean;
}): void {
  source = stats.source ?? source;
  worldVertices = stats.vertexCount ?? 0;
  worldTriangles = stats.triangleCount ?? 0;
  accumulated = Boolean(stats.accumulated);
  schedule();
}

export function groupedSamples() {
  return pointsFromMap(map);
}

export function getScanOrigin(): Vector3 {
  return origin ? { ...origin } : { x: 0, y: 0, z: 0 };
}

export function getScanPhotos(): ScanPhoto[] {
  return photos.slice();
}

export function addScanPhoto(photo: ScanPhoto): void {
  const place = photoPosition(photo);
  if (place && photos.some((existing) => {
    const other = photoPosition(existing);
    return other ? dist(place, other) < 0.28 : false;
  })) {
    return;
  }
  photos.push(photo);
  if (photos.length > 8) photos.shift();
}

function photoPosition(photo: ScanPhoto): Vector3 | null {
  if (photo.worldFromCamera && photo.worldFromCamera.length === 16) {
    return { x: photo.worldFromCamera[12], y: photo.worldFromCamera[13], z: photo.worldFromCamera[14] };
  }
  return photo.position ?? null;
}

export function subscribeCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCaptureSnapshot(): CaptureSnapshot {
  return snapshot;
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    publish();
  }, 180);
}

function publish(): void {
  const groups = pointsFromMap(map);
  snapshot = {
    sampleCount: map.size,
    depthCount: groups.depth.length,
    featureCount: groups.feature.length,
    planeCount: groups.plane.length,
    tracking,
    source,
    worldVertices,
    worldTriangles,
    accumulated,
    coaching,
  };
  listeners.forEach((listener) => listener());
}

function emptySnapshot(): CaptureSnapshot {
  return {
    sampleCount: 0,
    depthCount: 0,
    featureCount: 0,
    planeCount: 0,
    tracking: "starting",
    source: "waiting",
    worldVertices: 0,
    worldTriangles: 0,
    accumulated: false,
    coaching: "Point the camera at the rock.",
  };
}
