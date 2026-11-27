import { matchFeatures } from "../reloc/features";
import { setDepthProbe } from "../device/depthReport";
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
  if (probe) {
    setDepthProbe({
      mode: probe.mode,
      source: probe.points.length ? probe.source : probe.source,
      message: probe.message,
    });
    if (probe.points.length) return probe.points;
  }
  return photoDepth(probe);
}

async function photoDepth(probe: DepthSample | null): Promise<Vector3[]> {
  const now = Date.now();
  if (now - lastPhotoDepth < 5000) return [];
  const photos = getScanPhotos();
  if (photos.length < 2) {
    if (!probe) {
      setDepthProbe({
        mode: "unavailable",
        source: "none",
        message: "No depth image yet. Keep the rock in frame.",
      });
    }
    return [];
  }
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
  setDepthProbe({
    mode: probe?.mode === "disabled" || probe?.mode === "unavailable" ? probe.mode : "photo-fallback",
    source: points.length ? "multi-pass" : probe?.source ?? "none",
    message: points.length
      ? "This phone is not giving a depth image. Distance is being measured from overlapping photos. Keep crossing the same face."
      : probe?.message ?? "No depth image from this phone. Keep overlapping passes so the photos can measure the rock.",
  });
  return points;
}
