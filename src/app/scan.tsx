import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArScanView } from "../ar/ArScanView";
import { isArAvailable } from "../ar/availability";
import { BigButton } from "../components/ui";
import { practiceBoulder } from "../mesh/practiceBoulder";
import { reconstructSurface } from "../mesh/reconstruct";
import { chooseMeshPoints } from "../mesh/samples";
import { getCaptureSnapshot, groupedSamples, resetCapture, type CaptureSnapshot } from "../state/scanCapture";
import { saveMeshScan } from "../state/saveMesh";
import { colors, space } from "../theme/theme";

export default function ScanScreen() {
  const ar = isArAvailable();
  const [capture, setCapture] = useState<CaptureSnapshot>(getCaptureSnapshot);
  const [name, setName] = useState("East face");
  const [saving, setSaving] = useState(false);
  const [showName, setShowName] = useState(false);

  useEffect(() => {
    resetCapture();
    const timer = setInterval(() => setCapture(getCaptureSnapshot()), 300);
    return () => clearInterval(timer);
  }, []);

  const saveReal = async () => {
    const choice = chooseMeshPoints(groupedSamples());
    if (!choice.points.length) {
      Alert.alert("Keep walking", choice.warning ?? "The rock has not locked in yet.");
      return;
    }
    const go = async () => {
      setSaving(true);
      await new Promise((resolve) => setTimeout(resolve, 40));
      try {
        const mesh = reconstructSurface(choice.points);
        if (!mesh) {
          Alert.alert("No surface", "Those samples did not connect into a face. Cover more of the rock.");
          return;
        }
        const description = [
          choice.warning,
          `Camera mesh source: ${capture.source}.`,
          capture.worldVertices ? `Live mesh ${capture.worldVertices} vertices.` : "",
        ].filter(Boolean).join(" ");
        const id = await saveMeshScan({
          name: name.trim() || "Rock face",
          description,
          mesh,
          quality: choice.quality,
        });
        router.replace(`/rock/${id}`);
      } catch (error) {
        Alert.alert("Could not save", error instanceof Error ? error.message : "Try again.");
      } finally {
        setSaving(false);
      }
    };
    if (choice.warning) {
      Alert.alert("Rough scan", choice.warning, [
        { text: "Keep scanning", style: "cancel" },
        { text: "Save anyway", onPress: () => void go() },
      ]);
      return;
    }
    await go();
  };

  const savePractice = async () => {
    setSaving(true);
    try {
      const { mesh, points } = practiceBoulder();
      const id = await saveMeshScan({
        name: "Practice boulder",
        description: "Generated in the app so you can learn the plotter. This is not a camera scan.",
        mesh,
        quality: "low",
        points,
        routeName: "Mountain Chicken Direct",
        grade: "V4",
        routeType: "boulder",
        notes: "Practice line on the sample boulder.",
      });
      router.replace(`/rock/${id}`);
    } catch (error) {
      Alert.alert("Could not build the practice boulder", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.fill}>
      {ar ? <ArScanView /> : (
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>The AR camera is not in this install</Text>
          <Text style={styles.fallbackBody}>
            Expo Go and the browser cannot run ARKit or ARCore. Build a development client, open it on the phone, and the scan fills this screen with a live mesh. Until then, use a practice boulder to plot a route on a real 3D model.
          </Text>
        </View>
      )}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.top} pointerEvents="box-none">
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>Back</Text></Pressable>
          {ar ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {capture.tracking} · {capture.source} · {capture.depthCount} depth · {capture.worldVertices} mesh verts
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bottom} pointerEvents="box-none">
          {ar ? <Text style={styles.coaching}>{capture.coaching}</Text> : null}
          {showName || !ar ? (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name this face"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          ) : null}
          {ar ? (
            <BigButton
              label={saving ? "Building the model…" : showName ? "Save this face" : "Save the scan"}
              disabled={saving}
              onPress={() => {
                if (!showName) {
                  setShowName(true);
                  return;
                }
                void saveReal();
              }}
            />
          ) : null}
          <BigButton
            label={saving ? "Working…" : "Use a practice boulder"}
            tone="slate"
            disabled={saving}
            onPress={() => void savePractice()}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  fallback: { flex: 1, justifyContent: "center", padding: space.lg, gap: 12 },
  fallbackTitle: { color: colors.chalk, fontSize: 28, fontWeight: "800" },
  fallbackBody: { color: colors.sand, fontSize: 16, lineHeight: 23 },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: "space-between" },
  top: { padding: space.md, gap: 8 },
  back: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(18,20,16,0.78)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backText: { color: colors.sand, fontWeight: "800", fontSize: 16 },
  badge: { alignSelf: "flex-start", backgroundColor: "rgba(18,20,16,0.78)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  badgeText: { color: colors.chalk, fontWeight: "700" },
  bottom: { padding: space.md, gap: 10 },
  coaching: {
    color: colors.chalk,
    backgroundColor: "rgba(18,20,16,0.78)",
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  input: {
    backgroundColor: colors.bgRaised,
    color: colors.chalk,
    borderRadius: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    fontSize: 17,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
