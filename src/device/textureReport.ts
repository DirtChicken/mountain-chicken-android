export type TextureReport = {
  keyframesCaptured: number;
  keyframesUsed: number;
  textureBytes: number;
  textureWidth: number;
  textureHeight: number;
  jpgUri: string | null;
  glbUri: string | null;
  paintedVertices: number;
  load: "not-opened" | "loaded" | "failed";
  loadError: string | null;
  message: string;
};

const listeners = new Set<() => void>();
let report: TextureReport = emptyTextureReport();

export function emptyTextureReport(): TextureReport {
  return {
    keyframesCaptured: 0,
    keyframesUsed: 0,
    textureBytes: 0,
    textureWidth: 0,
    textureHeight: 0,
    jpgUri: null,
    glbUri: null,
    paintedVertices: 0,
    load: "not-opened",
    loadError: null,
    message: "No face photo has been baked in this session.",
  };
}

export function readTextureReport(): TextureReport {
  return report;
}

export function subscribeTextureReport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function noteTexture(next: Partial<TextureReport>): void {
  report = { ...report, ...next };
  listeners.forEach((listener) => listener());
}

export function noteKeyframeCaptured(bytes: number): void {
  noteTexture({
    keyframesCaptured: report.keyframesCaptured + 1,
    textureBytes: bytes,
    message: `${report.keyframesCaptured + 1} camera frames kept (${Math.round(bytes / 1024)} KB last).`,
  });
}

export function noteTextureLoad(ok: boolean, error?: string): void {
  noteTexture({
    load: ok ? "loaded" : "failed",
    loadError: ok ? null : error ?? "The 3D view could not read the photo.",
    message: ok ? "The 3D view loaded the photo model." : `The 3D view rejected the photo: ${error ?? "unknown error"}`,
  });
}
