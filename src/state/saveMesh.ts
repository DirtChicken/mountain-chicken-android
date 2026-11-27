import { encode as encodeJpeg } from "jpeg-js";
import { Platform } from "react-native";
import { buildRoute, buildScan } from "../domain/create";
import type { RockScan, Route, RoutePoint, Vector3 } from "../domain/types";
import { logError, logInfo } from "../log";
import { meshToGlb } from "../mesh/glb";
import { bakeFaceTexture, cameraMatrix, colorVertices, decodeScanPhoto, planarUvs, texturedObj, type ScanPhoto } from "../mesh/photo";
import { prepareMeshForDisplay, VIEWER_LIMITS } from "../mesh/prepareMesh";
import { reconstructSurface } from "../mesh/reconstruct";
import type { SurfaceMesh } from "../mesh/types";
import { fingerprintsFromPhotos, type FingerprintMap } from "../reloc/map";
import { noteTexture } from "../device/textureReport";
import { readLocation } from "../device/location";
import { readFingerprints, readMeshFile, writeFaceFiles, writeFingerprints, writeMeshFile } from "../storage/meshFiles";
import { describeJpeg } from "../vision/frames";
import { grayFromRgba, sharpness } from "../reloc/features";
import { invert, multiply, transformPoint, type Mat4 } from "../viewer/math";
import { useLibrary } from "./useLibrary";

export async function saveMeshScan(input: {
  name: string;
  description?: string;
  mesh: SurfaceMesh;
  quality?: RockScan["scanQuality"];
  points?: RoutePoint[];
  photos?: ScanPhoto[];
  origin?: Vector3;
  routeName?: string;
  grade?: string;
  routeType?: Route["type"];
  notes?: string;
}): Promise<string> {
  const fix = await readLocation();
  const draft = buildScan({
    name: input.name,
    description: input.description,
    latitude: fix?.latitude ?? 0,
    longitude: fix?.longitude ?? 0,
    altitude: fix?.altitude,
    accuracy: fix?.accuracy,
    scannedByDevice: `${Platform.OS} ${String(Platform.Version)}`,
    scanQuality: input.quality,
    boundingBox: finiteBounds(input.mesh),
  });
  const storedMesh = prepareMeshForDisplay(input.mesh, VIEWER_LIMITS);
  logInfo("saving scan mesh", {
    rawVertices: Math.floor(input.mesh.positions.length / 3),
    storedVertices: Math.floor(storedMesh.positions.length / 3),
    photos: input.photos?.length ?? 0,
  });
  const meshUrl = await writeMeshFile(draft.id, storedMesh);
  const photos = sharpest(input.photos ?? []);
  await writePhoto(meshUrl, storedMesh, photos, input.origin ?? { x: 0, y: 0, z: 0 });
  await storeFingerprints(meshUrl, draft.id, input.name, storedMesh, photos, input.origin ?? { x: 0, y: 0, z: 0 });
  const scan: RockScan = { ...draft, meshUrl };
  await useLibrary.getState().addScan(scan);
  if (input.points && input.points.length >= 2) {
    const route = buildRoute({
      rockScanId: scan.id,
      name: input.routeName ?? "Sample line",
      grade: input.grade,
      type: input.routeType ?? "boulder",
      notes: input.notes,
      points: input.points,
    });
    await useLibrary.getState().addRoute(route);
  }
  return scan.id;
}

export async function extendMeshScan(input: {
  scan: RockScan;
  points: Vector3[];
  origin: Vector3;
  sessionFromScan: Mat4;
  photos: ScanPhoto[];
}): Promise<void> {
  const inverse = invert(input.sessionFromScan);
  const incoming = input.points.map((point) => transformPoint(inverse, {
    x: point.x + input.origin.x,
    y: point.y + input.origin.y,
    z: point.z + input.origin.z,
  }));
  const previous = input.scan.meshUrl ? await readPreviousVertices(input.scan.meshUrl) : [];
  const mesh = reconstructSurface([...previous, ...incoming], { voxelSize: 0.018, maxAxis: 96 });
  if (!mesh || !input.scan.meshUrl) throw new Error("Could not merge this walk into the saved rock");
  const stored = prepareMeshForDisplay(mesh, VIEWER_LIMITS);
  await writeMeshFile(input.scan.id, stored);
  const photos = sharpest(input.photos).map((photo) => movePhoto(photo, inverse));
  await writePhoto(input.scan.meshUrl, stored, photos, { x: 0, y: 0, z: 0 });
  const existing = await readFingerprints(input.scan.meshUrl);
  const added = await buildMap(input.scan.id, input.scan.name, stored, photos, { x: 0, y: 0, z: 0 });
  const prior = existing ? parseMap(existing) : null;
  const merged: FingerprintMap = {
    version: 1,
    scanId: input.scan.id,
    name: input.scan.name,
    frames: [...(prior?.frames ?? []), ...added.frames].slice(-16),
  };
  await writeFingerprints(input.scan.meshUrl, JSON.stringify(merged));
  await useLibrary.getState().addScan({
    ...input.scan,
    description: `${input.scan.description ?? ""} Extended on a later visit.`.trim(),
    updatedAt: new Date().toISOString(),
    boundingBox: finiteBounds(stored) ?? input.scan.boundingBox,
  });
}

