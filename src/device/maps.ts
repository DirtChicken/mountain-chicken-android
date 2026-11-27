import { Linking, Platform } from "react-native";
import type { RockScan } from "../domain/types";

export function hasSavedLocation(scan: RockScan): boolean {
  return !(
    scan.accuracy == null &&
    Math.abs(scan.latitude) < 1e-6 &&
    Math.abs(scan.longitude) < 1e-6
  );
}

export function formatPlace(scan: RockScan): string {
  if (!hasSavedLocation(scan)) return "Location not saved";
  const acc = scan.accuracy != null ? ` ±${Math.round(scan.accuracy)} m` : "";
  return `${scan.latitude.toFixed(5)}, ${scan.longitude.toFixed(5)}${acc}`;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export async function openMaps(scan: RockScan): Promise<void> {
  const query = `${scan.latitude},${scan.longitude}`;
  const name = encodeURIComponent(scan.name);
  const url = Platform.select({
    ios: `http://maps.apple.com/?ll=${query}&q=${name}`,
    android: `geo:${query}?q=${query}(${name})`,
    default: `https://maps.google.com/?q=${query}`,
  });
  if (url) await Linking.openURL(url);
}
