import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CLOSE_RANGE_OPTIONS, opensfmCenter, type OdmClient } from "./odm";
import { splitMesh, parseObj } from "./meshglb";
import { createGateway } from "./server";
import { JobStore } from "./store";

const KEY = "test-key";

test("close-range options ask NodeODM for a high mesh and skip the orthophoto", () => {
  const names = new Map(CLOSE_RANGE_OPTIONS.map((option) => [option.name, option.value]));
  assert.equal(names.get("feature-quality"), "high");
  assert.equal(names.get("pc-quality"), "high");
  assert.equal(names.get("mesh-size"), "300000");
  assert.equal(names.get("skip-orthophoto"), "true");
  assert.equal(names.get("skip-report"), "true");
});

test("a mesh with too many vertices is split into 16-bit pieces", () => {
  const positions = [];
  const uvs = [];
  const faces = [];
  for (let i = 0; i < 10; i++) {
    positions.push(i, 0, 0);
    uvs.push(0, 0);
  }
  for (let i = 0; i < 8; i++) faces.push(i, i + 1, i + 2);
  const parts = splitMesh({ positions, uvs, faces }, 4);
  assert.ok(parts.length > 1);
  for (const part of parts) {
    assert.ok(part.positions.length / 3 <= 4);
    assert.ok(Math.max(...part.indices) < 4);
    assert.equal(part.indices.BYTES_PER_ELEMENT, 2);
  }
});

test("gateway requires the app key, resumes a photo, and rejects a skipped chunk", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mc-gateway-"));
  const odm: OdmClient = {
    reachable: async () => true,
    createTask: async () => "task-1",
    taskInfo: async () => ({ status: 40, progress: 100 }),
    downloadAll: async () => storedZip([
      { name: "odm_texturing/odm_textured_model_geo.obj", data: Buffer.from("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n") },
      { name: "opensfm/reconstruction.json", data: Buffer.from(JSON.stringify({
        shots: { "photo-1.jpg": { rotation: [0, 0, 0], translation: [0, 0, 0] } },
      })) },
    ]),
  };
  const gateway = createGateway({ key: KEY, store: new JobStore(dir), odm });
  const port = await gateway.listen(0);
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const locked = await fetch(`${base}/v1/jobs`);
    assert.equal(locked.status, 401);
    const created = await fetch(`${base}/v1/jobs`, { method: "POST", headers: { authorization: `Bearer ${KEY}` } });
    assert.equal(created.status, 201);
    const job = await created.json() as { id: string };
    const first = await fetch(`${base}/v1/jobs/${job.id}/photos/photo-1.jpg`, {
      method: "PUT",
      headers: { authorization: `Bearer ${KEY}`, "content-range": "bytes 0-3/8" },
      body: Buffer.from("abcd"),
    });
    assert.equal(first.status, 200);
    const status = await fetch(`${base}/v1/jobs/${job.id}/photos/photo-1.jpg`, { headers: { authorization: `Bearer ${KEY}` } });
    assert.deepEqual(await status.json(), { total: 8, received: 4, complete: false });
    const skipped = await fetch(`${base}/v1/jobs/${job.id}/photos/photo-1.jpg`, {
      method: "PUT",
      headers: { authorization: `Bearer ${KEY}`, "content-range": "bytes 6-7/8" },
      body: Buffer.from("gh"),
    });
    assert.equal(skipped.status, 400);
    const second = await fetch(`${base}/v1/jobs/${job.id}/photos/photo-1.jpg`, {
      method: "PUT",
      headers: { authorization: `Bearer ${KEY}`, "content-range": "bytes 4-7/8" },
      body: Buffer.from("efgh"),
    });
    assert.equal(second.status, 200);
    assert.equal((await second.json() as { complete: boolean }).complete, true);
    const pose = await fetch(`${base}/v1/jobs/${job.id}/photos/photo-1.jpg/pose`, {
      method: "PUT",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ fx: 1, fy: 1, cx: 0, cy: 0, width: 2, height: 2, worldFromCamera: identity() }),
    });
    assert.equal(pose.status, 200);
    const other = await fetch(`${base}/v1/jobs/${job.id}/photos/photo-2.jpg`, {
      method: "PUT",
      headers: { authorization: `Bearer ${KEY}`, "content-range": "bytes 0-1/2" },
      body: Buffer.from("zz"),
    });
    assert.equal(other.status, 200);
    const started = await fetch(`${base}/v1/jobs/${job.id}/start`, { method: "POST", headers: { authorization: `Bearer ${KEY}` } });
    assert.equal(started.status, 202);
    let done = false;
    for (let i = 0; i < 20 && !done; i++) {
      const current = await fetch(`${base}/v1/jobs/${job.id}`, { headers: { authorization: `Bearer ${KEY}` } });
      const body = await current.json() as { status: string };
      done = body.status === "complete" || body.status === "failed";
      if (!done) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const finished = await fetch(`${base}/v1/jobs/${job.id}`, { headers: { authorization: `Bearer ${KEY}` } });
    const finalBody = await finished.json() as { status: string; message: string };
    assert.equal(finalBody.status, "complete", finalBody.message);
    const model = await fetch(`${base}/v1/jobs/${job.id}/model.glb`, { headers: { authorization: `Bearer ${KEY}` } });
    assert.equal(model.status, 200);
    const bytes = new Uint8Array(await model.arrayBuffer());
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "glTF");
  } finally {
    await gateway.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an identity OpenSfM pose sits at the origin", () => {
  const center = opensfmCenter([0, 0, 0], [0, 0, 0]);
  assert.ok(center);
  assert.equal(center[0] + 0, 0);
  assert.equal(center[1] + 0, 0);
  assert.equal(center[2] + 0, 0);
});

test("obj triangles survive parsing", () => {
  const mesh = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
  assert.equal(mesh.faces.length, 3);
  assert.equal(mesh.positions.length, 9);
});

function identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function storedZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  for (const file of files) {
    const name = Buffer.from(file.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, file.data);
  }
  return Buffer.concat(parts);
}
