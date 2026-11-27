import { Platform } from "react-native";
import type { SurfaceMesh } from "../mesh/types";
import { meshToObj, objToMesh } from "../mesh/obj";

const WEB_PREFIX = "webmesh:";

export async function writeMeshFile(scanId: string, mesh: SurfaceMesh): Promise<string> {
  const obj = meshToObj(mesh);
  if (Platform.OS === "web") {
    const key = `${WEB_PREFIX}${scanId}`;
    localStorage.setItem(key, obj);
    return key;
  }
  const { Directory, File, Paths } = await import("expo-file-system");
  const dir = new Directory(Paths.document, "scans", scanId);
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, "mesh.obj");
  if (!file.exists) file.create({ overwrite: true, intermediates: true });
  await file.write(obj);
  return file.uri;
}

export async function readMeshFile(meshUrl: string): Promise<SurfaceMesh> {
  if (meshUrl.startsWith(WEB_PREFIX)) {
    const obj = localStorage.getItem(meshUrl);
    if (!obj) throw new Error("The saved model is missing from this browser");
    return objToMesh(obj);
  }
  const { File } = await import("expo-file-system");
  const file = new File(meshUrl);
  if (!file.exists) throw new Error("The saved model file is missing");
  return objToMesh(await file.text());
}

export async function deleteMeshFile(meshUrl: string | undefined): Promise<void> {
  if (!meshUrl) return;
  if (meshUrl.startsWith(WEB_PREFIX)) {
    localStorage.removeItem(meshUrl);
    return;
  }
  try {
    const { File } = await import("expo-file-system");
    const file = new File(meshUrl);
    if (file.exists) file.delete();
  } catch {
    // A missing file should not block deleting the library row.
  }
}
