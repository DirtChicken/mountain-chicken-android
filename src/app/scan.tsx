import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArScanView } from "../ar/ArScanView";
import { isArAvailable } from "../ar/availability";
import { BigButton } from "../components/ui";
import { practiceBoulder } from "../mesh/practiceBoulder";
import { reconstructSurface } from "../mesh/reconstruct";
import { chooseMeshPoints } from "../mesh/samples";
import { getCaptureSnapshot, getScanOrigin, getScanPhotos, groupedSamples, resetCapture, setCapturePaused, type CaptureSnapshot } from "../state/scanCapture";
import { noteScreen } from "../device/diagnostics";
import { extendMeshScan, saveMeshScan } from "../state/saveMesh";
import { cameraMatrix } from "../mesh/photo";
import { recognizeFrame, type FingerprintMap, type Recognition } from "../reloc/map";
import { nudgeYaw } from "../reloc/pose";
import { clearPlacedMesh, showPlacedMesh } from "../ar/scanStage";
import { loadDisplayMesh, readFingerprints } from "../storage/meshFiles";
import { describeJpeg } from "../vision/frames";
import { useLibrary } from "../state/useLibrary";
import type { Mat4 } from "../viewer/math";
import type { SurfaceMesh } from "../mesh/types";
import type { Route } from "../domain/types";
import { readDepthReport, subscribeDepthReport } from "../device/depthReport";
import { spillFusionCheckpoint } from "../storage/fusionCheckpoint";
import type { CoverageCell } from "../mesh/coverage";
import { colors, space } from "../theme/theme";

