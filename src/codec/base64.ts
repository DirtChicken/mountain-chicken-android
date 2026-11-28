const TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const DECODE = new Uint8Array(128);
for (let i = 0; i < TABLE.length; i++) DECODE[TABLE.charCodeAt(i)] = i;

/** Standard base64. Hermes has no Node Buffer, and atob/btoa are not assumed. */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const word = (a << 16) | (b << 8) | c;
    out += TABLE[(word >> 18) & 63];
    out += TABLE[(word >> 12) & 63];
    out += i + 1 < bytes.length ? TABLE[(word >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? TABLE[word & 63] : "=";
  }
  return out;
}

export function fromBase64(value: string): Uint8Array {
  const clean = value.replace(/[\r\n\s]/g, "");
  if (clean.length === 0) return new Uint8Array();
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((clean.length / 4) * 3 - pad);
  let written = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = DECODE[clean.charCodeAt(i)] ?? 0;
    const b = DECODE[clean.charCodeAt(i + 1)] ?? 0;
    const c = clean[i + 2] === "=" ? 0 : (DECODE[clean.charCodeAt(i + 2)] ?? 0);
    const d = clean[i + 3] === "=" ? 0 : (DECODE[clean.charCodeAt(i + 3)] ?? 0);
    const word = (a << 18) | (b << 12) | (c << 6) | d;
    bytes[written++] = (word >> 16) & 255;
    if (clean[i + 2] !== "=" && written < bytes.length) bytes[written++] = (word >> 8) & 255;
    if (clean[i + 3] !== "=" && written < bytes.length) bytes[written++] = word & 255;
  }
  return bytes;
}
