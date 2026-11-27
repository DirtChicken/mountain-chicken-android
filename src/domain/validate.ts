import { CREATION_METHODS, POINT_TYPES, ROUTE_TYPES } from "./types";
import type { RockScan, Route, RoutePoint, Vector3 } from "./types";
import { finiteVec } from "./vec";

export function validateVector(value: Vector3, label: string): void {
  if (!value || !finiteVec(value)) {
    throw new Error(`${label} must be a finite x, y, z in meters`);
  }
}

export function validateRockScan(scan: RockScan): void {
  if (!scan.id?.startsWith("scan_")) throw new Error("Scan id must start with scan_");
  if (!scan.name?.trim()) throw new Error("Scan needs a name");
  if (!Number.isFinite(scan.latitude) || !Number.isFinite(scan.longitude)) {
    throw new Error("Scan needs a numeric latitude and longitude");
  }
  if (scan.scanQuality && !["low", "medium", "high"].includes(scan.scanQuality)) {
    throw new Error("Scan quality must be low, medium, or high");
  }
  if (scan.boundingBox) {
    validateVector(scan.boundingBox.min, "Bounding box min");
    validateVector(scan.boundingBox.max, "Bounding box max");
  }
}

export function validateRoutePoint(point: RoutePoint): void {
  if (!point.id?.startsWith("pt_")) throw new Error("Route point id must start with pt_");
  if (!Number.isInteger(point.order) || point.order < 0) throw new Error("Route point order must be a whole number");
  if (!POINT_TYPES.includes(point.type)) throw new Error(`Unknown point type ${point.type}`);
  validateVector(point.position, "Route point");
  if (point.confidence != null && (point.confidence < 0 || point.confidence > 1)) {
    throw new Error("Point confidence must be between 0 and 1");
  }
}

export function validateRoute(route: Route): void {
  if (!route.id?.startsWith("route_")) throw new Error("Route id must start with route_");
  if (!route.rockScanId?.startsWith("scan_")) throw new Error("Route must belong to a scan");
  if (!route.name?.trim()) throw new Error("Route needs a name");
  if (!ROUTE_TYPES.includes(route.type)) throw new Error(`Unknown route type ${route.type}`);
  if (!CREATION_METHODS.includes(route.creationMethod)) {
    throw new Error(`Unknown creation method ${route.creationMethod}`);
  }
  if (!Array.isArray(route.points) || route.points.length < 2) {
    throw new Error("A route needs at least a start and another point");
  }
  route.points.forEach(validateRoutePoint);
}
