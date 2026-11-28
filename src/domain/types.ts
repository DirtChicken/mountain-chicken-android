// Coordinates are in the scan's local AR coordinate system (meters).
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface RockScan {
  id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  createdAt: string;
  updatedAt: string;
  scannedByDevice?: string;
  vpsLocationId?: string;
  vpsMapId?: string;
  cloudAnchorId?: string;
  meshUrl?: string;
  splatUrl?: string;
  thumbnailUrl?: string;
  scanQuality?: "low" | "medium" | "high";
  boundingBox?: { min: Vector3; max: Vector3 };
  referenceImages?: string[];
}

export interface Route {
  id: string;
  rockScanId: string;
  name: string;
  grade?: string;
  type: "boulder" | "sport" | "trad" | "mixed";
  description?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  creationMethod: "manual" | "climber_tracking" | "hybrid";
  points: RoutePoint[];
  climbVideoUrl?: string;
  topoImageUrl?: string;
  lengthMeters?: number;
  numberOfHolds?: number;
}

export interface RoutePoint {
  id: string;
  order: number;
  position: Vector3;
  type: "hold" | "path" | "anchor" | "start" | "finish";
  label?: string;
  confidence?: number;
}

export const ROUTE_TYPES = ["boulder", "sport", "trad", "mixed"] as const;
export const POINT_TYPES = ["start", "hold", "path", "anchor", "finish"] as const;
export const CREATION_METHODS = ["manual", "climber_tracking", "hybrid"] as const;
