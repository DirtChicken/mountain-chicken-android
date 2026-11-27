export type DepthReport = {
  mode: string;
  source: string;
  samplesPerSec: number;
  total: number;
  message: string;
  lastError: string | null;
  misses: number;
  imageHz: number;
};

export type DepthFrame = {
  gotPoints: boolean;
  mode?: string;
  source?: string;
  error?: string | null;
};

const listeners = new Set<() => void>();
const recent: number[] = [];
const imageMarks: number[] = [];
let report: DepthReport = emptyDepthReport();

export function emptyDepthReport(): DepthReport {
  return {
    mode: "unknown",
    source: "none",
    samplesPerSec: 0,
    total: 0,
    message: "Depth has not been checked yet.",
    lastError: null,
    misses: 0,
    imageHz: 0,
  };
}

/** One skipped frame is normal. Depth is unreadable only after it keeps failing and no samples arrived. */
export function applyDepthFrame(current: DepthReport, frame: DepthFrame): DepthReport {
  if (frame.gotPoints) {
    const mode = frame.mode && frame.mode !== "unknown" ? frame.mode : current.mode;
    return {
      ...current,
      mode: mode === "unknown" ? "on" : mode,
      source: frame.source || current.source || "arcore",
      misses: 0,
      lastError: null,
      message: `Depth is on${mode && mode !== "unknown" && mode !== "on" ? ` (${mode})` : ""}.`,
    };
  }
  const error = frame.error?.trim() || null;
  const stillFlowing = current.total > 0 || current.samplesPerSec > 0;
  if (stillFlowing) {
    return {
      ...current,
      mode: current.mode === "unknown" || current.mode === "waiting" ? "hit-test" : current.mode,
      source: current.source === "none" ? "hit-test" : current.source,
      misses: 0,
      lastError: error,
      message: error
        ? `Depth is on from camera hits. Image read skipped (${error}).`
        : "Depth is on from camera hits.",
    };
  }
  const misses = current.misses + 1;
  const unreadable = misses >= 8;
  return {
    ...current,
    mode: unreadable ? "unavailable" : current.mode === "unknown" ? "waiting" : current.mode,
    source: frame.source || current.source,
    misses,
    lastError: error,
    message: unreadable
      ? `ARCore depth is not readable${error ? `: ${error}` : "."}`
      : error
        ? `This depth frame was skipped (${error}).`
        : "This depth frame is not ready yet.",
  };
}

export function readDepthReport(): DepthReport {
  return report;
}

export function subscribeDepthReport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function noteDepthSample(): void {
  const now = Date.now();
  recent.push(now);
  while (recent.length > 0 && now - recent[0] > 1000) recent.shift();
  report = { ...report, total: report.total + 1, samplesPerSec: recent.length };
  listeners.forEach((listener) => listener());
}

export function setDepthProbe(next: Partial<DepthReport>): void {
  report = { ...report, ...next, samplesPerSec: recent.length };
  listeners.forEach((listener) => listener());
}

export function noteDepthFrame(frame: DepthFrame): void {
  const now = Date.now();
  if (frame.gotPoints) imageMarks.push(now);
  while (imageMarks.length > 0 && now - imageMarks[0] > 1000) imageMarks.shift();
  report = { ...applyDepthFrame(report, frame), samplesPerSec: recent.length, imageHz: imageMarks.length };
  listeners.forEach((listener) => listener());
}

export function resetDepthReport(): void {
  recent.length = 0;
  imageMarks.length = 0;
  report = emptyDepthReport();
  listeners.forEach((listener) => listener());
}
