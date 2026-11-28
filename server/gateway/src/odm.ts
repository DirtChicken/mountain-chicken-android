/** Close-range NodeODM options. The mesh is still split to 16-bit indices before the phone downloads it. */
export const CLOSE_RANGE_OPTIONS: { name: string; value: string }[] = [
  { name: "feature-quality", value: "high" },
  { name: "pc-quality", value: "high" },
  { name: "mesh-size", value: "300000" },
  { name: "skip-orthophoto", value: "true" },
  { name: "skip-report", value: "true" },
  { name: "auto-boundary", value: "true" },
  { name: "use-3dmesh", value: "true" },
  { name: "pc-filter", value: "0" },
];

export type PoseRecord = {
  name: string;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  worldFromCamera: number[];
};

/** Local meter frame. ARCore Y-up becomes the geo.txt altitude. ODM may use this as a prior; the phone still aligns afterwards. */
export function geoText(poses: PoseRecord[]): string {
  const lines = ["+proj=tmerc +lat_0=0 +lon_0=0 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs"];
  for (const pose of poses) {
    const center = cameraCenter(pose.worldFromCamera);
    if (!center) continue;
    lines.push(`${pose.name} ${center[0].toFixed(4)} ${center[2].toFixed(4)} ${center[1].toFixed(4)}`);
  }
  return lines.join("\n") + "\n";
}

export function cameraCenter(matrix: number[]): [number, number, number] | null {
  if (matrix.length !== 16) return null;
  const [x, y, z] = [matrix[12], matrix[13], matrix[14]];
  if (![x, y, z].every((value) => Number.isFinite(value))) return null;
  return [x, y, z];
}

/** OpenSfM angle-axis rotation. Camera center is -R^T * translation. */
export function opensfmCenter(rotation: number[], translation: number[]): [number, number, number] | null {
  if (rotation.length !== 3 || translation.length !== 3) return null;
  const matrix = rodrigues(rotation);
  const x = -(matrix[0][0] * translation[0] + matrix[1][0] * translation[1] + matrix[2][0] * translation[2]);
  const y = -(matrix[0][1] * translation[0] + matrix[1][1] * translation[1] + matrix[2][1] * translation[2]);
  const z = -(matrix[0][2] * translation[0] + matrix[1][2] * translation[1] + matrix[2][2] * translation[2]);
  if (![x, y, z].every((value) => Number.isFinite(value))) return null;
  return [x, y, z];
}

export function centersFromReconstruction(json: unknown): { name: string; center: [number, number, number] }[] {
  const shots = (json as { shots?: Record<string, { rotation?: number[]; translation?: number[] }> })?.shots;
  if (!shots) return [];
  const centers = [];
  for (const [name, shot] of Object.entries(shots)) {
    if (!shot.rotation || !shot.translation) continue;
    const center = opensfmCenter(shot.rotation, shot.translation);
    if (center) centers.push({ name, center });
  }
  return centers;
}

function rodrigues(rotation: number[]): number[][] {
  const theta = Math.hypot(rotation[0], rotation[1], rotation[2]);
  if (theta < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const x = rotation[0] / theta;
  const y = rotation[1] / theta;
  const z = rotation[2] / theta;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const v = 1 - c;
  return [
    [c + x * x * v, x * y * v - z * s, x * z * v + y * s],
    [y * x * v + z * s, c + y * y * v, y * z * v - x * s],
    [z * x * v - y * s, z * y * v + x * s, c + z * z * v],
  ];
}

export type OdmInfo = { status: number; progress: number; error?: string };

export type OdmClient = {
  reachable(): Promise<boolean>;
  createTask(files: { name: string; bytes: Buffer }[]): Promise<string>;
  taskInfo(uuid: string): Promise<OdmInfo>;
  downloadAll(uuid: string): Promise<Buffer>;
};

export function nodeOdmClient(baseUrl: string): OdmClient {
  const root = baseUrl.replace(/\/$/, "");
  return {
    async reachable() {
      try {
        const response = await fetch(`${root}/info`, { signal: AbortSignal.timeout(2500) });
        return response.ok;
      } catch {
        return false;
      }
    },
    async createTask(files) {
      const packed = multipart([
        ...files.map((file) => ({
          name: "images",
          filename: file.name,
          type: file.name.endsWith(".txt") || file.name.endsWith(".json") ? "application/json" : "image/jpeg",
          body: file.bytes,
        })),
        { name: "options", type: "application/json", body: Buffer.from(JSON.stringify(CLOSE_RANGE_OPTIONS)) },
      ]);
      const response = await fetch(`${root}/task/new`, { method: "POST", headers: { "content-type": packed.type }, body: new Uint8Array(packed.body) });
      if (!response.ok) throw new Error(`NodeODM refused the task (${response.status})`);
      const payload = await response.json() as { uuid?: string };
      if (!payload.uuid) throw new Error("NodeODM did not return a task id");
      return payload.uuid;
    },
    async taskInfo(uuid) {
      const response = await fetch(`${root}/task/${uuid}/info`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`NodeODM status ${response.status}`);
      const payload = await response.json() as { status?: { code?: number }; progress?: number; error?: string };
      return { status: payload.status?.code ?? 0, progress: payload.progress ?? 0, error: payload.error };
    },
    async downloadAll(uuid) {
      const response = await fetch(`${root}/task/${uuid}/download/all.zip`);
      if (!response.ok) throw new Error(`NodeODM download ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

function multipart(parts: { name: string; filename?: string; type: string; body: Buffer }[]): { type: string; body: Buffer } {
  const boundary = `mc${Date.now().toString(16)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition = part.filename
      ? `form-data; name="${part.name}"; filename="${part.filename}"`
      : `form-data; name="${part.name}"`;
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: ${disposition}\r\nContent-Type: ${part.type}\r\n\r\n`));
    chunks.push(part.body);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { type: `multipart/form-data; boundary=${boundary}`, body: Buffer.concat(chunks) };
}
