import { fromBase64 } from "../codec/base64";
import type { ScanPhoto } from "../mesh/photo";
import { similarityFromPairs, transformGlb, type AlignmentPair } from "./similarity";
import { readDetailSettings } from "./settings";

const CHUNK = 256 * 1024;
const running = new Set<string>();

export type DetailJobFile = {
  meshUrl: string;
  jobId: string | null;
  names: string[];
  status: string;
  progress: number;
  message: string;
};

export async function saveDetailPhotos(meshUrl: string, photos: ScanPhoto[]): Promise<void> {
  const { Directory, File } = await import("expo-file-system");
  const folder = new File(meshUrl).parentDirectory;
  const dir = new Directory(folder, "detail");
  dir.create({ intermediates: true, idempotent: true });
  const kept = photos.slice(0, 150);
  const names: string[] = [];
  for (let index = 0; index < kept.length; index++) {
    const name = `photo-${String(index + 1).padStart(4, "0")}.jpg`;
    names.push(name);
    const file = new File(dir, name);
    if (!file.exists) file.create();
    await file.write(fromBase64(kept[index].jpegBase64));
  }
  const poses = kept.map((photo, index) => ({
    name: names[index],
    fx: photo.fx,
    fy: photo.fy,
    cx: photo.cx,
    cy: photo.cy,
    width: photo.width,
    height: photo.height,
    worldFromCamera: photo.worldFromCamera ?? [],
  }));
  const poseFile = new File(dir, "poses.json");
  if (!poseFile.exists) poseFile.create();
  await poseFile.write(JSON.stringify(poses));
  await writeJob(meshUrl, {
    meshUrl,
    jobId: null,
    names,
    status: "collecting",
    progress: 0,
    message: `${names.length} photos are saved on the phone. Upload starts when the PC answers.`,
  });
}

export async function readDetailJob(meshUrl: string): Promise<DetailJobFile | null> {
  try {
    const { File } = await import("expo-file-system");
    const file = new File(new File(meshUrl).parentDirectory, "detail", "job.json");
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as DetailJobFile;
  } catch {
    return null;
  }
}

export function runDetailJob(meshUrl: string): void {
  if (running.has(meshUrl)) return;
  running.add(meshUrl);
  void work(meshUrl).finally(() => running.delete(meshUrl));
}

