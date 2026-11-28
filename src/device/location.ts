import * as Location from "expo-location";

export type Fix = {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
};

export async function readLocation(): Promise<Fix | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") return null;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (!position) return null;
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude ?? undefined,
      accuracy: position.coords.accuracy ?? undefined,
    };
  } catch {
    return null;
  }
}
