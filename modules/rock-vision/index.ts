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

export type DepthPoint = { x: number; y: number; z: number };

export type DepthSample = {
  success: boolean;
  mode: string;
  source: string;
  message: string;
  points: DepthPoint[];
};

type NativeModule = {
  captureColor: () => Promise<ColorFrame>;
  describe: (jpegBase64: string) => Promise<{ points?: NativeFeature[]; sharpness?: number; error?: string }>;
  sampleDepth: () => Promise<DepthSample>;
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

export function sampleDepth(): Promise<DepthSample> {
  const current = module();
  if (!current?.sampleDepth) {
    return Promise.resolve({
      success: false,
      mode: "unavailable",
      source: "none",
      message: "This install cannot read the depth image.",
      points: [],
    });
  }
  return current.sampleDepth();
}
