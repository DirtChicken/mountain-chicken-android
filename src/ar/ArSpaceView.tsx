import { StyleSheet, Text, View } from "react-native";
import type { Route } from "../domain/types";
import type { SurfaceMesh } from "../mesh/types";
import { colors, space } from "../theme/theme";
import { isArAvailable } from "./availability";

export function ArSpaceView({
  mesh,
  routes,
  objUri = null,
  textureUri = null,
  glbUri = null,
  onModelError,
}: {
  mesh: SurfaceMesh;
  routes: Route[];
  objUri?: string | null;
  textureUri?: string | null;
  glbUri?: string | null;
  onModelError?: () => void;
}) {
  if (!isArAvailable()) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.text}>
          In your space needs the AR camera, which is not in this install. The model is still saved. Open it from View the model and plot.
        </Text>
      </View>
    );
  }
  // Loaded only when the native AR view exists, so Expo Go and web never evaluate Viro.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const native = require("./NativeArSpace") as typeof import("./NativeArSpace");
  return <native.NativeArSpace mesh={mesh} routes={routes} objUri={objUri} textureUri={textureUri} glbUri={glbUri} onModelError={onModelError} />;
}

const styles = StyleSheet.create({
  fallback: { flex: 1, justifyContent: "center", padding: space.lg, backgroundColor: colors.bg },
  text: { color: colors.sand, fontSize: 16, lineHeight: 22 },
});
