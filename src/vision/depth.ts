import { matchFeatures } from "../reloc/features";
import { noteDepthFrame } from "../device/depthReport";
import type { Vector3 } from "../domain/types";
import { rayThroughPixel, triangulateRays } from "../mesh/stereoDepth";
import { getScanPhotos } from "../state/scanCapture";
import { sampleDepth, type DepthSample } from "rock-vision";
import { describeJpeg } from "./frames";

let lastPhotoDepth = 0;

export async function pullMeasuredDepth(): Promise<Vector3[]> {
  let probe: DepthSample | null = null;
  try {
    probe = await sampleDepth();
  } catch {
    probe = null;
  }
  const points = probe?.points ?? [];
  noteDepthFrame({
    gotPoints: points.length > 0,
    mode: probe?.mode,
    source: probe?.source,
    error: probe?.error?.trim() || (points.length > 0 ? null : probe?.message ?? null),
  });
  if (points.length > 0) return points;
  return photoDepth();
}

async function photoDepth(): Promise<Vector3[]> {
  const now = Date.now();
  if (now - lastPhotoDepth < 5000) return [];
  const photos = getScanPhotos();
  if (photos.length < 2) return [];
  lastPhotoDepth = now;
  const newer = photos[photos.length - 1];
  const older = photos[photos.length - 2];
  let points: Vector3[] = [];
  try {
    const [live, known] = await Promise.all([describeJpeg(newer.jpegBase64), describeJpeg(older.jpegBase64)]);
    const pairs = matchFeatures(live, known).slice(0, 40);
    points = pairs.flatMap((pair) => {
      const rayA = rayThroughPixel(newer, live[pair.live].x, live[pair.live].y);
      const rayB = rayThroughPixel(older, known[pair.known].x, known[pair.known].y);
      if (!rayA || !rayB) return [];
      const point = triangulateRays(rayA, rayB);
      return point ? [point] : [];
    });
  } catch {
    points = [];
  }
  return points;
}
