import type { Vector3 } from "../domain/types";

export type CoverageCell = 0 | 1 | 2;

const COLS = 8;
const ROWS = 8;

/** 8 by 8 view of the face. 0 empty, 1 thin, 2 well covered. Row 0 is the bottom. */
export function coverageGrid(points: Vector3[]): CoverageCell[][] {
  const grid = emptyGrid();
  if (points.length < 8) return grid;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const useX = maxX - minX >= maxZ - minZ;
  const minH = useX ? minX : minZ;
  const spanH = Math.max(1e-4, (useX ? maxX : maxZ) - minH);
  const spanY = Math.max(1e-4, maxY - minY);
  const counts = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
  for (const point of points) {
    const h = useX ? point.x : point.z;
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(((h - minH) / spanH) * COLS)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(((point.y - minY) / spanY) * ROWS)));
    counts[row][col] += 1;
  }
  const filled = counts.flat().filter((count) => count > 0).sort((a, b) => a - b);
  const median = filled[Math.floor(filled.length / 2)] ?? 1;
  const thinBelow = Math.max(2, median * 0.45);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const count = counts[row][col];
      grid[row][col] = count === 0 ? 0 : count < thinBelow ? 1 : 2;
    }
  }
  return grid;
}

export function coverageAdvice(grid: CoverageCell[][], cameraDistance: number | null): string {
  const seen = grid.flat().filter((cell) => cell > 0).length;
  if (seen < 6) {
    return "Keep moving across the face. You can come back over the same rock, higher, lower, and closer. Nothing stops after one pass.";
  }
  if (cameraDistance != null && cameraDistance > 2.4) {
    return "Move closer. Holds and texture lock in inside about two meters.";
  }
  if (bandThin(grid, 0, 2)) return "Scan from below. The bottom of the face is still thin.";
  if (bandThin(grid, 6, 8)) return "Scan the top, then drop back down through the middle.";
  if (sideThin(grid)) return "Sweep the side that is still pale, then cross the face again.";
  const thin = grid.flat().filter((cell) => cell === 1).length;
  if (thin >= 8) return "Go back over the pale patches from another height. A second pass fills them in. It stays the same scan.";
  return "That pass is in the same scan. A close look at the holds still sharpens them. Finish only when you want to stop.";
}

function bandThin(grid: CoverageCell[][], start: number, end: number): boolean {
  let weak = 0;
  let total = 0;
  for (let row = start; row < end; row++) {
    for (const cell of grid[row]) {
      total++;
      if (cell < 2) weak++;
    }
  }
  return total > 0 && weak / total > 0.62;
}

function sideThin(grid: CoverageCell[][]): boolean {
  let weak = 0;
  let total = 0;
  for (const row of grid) {
    for (const col of [0, 1, COLS - 2, COLS - 1]) {
      total++;
      if (row[col] < 2) weak++;
    }
  }
  return weak / total > 0.7;
}

function emptyGrid(): CoverageCell[][] {
  return Array.from({ length: ROWS }, () => new Array<CoverageCell>(COLS).fill(0));
}
