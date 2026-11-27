export type TraceEvent = {
  at: string;
  screen: string;
  message: string;
};

export type Trace = {
  sessionOpen: boolean;
  lastScreen: string;
  lastScreenAt: string;
  lastError: string | null;
  lastErrorAt: string | null;
  lastClosedWhile: string | null;
  safeViewer: boolean;
  history: TraceEvent[];
};

export function emptyTrace(): Trace {
  return {
    sessionOpen: false,
    lastScreen: "never opened",
    lastScreenAt: "",
    lastError: null,
    lastErrorAt: null,
    lastClosedWhile: null,
    safeViewer: false,
    history: [],
  };
}

/** Remember an unclean exit before this process starts drawing. */
export function noteLaunchState(trace: Trace, now: string): Trace {
  if (!trace.sessionOpen) {
    return { ...trace, sessionOpen: true, lastScreen: "launch", lastScreenAt: now };
  }
  const screen = trace.lastScreen || "startup";
  return {
    ...trace,
    sessionOpen: true,
    lastClosedWhile: screen,
    lastScreen: "launch",
    lastScreenAt: now,
    history: [{ at: now, screen, message: "App closed without a clean exit" }, ...trace.history].slice(0, 8),
  };
}
