import { dist } from "./vec";
import type { RoutePoint } from "./types";

export function orderedPoints(points: RoutePoint[]): RoutePoint[] {
  return [...points].sort((a, b) => a.order - b.order);
}

export function routeLengthMeters(points: RoutePoint[]): number {
  const ordered = orderedPoints(points);
  let total = 0;
  for (let i = 1; i < ordered.length; i++) {
    total += dist(ordered[i - 1].position, ordered[i].position);
  }
  return total;
}

export function holdCount(points: RoutePoint[]): number {
  return points.filter((point) => point.type === "hold" || point.type === "start" || point.type === "finish")
    .length;
}

export function renumber(points: RoutePoint[]): RoutePoint[] {
  return orderedPoints(points).map((point, order) => ({ ...point, order }));
}
