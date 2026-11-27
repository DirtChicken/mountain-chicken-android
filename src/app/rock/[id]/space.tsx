import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { noteScreen } from "../../../device/diagnostics";
import { ArSpaceView } from "../../../ar/ArSpaceView";
import { ViewerBoundary } from "../../../components/ViewerBoundary";
import { isArAvailable } from "../../../ar/availability";
import type { SurfaceMesh } from "../../../mesh/types";
import { faceModelUris, loadDisplayMesh } from "../../../storage/meshFiles";
import { useLibrary } from "../../../state/useLibrary";
import { colors, space } from "../../../theme/theme";

export default function SpaceScreen() {
  noteScreen("space: screen open");
  const { id } = useLocalSearchParams<{ id: string }>();
  const scanId = Array.isArray(id) ? id[0] : id ?? "";
  const scans = useLibrary((state) => state.scans);
  const allRoutes = useLibrary((state) => state.routes);
  const scan = scans.find((item) => item.id === scanId);
  const routes = useMemo(
    () => allRoutes.filter((item) => item.rockScanId === scanId),
    [allRoutes, scanId],
  );
  const [mesh, setMesh] = useState<SurfaceMesh | null>(null);
  const [textureUri, setTextureUri] = useState<string | null>(null);
  const [glbUri, setGlbUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scan?.meshUrl) return;
    let cancelled = false;
    void loadDisplayMesh(scan.meshUrl)
      .then(async (loaded) => {
        if (!cancelled) setMesh(loaded);
        const face = scan.meshUrl ? await faceModelUris(scan.meshUrl) : null;
        if (!cancelled) {
          setTextureUri(face?.jpgUri ?? null);
          setGlbUri(face?.glbUri ?? null);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not open the model");
      });
    return () => {
      cancelled = true;
    };
  }, [scan?.meshUrl]);

  return (
    <View style={styles.fill}>
      {error ? <Text style={styles.missing}>{error}</Text> : null}
      {!error && !mesh ? <Text style={styles.missing}>Opening the model…</Text> : null}
      {mesh ? (
        <ViewerBoundary>
          <ArSpaceView mesh={mesh} routes={routes} objUri={scan?.meshUrl ?? null} textureUri={textureUri} glbUri={glbUri} />
        </ViewerBoundary>
      ) : null}
      <SafeAreaView style={styles.top} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        {!isArAvailable() ? null : (
          <Text style={styles.caption}>{routes.length} {routes.length === 1 ? "route" : "routes"} on this model</Text>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  missing: { color: colors.sand, padding: space.lg, fontSize: 16 },
  top: { position: "absolute", top: 0, left: 0, right: 0, padding: space.md, gap: 8 },
  back: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(18,20,16,0.78)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backText: { color: colors.sand, fontWeight: "800", fontSize: 16 },
  caption: {
    alignSelf: "flex-start",
    color: colors.chalk,
    backgroundColor: "rgba(18,20,16,0.78)",
    borderRadius: 12,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontWeight: "700",
  },
});
