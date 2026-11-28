import { isArAvailable } from "./availability";

export function ArScanView() {
  if (!isArAvailable()) return null;
  // Loaded only when the native AR view exists, so Expo Go and web never evaluate Viro.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const native = require("./NativeArScan") as typeof import("./NativeArScan");
  return <native.NativeArScan />;
}
