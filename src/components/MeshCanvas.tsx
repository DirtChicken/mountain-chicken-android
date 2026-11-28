import { Text, View } from "react-native";
import { colors, space } from "../theme/theme";

/**
 * Native builds must not import this module's old OpenGL viewer.
 * expo-gl calls requireNativeModule("ExpoGL") at import time, and that
 * force-closes the plot screen on current Android before any rock is drawn.
 * The phone viewer is components/ViroMeshView, loaded only after a tap.
 */
export function MeshCanvas() {
  return (
    <View style={{ flex: 1, padding: space.lg, backgroundColor: colors.bg, justifyContent: "center" }}>
      <Text style={{ color: colors.sand, fontSize: 16, lineHeight: 22 }}>
        The OpenGL viewer is not used on this phone. Draw the model from the plot screen instead.
      </Text>
    </View>
  );
}
