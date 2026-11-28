import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { cameraCenter, centersFromReconstruction, geoText, type OdmClient, type PoseRecord } from "./odm";
import { objToGlb } from "./meshglb";
import { findBytes, findText, unzip } from "./zip";
import { applyChunk, JobStore, safeName, type JobState } from "./store";

export type GatewayOptions = {
  key: string;
  store: JobStore;
  odm: OdmClient;
  port?: number;
};

export function createGateway(options: GatewayOptions) {
  const server = createServer(async (request, response) => {
    try {
      await route(options, request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gateway error";
      send(response, 400, { error: message });
    }
  });
  return {
    server,
    listen: (port = options.port ?? 8787) => new Promise<number>((resolve) => {
      server.listen(port, "0.0.0.0", () => {
        const address = server.address();
        resolve(typeof address === "object" && address ? address.port : port);
      });
    }),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function route(options: GatewayOptions, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://gateway");
  if (request.method === "GET" && url.pathname === "/health") {
    const nodeodm = await options.odm.reachable();
    send(response, 200, { ok: true, service: "mountain-chicken-gateway", nodeodm: nodeodm ? "up" : "down" });
    return;
  }
  if (!authorized(request, options.key)) {
    send(response, 401, { error: "Missing or wrong app key" });
    return;
  }
  const photo = /^\/v1\/jobs\/([^/]+)\/photos\/([^/]+)$/.exec(url.pathname);
  const pose = /^\/v1\/jobs\/([^/]+)\/photos\/([^/]+)\/pose$/.exec(url.pathname);
  const job = /^\/v1\/jobs\/([^/]+)$/.exec(url.pathname);
  const model = /^\/v1\/jobs\/([^/]+)\/model\.glb$/.exec(url.pathname);
  const alignment = /^\/v1\/jobs\/([^/]+)\/alignment\.json$/.exec(url.pathname);
  if (request.method === "POST" && url.pathname === "/v1/jobs") {
    send(response, 201, options.store.create());
    return;
  }
  if (photo && request.method === "GET") {
    const state = options.store.read(photo[1]);
    if (!state) return send(response, 404, { error: "No such job" });
    const name = safeName(decodeURIComponent(photo[2]));
    send(response, 200, state.photos[name] ?? { total: 0, received: 0, complete: false });
    return;
  }
  if (photo && request.method === "PUT") {
    await uploadChunk(options.store, photo[1], decodeURIComponent(photo[2]), request, response);
    return;
  }
  if (pose && request.method === "PUT") {
    await savePose(options.store, pose[1], decodeURIComponent(pose[2]), request, response);
    return;
  }
  if (job && request.method === "POST" && url.pathname.endsWith("/start") === false && request.method === "POST") {
    // handled below
  }
  if (request.method === "POST" && /^\/v1\/jobs\/([^/]+)\/start$/.exec(url.pathname)) {
    const id = /^\/v1\/jobs\/([^/]+)\/start$/.exec(url.pathname)?.[1] ?? "";
    const state = options.store.read(id);
    if (!state) return send(response, 404, { error: "No such job" });
    const ready = Object.values(state.photos).filter((item) => item.complete).length;
    if (ready < 2) return send(response, 409, { error: "Need at least two complete photos" });
    state.status = "queued";
    state.message = "Handing the photos to NodeODM.";
    options.store.write(state);
    void processJob(options, state).catch((error: unknown) => {
      const latest = options.store.read(state.id) ?? state;
      latest.status = "failed";
      latest.message = error instanceof Error ? error.message : "Processing failed";
      options.store.write(latest);
    });
    send(response, 202, options.store.read(id));
    return;
  }
  if (job && request.method === "GET") {
    const state = options.store.read(job[1]);
    if (!state) return send(response, 404, { error: "No such job" });
    send(response, 200, state);
    return;
  }
  if (model && request.method === "GET") {
    const path = options.store.modelPath(model[1]);
    if (!existsSync(path)) return send(response, 404, { error: "The model is not ready" });
    const bytes = readFileSync(path);
    response.writeHead(200, { "content-type": "model/gltf-binary", "content-length": bytes.length });
    response.end(bytes);
    return;
  }
  if (alignment && request.method === "GET") {
    const path = options.store.alignmentPath(alignment[1]);
    if (!existsSync(path)) return send(response, 404, { error: "Alignment is not ready" });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(readFileSync(path));
    return;
  }
  send(response, 404, { error: "Not found" });
}

function authorized(request: IncomingMessage, key: string): boolean {
  return request.headers.authorization === `Bearer ${key}`;
}

async function uploadChunk(store: JobStore, id: string, rawName: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const state = store.read(id);
  if (!state) return send(response, 404, { error: "No such job" });
  if (state.status !== "collecting") return send(response, 409, { error: "This job is already processing" });
  const name = safeName(rawName);
  const range = request.headers["content-range"];
  const match = typeof range === "string" ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range) : null;
  if (!match) return send(response, 400, { error: "Content-Range bytes start-end/total is required" });
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  const chunk = await readBody(request);
  if (chunk.length !== end - start + 1) return send(response, 400, { error: "Chunk length does not match Content-Range" });
  const path = store.photoPath(id, name);
  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
  const applied = applyChunk(existing, start, chunk, total);
  writeFileSync(path, applied.bytes);
  state.photos[name] = { total, received: applied.received, complete: applied.received === total };
  state.message = `${Object.values(state.photos).filter((item) => item.complete).length} photos complete.`;
  store.write(state);
  send(response, 200, state.photos[name]);
}

async function savePose(store: JobStore, id: string, rawName: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const state = store.read(id);
  if (!state) return send(response, 404, { error: "No such job" });
  const name = safeName(rawName);
  const pose = JSON.parse((await readBody(request)).toString("utf8")) as PoseRecord;
  if (!Array.isArray(pose.worldFromCamera) || pose.worldFromCamera.length !== 16) {
    return send(response, 400, { error: "Pose needs a 16-number worldFromCamera matrix" });
  }
  state.poses[name] = { ...pose, name };
  store.write(state);
  send(response, 200, { ok: true });
}

async function processJob(options: GatewayOptions, job: JobState): Promise<void> {
  const files = Object.entries(job.photos)
    .filter(([, photo]) => photo.complete)
    .map(([name]) => ({ name, bytes: readFileSync(options.store.photoPath(job.id, name)) }));
  const poses = Object.values(job.poses);
  files.push({ name: "poses.json", bytes: Buffer.from(JSON.stringify(poses)) });
  if (poses.length) files.push({ name: "geo.txt", bytes: Buffer.from(geoText(poses)) });
  const taskId = await options.odm.createTask(files);
  job.taskId = taskId;
  job.status = "running";
  job.message = "NodeODM is building the face.";
  options.store.write(job);
  for (;;) {
    const info = await options.odm.taskInfo(taskId);
    job.progress = info.progress;
    if (info.status === 30) throw new Error(info.error || "NodeODM failed");
    if (info.status === 40) break;
    job.message = `NodeODM ${Math.round(info.progress)}%.`;
    options.store.write(job);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const archive = await options.odm.downloadAll(taskId);
  const filesInZip = unzip(archive);
  const obj = findText(filesInZip, ".obj");
  if (!obj) throw new Error("NodeODM finished without an OBJ");
  const texture = findBytes(filesInZip, ".jpg");
  const glb = objToGlb(obj, texture ? new Uint8Array(texture) : null);
  const modelPath = options.store.modelPath(job.id);
  mkdirSync(dirname(modelPath), { recursive: true });
  writeFileSync(modelPath, glb);
  const reconstruction = findText(filesInZip, "reconstruction.json");
  const centers = reconstruction ? centersFromReconstruction(JSON.parse(reconstruction)) : [];
  const pairs = centers.flatMap((item) => {
    const pose = job.poses[item.name];
    const target = pose ? cameraCenter(pose.worldFromCamera) : null;
    return target ? [{ name: item.name, source: item.center, target }] : [];
  });
  writeFileSync(options.store.alignmentPath(job.id), JSON.stringify({ pairs }));
  job.status = "complete";
  job.progress = 100;
  job.message = pairs.length >= 3
    ? "Detailed model is ready to line up with the scan."
    : "Detailed model is ready, but NodeODM did not return enough camera positions to line it up.";
  options.store.write(job);
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json) });
  response.end(json);
}

export function fileSize(path: string): number {
  return statSync(path).size;
}