async function work(meshUrl: string): Promise<void> {
  const settings = await readDetailSettings();
  const job = await readDetailJob(meshUrl);
  if (!job) return;
  if (!settings.appKey) {
    await writeJob(meshUrl, { ...job, message: "Add the PC app key in Settings, then open this rock again." });
    return;
  }
  if (!(await lanReady(settings.url, settings.waitForLan))) {
    await writeJob(meshUrl, { ...job, message: "Waiting for Wi-Fi or the Teleport VPN. The PC has to answer before the photos leave the phone." });
    return;
  }
  const base = settings.url.replace(/\/$/, "");
  const headers = { authorization: `Bearer ${settings.appKey}` };
  try {
    let jobId = job.jobId;
    if (!jobId) {
      const created = await request(`${base}/v1/jobs`, { method: "POST", headers });
      jobId = (created as { id: string }).id;
      await writeJob(meshUrl, { ...job, jobId, message: "Uploading photos." });
    }
    const { File } = await import("expo-file-system");
    const dir = new File(new File(meshUrl).parentDirectory, "detail");
    const poses = JSON.parse(await new File(dir, "poses.json").text()) as { name: string; worldFromCamera: number[] }[];
    for (const name of job.names) {
      const bytes = new Uint8Array(await new File(dir, name).bytes());
      await uploadPhoto(base, headers, jobId, name, bytes);
      const pose = poses.find((item) => item.name === name);
      if (pose) {
        await request(`${base}/v1/jobs/${jobId}/photos/${encodeURIComponent(name)}/pose`, {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify(pose),
        });
      }
      const done = job.names.indexOf(name) + 1;
      await writeJob(meshUrl, { ...job, jobId, progress: Math.round((done / job.names.length) * 40), message: `Uploaded ${done} of ${job.names.length} photos.` });
    }
    const remote = await request(`${base}/v1/jobs/${jobId}`, { headers }) as { status?: string };
    if (!remote.status || remote.status === "collecting") {
      await request(`${base}/v1/jobs/${jobId}/start`, { method: "POST", headers });
    }
    let status = "running";
    let message = "The PC is building the detailed face.";
    let progress = 40;
    while (status !== "complete" && status !== "failed") {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const body = await request(`${base}/v1/jobs/${jobId}`, { headers }) as { status: string; progress: number; message: string };
      status = body.status;
      progress = 40 + Math.round((body.progress ?? 0) * 0.5);
      message = body.message || message;
      await writeJob(meshUrl, { ...job, jobId, status, progress, message });
    }
    if (status !== "complete") return;
    const model = await fetch(`${base}/v1/jobs/${jobId}/model.glb`, { headers });
    if (!model.ok) throw new Error("The detailed model did not download");
    const alignment = await request(`${base}/v1/jobs/${jobId}/alignment.json`, { headers }) as { pairs?: AlignmentPair[] };
    const similarity = similarityFromPairs(alignment.pairs ?? []);
    if (!similarity || similarity.scale < 0.2 || similarity.scale > 5) {
      await writeJob(meshUrl, {
        ...job,
        jobId,
        status: "failed",
        message: "The PC finished a model, but it could not be lined up with this scan. The rough model is still the one on screen.",
      });
      return;
    }
    const glb = transformGlb(new Uint8Array(await model.arrayBuffer()), similarity);
    const detail = new File(new File(meshUrl).parentDirectory, "mesh-detail.glb");
    if (!detail.exists) detail.create();
    await detail.write(glb);
    await writeJob(meshUrl, {
      ...job,
      jobId,
      status: "complete",
      progress: 100,
      message: "High detail model is lined up with this scan. The first mesh is still here if this one will not open.",
    });
  } catch (error) {
    const latest = await readDetailJob(meshUrl);
    await writeJob(meshUrl, {
      ...(latest ?? job),
      status: "failed",
      message: error instanceof Error ? error.message : "The upload stopped. Open the rock again to resume.",
    });
  }
}

async function uploadPhoto(base: string, headers: Record<string, string>, jobId: string, name: string, bytes: Uint8Array): Promise<void> {
  const current = await request(`${base}/v1/jobs/${jobId}/photos/${encodeURIComponent(name)}`, { headers }) as {
    received?: number;
    total?: number;
    complete?: boolean;
  };
  let received = current.complete ? bytes.length : current.received ?? 0;
  if (current.total && current.total !== bytes.length) received = 0;
  while (received < bytes.length) {
    const end = Math.min(bytes.length, received + CHUNK) - 1;
    const slice = bytes.slice(received, end + 1);
    const response = await fetch(`${base}/v1/jobs/${jobId}/photos/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { ...headers, "content-range": `bytes ${received}-${end}/${bytes.length}` },
      body: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer,
    });
    if (!response.ok) throw new Error(await errorText(response));
    const body = await response.json() as { received: number };
    received = body.received;
  }
}

async function lanReady(url: string, wait: boolean): Promise<boolean> {
  if (!wait) return true;
  try {
    const Network = await import("expo-network");
    const state = await Network.getNetworkStateAsync();
    if (state.type === Network.NetworkStateType.WIFI) return true;
  } catch {
    // A missing network module still gets a chance to reach the PC over VPN.
  }
  try {
    const health = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(4000) });
    return health.ok;
  } catch {
    return false;
  }
}

async function request(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await errorText(response));
  const type = response.headers.get("content-type") ?? "";
  return type.includes("json") ? response.json() : null;
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error || `The PC answered ${response.status}`;
  } catch {
    return `The PC answered ${response.status}`;
  }
}

async function writeJob(meshUrl: string, job: DetailJobFile): Promise<void> {
  const { Directory, File } = await import("expo-file-system");
  const folder = new File(meshUrl).parentDirectory;
  const dir = new Directory(folder, "detail");
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, "job.json");
  if (!file.exists) file.create();
  await file.write(JSON.stringify(job));
}
