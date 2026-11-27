import * as SQLite from "expo-sqlite";
import type { RockScan, Route } from "../domain/types";
import { validateRockScan, validateRoute } from "../domain/validate";
import type { LibraryRepository } from "./repository";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("mountain-chicken.db").then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS scans (
          id TEXT PRIMARY KEY NOT NULL,
          json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS routes (
          id TEXT PRIMARY KEY NOT NULL,
          rock_scan_id TEXT NOT NULL,
          json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS routes_by_scan ON routes (rock_scan_id);
      `);
      return db;
    });
  }
  return databasePromise;
}

export function createSqliteRepository(): LibraryRepository {
  return {
    async load() {
      const db = await database();
      const scanRows = await db.getAllAsync<{ json: string }>("SELECT json FROM scans ORDER BY updated_at DESC");
      const routeRows = await db.getAllAsync<{ json: string }>("SELECT json FROM routes ORDER BY updated_at DESC");
      return {
        scans: scanRows.map((row) => JSON.parse(row.json) as RockScan),
        routes: routeRows.map((row) => JSON.parse(row.json) as Route),
      };
    },
    async saveScan(scan) {
      validateRockScan(scan);
      const db = await database();
      await db.runAsync(
        "INSERT INTO scans (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
        scan.id,
        JSON.stringify(scan),
        scan.updatedAt,
      );
    },
    async deleteScan(id) {
      const db = await database();
      await db.runAsync("DELETE FROM routes WHERE rock_scan_id = ?", id);
      await db.runAsync("DELETE FROM scans WHERE id = ?", id);
    },
    async saveRoute(route) {
      validateRoute(route);
      const db = await database();
      const scan = await db.getFirstAsync<{ id: string }>("SELECT id FROM scans WHERE id = ?", route.rockScanId);
      if (!scan) throw new Error("That route's rock is not on this phone");
      await db.runAsync(
        "INSERT INTO routes (id, rock_scan_id, json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET rock_scan_id = excluded.rock_scan_id, json = excluded.json, updated_at = excluded.updated_at",
        route.id,
        route.rockScanId,
        JSON.stringify(route),
        route.updatedAt,
      );
    },
    async deleteRoute(id) {
      const db = await database();
      await db.runAsync("DELETE FROM routes WHERE id = ?", id);
    },
  };
}
