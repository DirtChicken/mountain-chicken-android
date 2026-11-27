export function logInfo(scope: string, detail?: Record<string, unknown>): void {
  console.info(`[mountain-chicken] ${scope}`, detail ?? {});
}

export function logError(scope: string, error: unknown, detail?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[mountain-chicken] ${scope}: ${message}`, detail ?? {}, error);
}
