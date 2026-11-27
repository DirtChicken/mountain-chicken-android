import { decode as decodeJpeg, encode as encodeJpeg } from "jpeg-js";
import { fromBase64 } from "./base64";

export type Rgba = { width: number; height: number; data: Uint8Array };

type ByteList = ArrayLike<number> | Uint8Array;

/**
 * jpeg-js returns Node's Buffer whenever `module` exists, which Metro defines.
 * Hermes then throws "Property 'Buffer' doesn't exist". A tiny stand-in is
 * installed only for that call and only when the real Buffer is missing.
 */
function withJpegBytes<T>(run: () => T): T {
  const host = globalThis as { Buffer?: { from(input: ByteList): Uint8Array; alloc(size: number): Uint8Array } };
  if (typeof host.Buffer?.from === "function") return run();
  const previous = host.Buffer;
  host.Buffer = {
    from(input) {
      return input instanceof Uint8Array ? input : Uint8Array.from(input);
    },
    alloc(size) {
      return new Uint8Array(size);
    },
  };
  try {
    return run();
  } finally {
    host.Buffer = previous;
  }
}

export function decodeJpegBytes(bytes: Uint8Array): Rgba {
  const decoded = withJpegBytes(() =>
    decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true }),
  );
  const data = decoded.data instanceof Uint8Array ? new Uint8Array(decoded.data) : Uint8Array.from(decoded.data);
  return { width: decoded.width, height: decoded.height, data };
}

export function decodeJpegBase64(value: string): Rgba {
  return decodeJpegBytes(fromBase64(value));
}

export function encodeRgba(data: Uint8Array, width: number, height: number, quality = 82): Uint8Array {
  const encoded = withJpegBytes(() => encodeJpeg({ data, width, height }, quality));
  const bytes = encoded.data;
  return bytes instanceof Uint8Array ? new Uint8Array(bytes) : Uint8Array.from(bytes as ArrayLike<number>);
}
