import { Platform } from "react-native";
import { fusedCells } from "../state/scanCapture";

let lastWritten = -1;

/** Write the fused cells to cache so a long multi-pass scan is not only in memory. */
export async function spillFusionCheckpoint(): Promise<void> {
  if (Platform.OS === "web") return;
  const cells = fusedCells();
  if (cells.length === 0 || cells.length === lastWritten) return;
  lastWritten = cells.length;
  try {
    const { Directory, File, Paths } = await import("expo-file-system");
    const dir = new Directory(Paths.cache, "fusion");
    dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, "live.json");
    if (!file.exists) file.create();
    await file.write(JSON.stringify({ count: cells.length, cells }));
  } catch {
    lastWritten = -1;
  }
}
