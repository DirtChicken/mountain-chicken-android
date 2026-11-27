import { Platform } from "react-native";
import { buildRoute, buildScan } from "../domain/create";
import type { RockScan, Route, RoutePoint, Vector3 } from "../domain/types";
import { logError, logInfo } from "../log";
import { bakeFaceTexture, decodeScanPhoto, texturedObj, type ScanPhoto } from "../mesh/photo";
import { prepareMeshForDisplay, VIEWER_LIMITS } from "../mesh/prepareMesh";
import type { SurfaceMesh } from "../mesh/types";
import { readLocation } from "../device/location";
import { writeFaceFiles, writeMeshFile } from "../storage/meshFiles";
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
  await writePhoto(meshUrl, storedMesh, input.photos ?? [], input.origin ?? { x: 0, y: 0, z: 0 });
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

async function writePhoto(meshUrl: string, mesh: SurfaceMesh, photos: ScanPhoto[], origin: Vector3): Promise<void> {
  if (photos.length === 0) return;
  try {
    const images = photos.map((photo) => decodeScanPhoto(photo));
    const baked = bakeFaceTexture(mesh, photos, images, origin, 512);
    if (!baked) {
      logInfo("scan photo skipped", { reason: "no pixels landed on the mesh" });
      return;
    }
    const files = texturedObj(mesh, baked.uvs);
    await writeFaceFiles(meshUrl, files.obj, files.mtl, baked.jpeg);
    logInfo("saved face photo", { texels: baked.coloredTexels, bytes: baked.jpeg.length });
  } catch (error) {
    logError("save face photo", error);
  }
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
