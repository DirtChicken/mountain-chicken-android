import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PoseRecord } from "./odm";

export type PhotoState = {
  total: number;
  received: number;
  complete: boolean;
};

export type JobState = {
  id: string;
  createdAt: string;
  status: "collecting" | "queued" | "running" | "failed" | "complete";
  progress: number;
  message: string;
  taskId: string | null;
  photos: Record<string, PhotoState>;
  poses: Record<string, PoseRecord>;
};

export class JobStore {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  create(): JobState {
    const job: JobState = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: "collecting",
      progress: 0,
      message: "Waiting for photos.",
      taskId: null,
      photos: {},
      poses: {},
    };
    this.write(job);
    return job;
  }

  read(id: string): JobState | null {
    if (!safeId(id)) return null;
    const path = join(this.root, id, "job.json");
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as JobState;
  }

  write(job: JobState): void {
    const dir = join(this.root, job.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "job.json"), JSON.stringify(job));
  }

  photoPath(id: string, name: string): string {
    return join(this.root, id, "photos", safeName(name));
  }

  modelPath(id: string): string {
    return join(this.root, id, "model.glb");
  }

  alignmentPath(id: string): string {
    return join(this.root, id, "alignment.json");
  }
}

export function safeName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(base) || base.startsWith(".")) {
    throw new Error("Photo name is not allowed");
  }
  return base;
}

function safeId(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export function applyChunk(existing: Buffer, start: number, chunk: Buffer, total: number): { bytes: Buffer; received: number } {
  if (start !== existing.length) throw new Error(`Resume from byte ${existing.length}, not ${start}`);
  if (start + chunk.length > total) throw new Error("Chunk runs past the end of the photo");
  return { bytes: Buffer.concat([existing, chunk]), received: start + chunk.length };
}
