import { fromBase64 } from "../codec/base64";
import { decodeJpegBytes } from "../codec/jpeg";
import { captureColorFrame, describeNative } from "rock-vision";
import { extractFeatures, type Feature } from "../reloc/features";

export async function captureDisplayColor() {
  try {
    return await captureColorFrame();
  } catch {
    return { success: false as const, error: "color capture failed" };
  }
}

export async function describeJpeg(jpegBase64: string): Promise<Feature[]> {
  try {
    const native = await describeNative(jpegBase64);
    if (native.points && native.points.length >= 8) {
      return native.points.map((point) => ({
        x: point.x,
        y: point.y,
        descriptor: decodeDescriptor(point.d),
      }));
    }
  } catch {
    // The JS detector is the fallback when the native module is not in this build.
  }
  const decoded = decodeJpegBytes(fromBase64(jpegBase64));
  return extractFeatures(decoded.data, decoded.width, decoded.height);
}

function decodeDescriptor(value: string): Uint8Array {
  const bytes = fromBase64(value);
  return bytes.length === 32 ? bytes : bytes.slice(0, 32);
}

