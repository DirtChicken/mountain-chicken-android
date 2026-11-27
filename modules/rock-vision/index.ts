import { requireNativeModule } from "expo-modules-core";

export type ColorFrame = {
  success: boolean;
  jpegBase64?: string;
  width?: number;
  height?: number;
  fx?: number;
  fy?: number;
  cx?: number;
  cy?: number;
  worldFromCamera?: number[];
  source?: string;
  error?: string;
};

export type NativeFeature = { x: number; y: number; d: string };

type NativeModule = {
  captureColor: () => Promise<ColorFrame>;
  describe: (jpegBase64: string) => Promise<{ points?: NativeFeature[]; sharpness?: number; error?: string }>;
};

let native: NativeModule | null | undefined;

function module(): NativeModule | null {
  if (native !== undefined) return native;
  try {
    native = requireNativeModule<NativeModule>("RockVision");
  } catch {
    native = null;
  }
  return native;
}

export function captureColorFrame(): Promise<ColorFrame> {
  const current = module();
  if (!current) return Promise.resolve({ success: false, error: "Rock vision is not in this install" });
  return current.captureColor();
}

export function describeNative(jpegBase64: string) {
  const current = module();
  if (!current) return Promise.resolve({ points: [] as NativeFeature[], sharpness: 0 });
  return current.describe(jpegBase64);
}
