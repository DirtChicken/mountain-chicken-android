import { NativeModules, Platform } from "react-native";

/** True only in a dev build that actually linked Viro's AR view. Expo Go does not. */
export function isArAvailable(): boolean {
  if (Platform.OS === "web") return false;
  return NativeModules.VRTARSceneNavigatorModule != null;
}
