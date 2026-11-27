import type { Vector3 } from "../domain/types";
import { add } from "../domain/vec";
import type { SurfaceMesh } from "../mesh/types";
import { cameraMatrix, decodeScanPhoto, type ScanPhoto } from "../mesh/photo";
import { raycastMesh } from "../viewer/raycast";
import { type Mat4 } from "../viewer/math";
import { fromBase64, toBase64 } from "../codec/base64";
import { extractFeatures, matchFeatures, type Feature } from "./features";
import { sessionFromScan, solvePnp, type Intrinsics } from "./pose";

export type MapPoint = {
  x: number;
  y: number;
  z: number;
  d: string;
};

export type MapFrame = {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  points: MapPoint[];
};

export type FingerprintMap = {
  version: 1;
  scanId: string;
  name: string;
  frames: MapFrame[];
};

export type Recognition = {
  scanId: string;
  name: string;
  confidence: "high" | "fair";
  inliers: number;
  reprojectionPx: number;
  sessionFromScan: Mat4;
};

export function recognizeFrame(
  live: Feature[],
  intrinsics: Intrinsics,
  liveWorldFromCamera: Mat4,
  maps: FingerprintMap[],
): Recognition | null {
  let best: Recognition | null = null;
  for (const map of maps) {
    for (const frame of map.frames) {
      const known = frame.points.map((point) => ({ x: 0, y: 0, descriptor: fromBase64(point.d) }));
      const pairs = matchFeatures(live, known);
      if (pairs.length < 6) continue;
      const solved = solvePnp(
        pairs.map((pair) => ({
          point: frame.points[pair.known],
          u: live[pair.live].x,
          v: live[pair.live].y,
        })),
        intrinsics,
        { iterations: 24, seed: 11 },
      );
      if (!solved || solved.inliers < 8 || solved.reprojectionPx > 8) continue;
      const confidence = solved.inliers >= 18 && solved.reprojectionPx < 5 ? "high" : "fair";
      if (best && rank(best) >= rank({ confidence, inliers: solved.inliers })) continue;
      best = {
        scanId: map.scanId,
        name: map.name,
        confidence,
        inliers: solved.inliers,
        reprojectionPx: solved.reprojectionPx,
        sessionFromScan: sessionFromScan(liveWorldFromCamera, solved.cameraFromWorld),
      };
    }
  }
  return best;
}

export function fingerprintsFromPhotos(
  scanId: string,
  name: string,
  mesh: SurfaceMesh,
  photos: ScanPhoto[],
  origin: Vector3,
  describe: (rgba: Uint8Array, width: number, height: number) => Feature[] = extractFeatures,
  prepared?: Feature[][],
): FingerprintMap {
  const frames: MapFrame[] = [];
  photos.forEach((photo, photoIndex) => {
    const ready = prepared?.[photoIndex];
    let features = ready;
    if (!features) {
      try {
        const image = decodeScanPhoto(photo);
        features = describe(image.data, image.width, image.height);
      } catch {
        return;
      }
    }
    features = features.slice(0, 120);
    const points: MapPoint[] = [];
    for (const feature of features) {
      const ray = rayThroughPixel(photo, feature.x, feature.y, origin);
      if (!ray) continue;
      const hit = raycastMesh(mesh, ray);
      if (!hit) continue;
      points.push({ x: hit.point.x, y: hit.point.y, z: hit.point.z, d: toBase64(feature.descriptor) });
      if (points.length >= 80) break;
    }
    if (points.length >= 8) {
      frames.push({ fx: photo.fx, fy: photo.fy, cx: photo.cx, cy: photo.cy, points });
    }
  });
  return { version: 1, scanId, name, frames };
}

export { fromBase64, toBase64 };

function rayThroughPixel(photo: ScanPhoto, u: number, v: number, origin: Vector3) {
  const xn = (u - photo.cx) / photo.fx;
  const yn = (photo.cy - v) / photo.fy;
  const directionCamera = { x: xn, y: yn, z: -1 };
  const worldFromCamera = cameraMatrix(photo);
  if (!worldFromCamera) return null;
  const cameraPosition = { x: worldFromCamera[12], y: worldFromCamera[13], z: worldFromCamera[14] };
  const direction = {
    x: worldFromCamera[0] * directionCamera.x + worldFromCamera[4] * directionCamera.y + worldFromCamera[8] * directionCamera.z,
    y: worldFromCamera[1] * directionCamera.x + worldFromCamera[5] * directionCamera.y + worldFromCamera[9] * directionCamera.z,
    z: worldFromCamera[2] * directionCamera.x + worldFromCamera[6] * directionCamera.y + worldFromCamera[10] * directionCamera.z,
  };
  return { origin: add(cameraPosition, { x: -origin.x, y: -origin.y, z: -origin.z }), direction };
}

function rank(value: { confidence: "high" | "fair"; inliers: number }): number {
  return (value.confidence === "high" ? 1000 : 0) + value.inliers;
}
