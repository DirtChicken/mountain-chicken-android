import type { RockScan, Route } from "../domain/types";
import { validateRockScan, validateRoute } from "../domain/validate";

export interface LibraryRepository {
  load(): Promise<{ scans: RockScan[]; routes: Route[] }>;
  saveScan(scan: RockScan): Promise<void>;
  deleteScan(id: string): Promise<void>;
  saveRoute(route: Route): Promise<void>;
  deleteRoute(id: string): Promise<void>;
}

export function createMemoryRepository(seed?: { scans?: RockScan[]; routes?: Route[] }): LibraryRepository {
  const scans = new Map<string, RockScan>();
  const routes = new Map<string, Route>();
  seed?.scans?.forEach((scan) => scans.set(scan.id, scan));
  seed?.routes?.forEach((route) => routes.set(route.id, route));

  return {
    async load() {
      return {
        scans: [...scans.values()].sort(byUpdated),
        routes: [...routes.values()].sort(byUpdated),
      };
    },
    async saveScan(scan) {
      validateRockScan(scan);
      scans.set(scan.id, scan);
    },
    async deleteScan(id) {
      scans.delete(id);
      for (const route of [...routes.values()]) {
        if (route.rockScanId === id) routes.delete(route.id);
      }
    },
    async saveRoute(route) {
      validateRoute(route);
      if (!scans.has(route.rockScanId)) throw new Error("That route's rock is not on this phone");
      routes.set(route.id, route);
    },
    async deleteRoute(id) {
      routes.delete(id);
    },
  };
}

function byUpdated<T extends { updatedAt: string }>(a: T, b: T): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}
