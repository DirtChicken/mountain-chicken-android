import { Platform } from "react-native";
import { buildRoute, buildScan } from "../domain/create";
import type { RockScan, Route, RoutePoint } from "../domain/types";
import { logError, logInfo } from "../log";
import { prepareMeshForDisplay } from "../mesh/prepareMesh";
import type { SurfaceMesh } from "../mesh/types";
import { readLocation } from "../device/location";
import { writeMeshFile } from "../storage/meshFiles";
import { useLibrary } from "./useLibrary";

export async function saveMeshScan(input: {
  name: string;
  description?: string;
  mesh: SurfaceMesh;
  quality?: RockScan["scanQuality"];
  points?: RoutePoint[];
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
  const storedMesh = prepareMeshForDisplay(input.mesh);
  logInfo("saving scan mesh", {
    rawVertices: Math.floor(input.mesh.positions.length / 3),
    storedVertices: Math.floor(storedMesh.positions.length / 3),
  });
  const meshUrl = await writeMeshFile(draft.id, storedMesh);
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

function finiteBounds(mesh: SurfaceMesh): SurfaceMesh["bounds"] | undefined {
  const { min, max } = mesh.bounds ?? {};
  const values = [min?.x, min?.y, min?.z, max?.x, max?.y, max?.z];
  if (!min || !max || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    logError("scan bounds", new Error("Scan bounds were not finite"), {});
    return undefined;
  }
  return { min, max };
}
