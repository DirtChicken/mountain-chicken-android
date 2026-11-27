export type DepthReport = {
  mode: string;
  source: string;
  samplesPerSec: number;
  total: number;
  message: string;
};

const listeners = new Set<() => void>();
const recent: number[] = [];
let report: DepthReport = {
  mode: "unknown",
  source: "none",
  samplesPerSec: 0,
  total: 0,
  message: "Depth has not been checked yet.",
};

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

export function resetDepthReport(): void {
  recent.length = 0;
  report = {
    mode: "unknown",
    source: "none",
    samplesPerSec: 0,
    total: 0,
    message: "Depth has not been checked yet.",
  };
  listeners.forEach((listener) => listener());
}
