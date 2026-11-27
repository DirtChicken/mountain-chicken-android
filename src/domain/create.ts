import { createId } from "./ids";
import { holdCount, renumber, routeLengthMeters } from "./route";
import type { RockScan, Route, RoutePoint, Vector3 } from "./types";
import { validateRockScan, validateRoute } from "./validate";

export function buildScan(input: {
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  scannedByDevice?: string;
  meshUrl?: string;
  scanQuality?: RockScan["scanQuality"];
  boundingBox?: { min: Vector3; max: Vector3 };
  now?: string;
}): RockScan {
  const now = input.now ?? new Date().toISOString();
  const scan: RockScan = {
    id: createId("scan"),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    latitude: input.latitude,
    longitude: input.longitude,
    altitude: input.altitude,
    accuracy: input.accuracy,
    createdAt: now,
    updatedAt: now,
    scannedByDevice: input.scannedByDevice,
    meshUrl: input.meshUrl,
    scanQuality: input.scanQuality,
    boundingBox: input.boundingBox,
  };
  validateRockScan(scan);
  return scan;
}

export function buildRoute(input: {
  rockScanId: string;
  name: string;
  grade?: string;
  type: Route["type"];
  notes?: string;
  description?: string;
  points: RoutePoint[];
  creationMethod?: Route["creationMethod"];
  id?: string;
  createdAt?: string;
  now?: string;
}): Route {
  const now = input.now ?? new Date().toISOString();
  const points = renumber(input.points);
  const route: Route = {
    id: input.id ?? createId("route"),
    rockScanId: input.rockScanId,
    name: input.name.trim(),
    grade: input.grade?.trim() || undefined,
    type: input.type,
    description: input.description?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    creationMethod: input.creationMethod ?? "manual",
    points,
    lengthMeters: round3(routeLengthMeters(points)),
    numberOfHolds: holdCount(points),
  };
  validateRoute(route);
  return route;
}

export function makePoint(
  position: Vector3,
  type: RoutePoint["type"],
  order: number,
  label?: string,
): RoutePoint {
  return {
    id: createId("pt"),
    order,
    position: { x: position.x, y: position.y, z: position.z },
    type,
    label,
    confidence: 1,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
