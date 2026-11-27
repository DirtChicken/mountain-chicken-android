import { Platform } from "react-native";
import { logError, logInfo } from "../log";
import { meshToObj, objToMesh } from "../mesh/obj";
import { prepareMeshForDisplay } from "../mesh/prepareMesh";
import type { SurfaceMesh } from "../mesh/types";

const WEB_PREFIX = "webmesh:";
const MAX_MESH_BYTES = 24 * 1024 * 1024;

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
  if (!meshUrl) throw new Error("This rock has no saved model.");
  if (meshUrl.startsWith(WEB_PREFIX)) {
    const obj = localStorage.getItem(meshUrl);
    if (!obj) throw new Error("The saved model is missing from this browser");
    if (obj.length > MAX_MESH_BYTES) throw new Error("This scan file is too large to open on this phone.");
    return objToMesh(obj);
  }
  const { File } = await import("expo-file-system");
  const file = new File(meshUrl);
  if (!file.exists) throw new Error("The saved model file is missing");
  const bytes = typeof file.size === "number" ? file.size : 0;
  logInfo("reading scan file", { scheme: uriScheme(meshUrl), bytes });
  if (bytes > MAX_MESH_BYTES) throw new Error("This scan file is too large to open on this phone.");
  return objToMesh(await file.text());
}

/** Read a saved scan off the UI thread and shrink it to something Android GL can draw. */
export async function loadDisplayMesh(meshUrl: string): Promise<SurfaceMesh> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const started = Date.now();
  try {
    const raw = await readMeshFile(meshUrl);
    const mesh = prepareMeshForDisplay(raw);
    logInfo("opened scan mesh", {
      scheme: uriScheme(meshUrl),
      rawVertices: Math.floor(raw.positions.length / 3),
      viewVertices: Math.floor(mesh.positions.length / 3),
      triangles: Math.floor(mesh.indices.length / 3),
      ms: Date.now() - started,
    });
    return mesh;
  } catch (error) {
    logError("open scan mesh", error, { scheme: uriScheme(meshUrl) });
    throw error instanceof Error ? error : new Error("Could not open the model");
  }
}

export async function writeFaceFiles(objUri: string, objText: string, mtl: string, jpeg: Uint8Array): Promise<void> {
  if (objUri.startsWith(WEB_PREFIX)) return;
  const { File } = await import("expo-file-system");
  const obj = new File(objUri);
  await obj.write(objText);
  const folder = obj.parentDirectory;
  const mtlFile = new File(folder, "mesh.mtl");
  const jpgFile = new File(folder, "mesh.jpg");
  if (!mtlFile.exists) mtlFile.create();
  if (!jpgFile.exists) jpgFile.create();
  await mtlFile.write(mtl);
  await jpgFile.write(jpeg);
}

export async function writeFingerprints(meshUrl: string, json: string): Promise<void> {
  if (!meshUrl || meshUrl.startsWith(WEB_PREFIX)) return;
  const { File } = await import("expo-file-system");
  const file = new File(new File(meshUrl).parentDirectory, "fingerprints.json");
  if (!file.exists) file.create();
  await file.write(json);
}

export async function readFingerprints(meshUrl: string): Promise<string | null> {
  if (!meshUrl || meshUrl.startsWith(WEB_PREFIX)) return null;
  try {
    const { File } = await import("expo-file-system");
    const file = new File(new File(meshUrl).parentDirectory, "fingerprints.json");
    if (!file.exists) return null;
    return await file.text();
  } catch (error) {
    logError("fingerprint lookup", error);
    return null;
  }
}

export async function faceTextureUri(meshUrl: string): Promise<string | null> {
  if (!meshUrl || meshUrl.startsWith(WEB_PREFIX)) return null;
  try {
    const { File } = await import("expo-file-system");
    const jpg = new File(new File(meshUrl).parentDirectory, "mesh.jpg");
    return jpg.exists ? jpg.uri : null;
  } catch (error) {
    logError("texture lookup", error, { scheme: uriScheme(meshUrl) });
    return null;
  }
}

function uriScheme(meshUrl: string): string {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(meshUrl);
  return match ? match[1] : "path";
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