export default function ScanScreen() {
  noteScreen("scan");
  const params = useLocalSearchParams<{ refine?: string }>();
  const refineParam = Array.isArray(params.refine) ? params.refine[0] : params.refine;
  const ar = isArAvailable();
  const depth = useSyncExternalStore(subscribeDepthReport, readDepthReport, readDepthReport);
  const [capture, setCapture] = useState<CaptureSnapshot>(getCaptureSnapshot);
  const refineScan = useLibrary((state) => state.scans.find((item) => item.id === refineParam));
  const [customName, setCustomName] = useState<string | null>(null);
  const name = customName ?? refineScan?.name ?? "East face";
  const [saving, setSaving] = useState(false);
  const [showName, setShowName] = useState(false);
  const [match, setMatch] = useState<Recognition | null>(null);
  const [extendId, setExtendId] = useState<string | null>(refineParam ?? null);
  const maps = useRef<FingerprintMap[]>([]);
  const placedMesh = useRef<{ id: string; mesh: SurfaceMesh; routes: Route[] } | null>(null);
  const twist = useRef(0);
  const basePose = useRef<Mat4 | null>(null);

  useEffect(() => {
    resetCapture();
    clearPlacedMesh();
    const timer = setInterval(() => setCapture(getCaptureSnapshot()), 300);
    const scans = useLibrary.getState().scans;
    void Promise.all(scans.map(async (item) => {
      if (!item.meshUrl) return null;
      const json = await readFingerprints(item.meshUrl);
      if (!json) return null;
      const parsed = JSON.parse(json) as FingerprintMap;
      parsed.name = item.name;
      parsed.scanId = item.id;
      return parsed.frames?.length ? parsed : null;
    })).then((loaded) => {
      maps.current = loaded.filter((item): item is FingerprintMap => Boolean(item));
    }).catch(() => undefined);
    const spill = setInterval(() => { void spillFusionCheckpoint(); }, 8000);
    return () => {
      clearInterval(timer);
      clearInterval(spill);
    };
  }, [refineParam]);

  const placeMatch = async (found: Recognition, extraYaw = 0) => {
    const scan = useLibrary.getState().scans.find((item) => item.id === found.scanId);
    if (!scan?.meshUrl) return;
    if (!placedMesh.current || placedMesh.current.id !== scan.id) {
      const mesh = await loadDisplayMesh(scan.meshUrl);
      const routes = useLibrary.getState().routes.filter((route) => route.rockScanId === scan.id);
      placedMesh.current = { id: scan.id, mesh, routes };
    }
    const matrix = nudgeYaw(basePose.current ?? found.sessionFromScan, extraYaw);
    showPlacedMesh(placedMesh.current.mesh, placedMesh.current.routes, matrix);
    setMatch({ ...found, sessionFromScan: matrix });
  };

  const look = async () => {
    const photos = getScanPhotos();
    const photo = photos[photos.length - 1];
    const pose = photo ? cameraMatrix(photo) : null;
    if (!photo || !pose || maps.current.length === 0) return;
    const features = await describeJpeg(photo.jpegBase64);
    const found = recognizeFrame(features, { fx: photo.fx, fy: photo.fy, cx: photo.cx, cy: photo.cy }, pose, maps.current);
    if (!found) return;
    twist.current = 0;
    basePose.current = found.sessionFromScan;
    await placeMatch(found, 0);
  };

  const lookRef = useRef(look);
  useEffect(() => {
    lookRef.current = look;
  });
  useEffect(() => {
    if (!ar) return;
    const timer = setInterval(() => { void lookRef.current(); }, 2800);
    return () => clearInterval(timer);
  }, [ar]);

  const saveReal = async () => {
    const choice = chooseMeshPoints(groupedSamples());
    if (!choice.points.length) {
      Alert.alert("Keep making passes", choice.warning ?? "The rock has not locked in yet.");
      return;
    }
    if (extendId && !match) {
      Alert.alert(
        "Not lined up yet",
        "Keep this face in frame until it is recognized, then finish. Those passes fuse into the saved rock. Or save this walk as a new one.",
        [
          { text: "Keep scanning", style: "cancel", onPress: () => { setCapturePaused(false); setShowName(false); } },
          { text: "Save as new", onPress: () => { setExtendId(null); setShowName(true); } },
        ],
      );
      return;
    }
    const go = async () => {
      setSaving(true);
      await new Promise((resolve) => setTimeout(resolve, 40));
      try {
        const mesh = reconstructSurface(choice.points, { voxelSize: 0.018, maxAxis: 96 });
        if (!mesh) {
          Alert.alert("No surface", "Those samples did not connect into a face. Cover more of the rock.");
          return;
        }
        const description = [
          choice.warning,
          `Camera mesh source: ${capture.source}.`,
          capture.worldVertices ? `Live mesh ${capture.worldVertices} vertices.` : "",
          getScanPhotos().length ? `${getScanPhotos().length} camera photos.` : "",
        ].filter(Boolean).join(" ");
        const photos = getScanPhotos();
        const origin = getScanOrigin();
        if (extendId && match) {
          const scan = useLibrary.getState().scans.find((item) => item.id === extendId);
          if (!scan) throw new Error("The saved rock is no longer on this phone");
          await extendMeshScan({
            scan,
            points: choice.points,
            origin,
            sessionFromScan: match.sessionFromScan,
            photos,
          });
          router.replace(`/rock/${scan.id}`);
          return;
        }
        const id = await saveMeshScan({
          name: name.trim() || "Rock face",
          description,
          mesh,
          quality: choice.quality,
          photos,
          origin,
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
                {capture.paused ? "paused" : capture.tracking} · {capture.depthCount} depth · {depth.samplesPerSec}/s · {depth.mode} · {capture.photoCount} photos
              </Text>
              <CoverageMap cells={capture.coverage} />
            </View>
          ) : null}
          {refineParam ? (
            <Text style={styles.coaching}>Refining {name}. New passes stay in this scan once the rock is recognized.</Text>
          ) : null}
        </View>
        <View style={styles.bottom} pointerEvents="box-none">
          {ar ? <Text style={styles.coaching}>{capture.coaching}</Text> : null}
          {ar && depth.mode !== "unknown" ? <Text style={styles.coaching}>{depth.message}</Text> : null}
          {match ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {match.confidence === "high" ? "Recognized" : "Maybe"} {match.name}. {match.inliers} marks agree. No signal needed.
              </Text>
              <View style={styles.row}>
                <Pressable onPress={() => { twist.current -= 0.12; void placeMatch(match, twist.current); }}><Text style={styles.backText}>Twist left</Text></Pressable>
                <Pressable onPress={() => { twist.current += 0.12; void placeMatch(match, twist.current); }}><Text style={styles.backText}>Twist right</Text></Pressable>
                <Pressable onPress={() => { setExtendId(match.scanId); setShowName(true); }}><Text style={styles.backText}>Add to this rock</Text></Pressable>
                <Pressable onPress={() => { setMatch(null); setExtendId(null); clearPlacedMesh(); }}><Text style={styles.backText}>Not this rock</Text></Pressable>
              </View>
            </View>
          ) : null}
          {showName || !ar ? (
            <TextInput
              value={name}
              onChangeText={setCustomName}
              placeholder="Name this face"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          ) : null}
          {ar ? (
            <BigButton
              label={capture.paused && !showName ? "Resume" : "Pause"}
              tone="slate"
              disabled={saving}
              onPress={() => {
                if (capture.paused) {
                  setCapturePaused(false);
                  setShowName(false);
                } else {
                  setCapturePaused(true);
                }
              }}
            />
          ) : null}
          {ar ? (
            <BigButton
              label={saving ? "Building the model…" : showName ? (extendId ? `Fuse into ${name}` : "Save this face") : "Finish scan"}
              disabled={saving}
              onPress={() => {
                if (!showName) {
                  setCapturePaused(true);
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

function CoverageMap({ cells }: { cells: CoverageCell[][] }) {
  return (
    <View style={styles.coverage}>
      {[...cells].reverse().map((row, rowIndex) => (
        <View key={rowIndex} style={styles.coverageRow}>
          {row.map((cell, column) => (
            <View
              key={column}
              style={[styles.cell, cell === 2 ? styles.cellSolid : cell === 1 ? styles.cellThin : styles.cellEmpty]}
            />
          ))}
        </View>
      ))}
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  coverage: { marginTop: 8, gap: 2 },
  coverageRow: { flexDirection: "row", gap: 2 },
  cell: { width: 14, height: 10, borderRadius: 2 },
  cellSolid: { backgroundColor: colors.copper },
  cellThin: { backgroundColor: colors.sand },
  cellEmpty: { backgroundColor: colors.line },
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
