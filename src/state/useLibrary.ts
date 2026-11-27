import { create } from "zustand";
import type { RockScan, Route } from "../domain/types";
import { deleteMeshFile } from "../storage/meshFiles";
import type { LibraryRepository } from "../storage/repository";
import { createSqliteRepository } from "../storage/sqliteRepository";

type LibraryState = {
  ready: boolean;
  error: string | null;
  scans: RockScan[];
  routes: Route[];
  hydrate: () => Promise<void>;
  addScan: (scan: RockScan) => Promise<void>;
  removeScan: (id: string) => Promise<void>;
  addRoute: (route: Route) => Promise<void>;
  removeRoute: (id: string) => Promise<void>;
};

const repository: LibraryRepository = createSqliteRepository();

export const useLibrary = create<LibraryState>((set, get) => ({
  ready: false,
  error: null,
  scans: [],
  routes: [],
  hydrate: async () => {
    try {
      const loaded = await repository.load();
      set({ ...loaded, ready: true, error: null });
    } catch (error) {
      set({
        ready: true,
        error: error instanceof Error ? error.message : "Could not open the rocks saved on this phone",
      });
    }
  },
  addScan: async (scan) => {
    await repository.saveScan(scan);
    set({ scans: [scan, ...get().scans.filter((item) => item.id !== scan.id)] });
  },
  removeScan: async (id) => {
    const scan = get().scans.find((item) => item.id === id);
    await repository.deleteScan(id);
    await deleteMeshFile(scan?.meshUrl);
    set({
      scans: get().scans.filter((item) => item.id !== id),
      routes: get().routes.filter((item) => item.rockScanId !== id),
    });
  },
  addRoute: async (route) => {
    await repository.saveRoute(route);
    set({ routes: [route, ...get().routes.filter((item) => item.id !== route.id)] });
  },
  removeRoute: async (id) => {
    await repository.deleteRoute(id);
    set({ routes: get().routes.filter((item) => item.id !== id) });
  },
}));
