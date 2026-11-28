import { Platform } from "react-native";
import { logError } from "../log";
import { emptyTrace, noteLaunchState, type Trace } from "./trace";

const KEY = "mountain-chicken-diagnostics";
const listeners = new Set<() => void>();
let booted = false;
let hooked = false;
let current = emptyTrace();

export function bootDiagnostics(): void {
  if (booted) return;
  booted = true;
  current = noteLaunchState(loadFromDisk(), new Date().toISOString());
  writeTrace(current);
  installErrorHook();
}

export function noteScreen(screen: string, detail?: string): void {
  const label = detail ? `${screen} (${detail})` : screen;
  if (current.sessionOpen && current.lastScreen === label) return;
  current = {
    ...current,
    sessionOpen: true,
    lastScreen: label,
    lastScreenAt: new Date().toISOString(),
  };
  writeTrace(current);
  listeners.forEach((listener) => listener());
}

export function noteError(error: unknown, isFatal = false): void {
  const message = error instanceof Error ? error.message : String(error);
  current = {
    ...current,
    lastError: `${isFatal ? "Fatal: " : ""}${message}`,
    lastErrorAt: new Date().toISOString(),
  };
  writeTrace(current);
  listeners.forEach((listener) => listener());
}

export function setSafeViewer(on: boolean): void {
  current = { ...current, safeViewer: on };
  writeTrace(current);
  listeners.forEach((listener) => listener());
}

export function readTrace(): Trace {
  return current;
}

export function subscribeTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function loadFromDisk(): Trace {
  try {
    const text = readText();
    if (!text) return emptyTrace();
    const parsed = JSON.parse(text) as Partial<Trace>;
    return { ...emptyTrace(), ...parsed, history: Array.isArray(parsed.history) ? parsed.history : [] };
  } catch (error) {
    logError("diagnostics read", error);
    return emptyTrace();
  }
}

function writeTrace(trace: Trace): void {
  current = trace;
  try {
    writeText(JSON.stringify(trace));
  } catch (error) {
    logError("diagnostics write", error);
  }
}

function readText(): string | null {
  if (Platform.OS === "web") return localStorage.getItem(KEY);
  // Native file IO stays out of the web bundle path and out of module init.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  const file = new File(Paths.document, `${KEY}.json`);
  if (!file.exists) return null;
  return file.textSync();
}

function writeText(text: string): void {
  if (Platform.OS === "web") {
    localStorage.setItem(KEY, text);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  const file = new File(Paths.document, `${KEY}.json`);
  if (!file.exists) file.create({ intermediates: true });
  file.writeSync(text);
}

function installErrorHook(): void {
  if (hooked) return;
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler?: () => (error: Error, fatal?: boolean) => void; setGlobalHandler?: (handler: (error: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  hooked = true;
  const previous = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error, fatal) => {
    noteError(error, Boolean(fatal));
    previous?.(error, fatal);
  });
}
