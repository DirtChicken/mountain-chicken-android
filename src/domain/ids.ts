export function createId(prefix: "scan" | "route" | "pt"): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
  return `${prefix}_${uuid}`;
}

function fallbackUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const n = Math.floor(Math.random() * 16);
    const v = char === "x" ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}