async function readPreviousVertices(meshUrl: string): Promise<Vector3[]> {
  const mesh = await readMeshFile(meshUrl);
  const points: Vector3[] = [];
  for (let index = 0; index < mesh.positions.length; index += 9) {
    points.push({ x: mesh.positions[index], y: mesh.positions[index + 1], z: mesh.positions[index + 2] });
  }
  return points;
}

function movePhoto(photo: ScanPhoto, inverse: Mat4): ScanPhoto {
  const matrix = cameraMatrix(photo);
  if (!matrix) return photo;
  const moved = multiply(inverse, matrix);
  return {
    ...photo,
    worldFromCamera: [...moved],
    position: { x: moved[12], y: moved[13], z: moved[14] },
  };
}

async function storeFingerprints(
  meshUrl: string,
  scanId: string,
  name: string,
  mesh: SurfaceMesh,
  photos: ScanPhoto[],
  origin: Vector3,
): Promise<void> {
  try {
    const map = await buildMap(scanId, name, mesh, photos, origin);
    if (!map.frames.length) return;
    await writeFingerprints(meshUrl, JSON.stringify(map));
    logInfo("saved fingerprints", { frames: map.frames.length });
  } catch (error) {
    logError("save fingerprints", error);
  }
}

async function buildMap(scanId: string, name: string, mesh: SurfaceMesh, photos: ScanPhoto[], origin: Vector3) {
  const prepared = [];
  for (const photo of photos) prepared.push(await describeJpeg(photo.jpegBase64));
  return fingerprintsFromPhotos(scanId, name, mesh, photos, origin, undefined, prepared);
}

function parseMap(json: string): FingerprintMap | null {
  try {
    const parsed = JSON.parse(json) as FingerprintMap;
    return parsed?.frames ? parsed : null;
  } catch {
    return null;
  }
}

function sharpest(photos: ScanPhoto[]): ScanPhoto[] {
  const scored = photos.flatMap((photo) => {
    try {
      const image = decodeScanPhoto(photo);
      return [{ photo, score: sharpness(grayFromRgba(image.data, image.width, image.height), image.width, image.height) }];
    } catch {
      return [];
    }
  });
  const crisp = scored.filter((item) => item.score > 18);
  const kept = (crisp.length >= 2 ? crisp : scored).map((item) => item.photo);
  return kept.length ? kept : photos;
}

async function writePhoto(meshUrl: string, mesh: SurfaceMesh, photos: ScanPhoto[], origin: Vector3): Promise<void> {
  noteTexture({ keyframesCaptured: photos.length, keyframesUsed: 0, message: photos.length ? "Baking the face photo." : "No camera frames were saved with this scan." });
  if (photos.length === 0) return;
  try {
    const images = photos.map((photo) => decodeScanPhoto(photo));
    const colors = colorVertices(mesh, photos, images, origin);
    const baked = bakeFaceTexture(mesh, photos, images, origin, 512);
    const uvs = baked?.uvs ?? planarUvs(mesh.positions);
    const jpeg = baked?.jpeg ?? sandJpeg();
    const files = texturedObj(mesh, uvs);
    const glb = meshToGlb(mesh, colors, uvs, jpeg);
    const written = await writeFaceFiles(meshUrl, files.obj, files.mtl, jpeg, glb);
    let painted = 0;
    for (let i = 0; i < colors.length; i += 3) {
      if (colors[i] !== 196 || colors[i + 1] !== 165 || colors[i + 2] !== 116) painted++;
    }
    noteTexture({
      keyframesCaptured: photos.length,
      keyframesUsed: photos.length,
      textureBytes: jpeg.length,
      textureWidth: 512,
      textureHeight: baked ? 512 : 16,
      jpgUri: written.jpgUri,
      glbUri: written.glbUri,
      paintedVertices: painted,
      load: "not-opened",
      message: painted > 0
        ? `Baked ${painted} colored vertices from ${photos.length} photos.`
        : "Photos were saved, but none of them landed on the mesh. The flat image is still in Diagnostics.",
    });
    logInfo("saved face photo", { texels: baked?.coloredTexels ?? 0, bytes: jpeg.length, painted });
  } catch (error) {
    noteTexture({ message: error instanceof Error ? error.message : "The face photo could not be saved." });
    logError("save face photo", error);
  }
}

function sandJpeg(): Uint8Array {
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 196;
    data[i + 1] = 165;
    data[i + 2] = 116;
    data[i + 3] = 255;
  }
  return encodeJpeg({ data, width: 16, height: 16 }, 80).data;
}

function finiteBounds(mesh: SurfaceMesh): SurfaceMesh["bounds"] | undefined {
  const { min, max } = mesh.bounds ?? {};
  const values = [min?.x, min?.y, min?.z, max?.x, max?.y, max?.z];
  if (!min || !max || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    logError("scan bounds", new Error("Scan bounds were not finite"), {});
    return undefined;
  }
  return { min, max };
}
