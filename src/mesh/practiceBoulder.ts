import type { RoutePoint, Vector3 } from "../domain/types";
import { makePoint } from "../domain/create";
import { reconstructSurface } from "./reconstruct";
import type { SurfaceMesh } from "./types";

/** A known boulder so the library, plotter, and viewer work without a camera. */
export function practiceCloud(count = 1400): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const yUnit = 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const x = Math.cos(theta) * ring;
    const z = Math.sin(theta) * ring;
    if (z < -0.15) continue;
    const wobble = 0.045 * Math.sin(x * 8.5) * Math.cos(yUnit * 6.5) * Math.sin(z * 5.5);
    points.push({
      x: x * 1.35 + wobble,
      y: (yUnit + 1) * 0.95 + wobble * 0.4,
      z: z * 0.85 + wobble * 0.6,
    });
  }
  return points;
}

export function practiceBoulder(): { mesh: SurfaceMesh; points: RoutePoint[] } {
  const mesh = reconstructSurface(practiceCloud(), { voxelSize: 0.055, band: 0.09 });
  if (!mesh) throw new Error("Practice boulder did not reconstruct");
  const points = [
    makePoint({ x: 0.05, y: 0.18, z: 0.7 }, "start", 0, "good feet"),
    makePoint({ x: 0.22, y: 0.72, z: 0.62 }, "hold", 1, "right hand jug"),
    makePoint({ x: -0.18, y: 1.15, z: 0.5 }, "hold", 2, "left crimp"),
    makePoint({ x: 0.04, y: 1.62, z: 0.28 }, "finish", 3, "top"),
  ];
  return { mesh, points };
}
