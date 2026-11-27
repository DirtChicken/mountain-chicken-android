import { noteDepthSample, resetDepthReport } from "../device/depthReport";
import { dist, length, sub } from "../domain/vec";
import type { Vector3 } from "../domain/types";
import { coverageAdvice, coverageGrid, type CoverageCell } from "../mesh/coverage";
import { FUSION_VOXEL, fuseSample } from "../mesh/fusion";
import type { ScanPhoto } from "../mesh/photo";
import { pointsFromMap } from "../mesh/samples";
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
  paused: boolean;
  photoCount: number;
  coverage: CoverageCell[][];
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
let trackingMessage = "Point the camera at the rock.";
let paused = false;
let voxel = FUSION_VOXEL;
let lastCamera: Vector3 | null = null;
let snapshot: CaptureSnapshot = emptySnapshot();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function resetCapture(): void {
  map.clear();
  photos.length = 0;
  lastPhotoAt = 0;
  lastPhotoPlace = null;
  origin = null;
  tracking = "starting";
  source = "waiting";
  worldVertices = 0;
  worldTriangles = 0;
  accumulated = false;
  coaching = "Point the camera at the rock.";
  trackingMessage = coaching;
  paused = false;
  voxel = FUSION_VOXEL;
  lastCamera = null;
  resetDepthReport();
  publish();
}

export function setCapturePaused(next: boolean): void {
  paused = next;
  publish();
}

export function isCapturePaused(): boolean {
  return paused;
}

export function noteCameraOrigin(position: Vector3): void {
  if (!origin) origin = { ...position };
  lastCamera = origin ? sub(position, origin) : { x: 0, y: 0, z: 0 };
}

export function noteSample(world: Vector3, kind: SampleKind): void {
  if (paused) return;
  const local = origin ? sub(world, origin) : world;
  voxel = fuseSample(map, local, kind, voxel);
  if (kind === "depth") noteDepthSample();
  schedule();
}

export function noteTracking(next: string, message: string): void {
  tracking = next;
  trackingMessage = message;
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

let lastPhotoAt = 0;
let lastPhotoPlace: Vector3 | null = null;

export function addScanPhoto(photo: ScanPhoto): void {
  if (paused) return;
  const now = Date.now();
  const place = photoPosition(photo);
  if (place && lastPhotoPlace && lastPhotoAt > 0) {
    const speed = dist(place, lastPhotoPlace) / Math.max(0.25, (now - lastPhotoAt) / 1000);
    lastPhotoAt = now;
    lastPhotoPlace = place;
    if (speed > 0.85) return;
  } else {
    lastPhotoAt = now;
    lastPhotoPlace = place;
  }
  if (place && photos.some((existing) => {
    const other = photoPosition(existing);
    return other ? dist(place, other) < 0.22 : false;
  })) {
    return;
  }
  photos.push(photo);
  if (photos.length > 24) dropMostRedundant();
}

export function fusedCells(): { x: number; y: number; z: number; n: number }[] {
  return [...map.values()].map((cell) => ({
    x: cell.x / cell.n,
    y: cell.y / cell.n,
    z: cell.z / cell.n,
    n: cell.n,
  }));
}

function dropMostRedundant(): void {
  let worst = 0;
  let worstGap = Infinity;
  for (let i = 0; i < photos.length; i++) {
    const place = photoPosition(photos[i]);
    if (!place) continue;
    let nearest = Infinity;
    for (let j = 0; j < photos.length; j++) {
      if (i === j) continue;
      const other = photoPosition(photos[j]);
      if (!other) continue;
      nearest = Math.min(nearest, dist(place, other));
    }
    if (nearest < worstGap) {
      worstGap = nearest;
      worst = i;
    }
  }
  photos.splice(worst, 1);
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

export function flushCapture(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  publish();
}

function publish(): void {
  const groups = pointsFromMap(map);
  const points = groups.depth.concat(groups.feature, groups.plane);
  const coverage = coverageGrid(points);
  const distance = lastCamera && points.length ? distanceToCloud(lastCamera, points) : null;
  coaching = paused
    ? "Paused. This is still the same scan. Resume to keep fusing, or finish when you mean to stop."
    : tracking === "locked"
      ? coverageAdvice(coverage, distance)
      : trackingMessage;
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
    paused,
    photoCount: photos.length,
    coverage,
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
    paused: false,
    photoCount: 0,
    coverage: Array.from({ length: 8 }, () => new Array<CoverageCell>(8).fill(0)),
  };
}

function distanceToCloud(camera: Vector3, points: Vector3[]): number {
  let nearest = Infinity;
  const step = Math.max(1, Math.floor(points.length / 80));
  for (let i = 0; i < points.length; i += step) {
    nearest = Math.min(nearest, length(sub(camera, points[i])));
  }
  return nearest;
}
