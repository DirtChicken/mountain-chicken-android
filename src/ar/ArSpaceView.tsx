import { View } from "react-native";
import { MeshCanvas } from "../components/MeshCanvas";
import type { Route } from "../domain/types";
import type { SurfaceMesh } from "../mesh/types";
import { isArAvailable } from "./availability";

export function ArSpaceView({ mesh, routes }: { mesh: SurfaceMesh; routes: Route[] }) {
  if (!isArAvailable()) {
    return (
      <View style={{ flex: 1 }}>
        <MeshCanvas
          mesh={mesh}
          routes={routes}
          hint="This phone build has no AR camera. Turn the model here. A development build places it in the room at real size."
        />
      </View>
    );
  }
  // Loaded only when the native AR view exists, so Expo Go and web never evaluate Viro.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const native = require("./NativeArSpace") as typeof import("./NativeArSpace");
  return <native.NativeArSpace mesh={mesh} routes={routes} />;
}
