import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ViewerBoundary } from "../../../components/ViewerBoundary";
import { BigButton, Chip, ChipRow, Field } from "../../../components/ui";
import { noteError, noteScreen, readTrace, subscribeTrace } from "../../../device/diagnostics";
import { buildRoute, makePoint } from "../../../domain/create";
import type { Route, RoutePoint, Vector3 } from "../../../domain/types";
import { routeLengthMeters } from "../../../domain/route";
import { highestIndex, vertexCount } from "../../../mesh/prepareMesh";
import type { SurfaceMesh } from "../../../mesh/types";
import { loadDisplayMesh } from "../../../storage/meshFiles";
import { useLibrary } from "../../../state/useLibrary";
import { colors, space } from "../../../theme/theme";

type DrawProps = {
  mesh: SurfaceMesh;
  routes?: Route[];
  draft?: RoutePoint[];
  onPick?: (point: Vector3) => void;
  hint?: string;
};

const GRADES = ["V0", "V2", "V3", "V4", "V5", "V6", "V8", "5.10a", "5.11a"];
const POINT_TYPES: RoutePoint["type"][] = ["start", "hold", "path", "anchor", "finish"];
const ROUTE_TYPES: Route["type"][] = ["boulder", "sport", "trad", "mixed"];

export default function PlotScreen() {
  noteScreen("plot: screen open");
  const params = useLocalSearchParams<{ id: string; routeId?: string }>();
  const scanId = one(params.id);
  const routeId = one(params.routeId);
  const navigation = useNavigation();
  const scans = useLibrary((state) => state.scans);
  const allRoutes = useLibrary((state) => state.routes);
  const scan = scans.find((item) => item.id === scanId);
  const existing = allRoutes.find((item) => item.id === routeId);
  const siblings = useMemo(
    () => allRoutes.filter((item) => item.rockScanId === scanId && item.id !== routeId),
    [allRoutes, scanId, routeId],
  );
  const addRoute = useLibrary((state) => state.addRoute);
  const [mesh, setMesh] = useState<SurfaceMesh | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pointType, setPointType] = useState<RoutePoint["type"]>("hold");
  const [draft, setDraft] = useState<RoutePoint[]>([]);
  const [name, setName] = useState("New line");
  const [grade, setGrade] = useState("V4");
  const [routeType, setRouteType] = useState<Route["type"]>("boulder");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncedRoute, setSyncedRoute] = useState<string | null>(null);
  const [DrawView, setDrawView] = useState<ComponentType<DrawProps> | null>(null);
  const [drawing, setDrawing] = useState(false);
  const trace = useSyncExternalStore(subscribeTrace, readTrace, readTrace);
  if (existing && syncedRoute !== existing.id) {
    setSyncedRoute(existing.id);
    setDraft(existing.points);
    setName(existing.name);
    setGrade(existing.grade ?? "");
    setRouteType(existing.type);
    setNotes(existing.notes ?? "");
  }

  useEffect(() => {
    if (scan?.name) navigation.setOptions({ title: scan.name });
  }, [navigation, scan?.name]);

  useEffect(() => {
    if (!scan?.meshUrl) return;
    let cancelled = false;
    noteScreen("plot: reading model");
    void loadDisplayMesh(scan.meshUrl)
      .then((loaded) => {
        if (cancelled) return;
        noteScreen("plot: model loaded", `${vertexCount(loaded)} vertices`);
        setMesh(loaded);
      })
      .catch((loadError: unknown) => {
        noteError(loadError);
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not open the model");
      });
    return () => {
      cancelled = true;
    };
  }, [scan?.meshUrl]);

  const pick = (position: Vector3) => {
    setDraft((current) => [...current, makePoint(position, pointType, current.length)]);
  };

  const save = async () => {
    if (!scan) return;
    setSaving(true);
    try {
      const route = buildRoute({
        id: existing?.id,
        createdAt: existing?.createdAt,
        rockScanId: scan.id,
        name,
        grade,
        type: routeType,
        notes,
        points: draft,
        creationMethod: "manual",
      });
      await addRoute(route);
      Alert.alert("Route saved", `${route.name} is ${route.lengthMeters?.toFixed(1) ?? "?"} m in scan coordinates.`);
    } catch (saveError) {
      Alert.alert("Not saved", saveError instanceof Error ? saveError.message : "Check the line and try again.");
    } finally {
      setSaving(false);
    }
  };

  const drawModel = async () => {
    noteScreen("plot: loading 3d engine");
    setDrawing(true);
    try {
      const loaded = await import("../../../components/ViroMeshView");
      noteScreen("plot: 3d engine loaded");
      setDrawView(() => loaded.ViroMeshView);
    } catch (loadError) {
      noteError(loadError, true);
      Alert.alert("Could not start 3D", loadError instanceof Error ? loadError.message : "The 3D engine failed to load.");
      setDrawing(false);
    }
  };

  if (!scan) return <Text style={styles.missing}>That rock is not on this phone.</Text>;
  if (error) return <Text style={styles.missing}>{error}</Text>;
  if (!mesh) return <Text style={styles.missing}>Opening the model…</Text>;

  const stats = `${vertexCount(mesh)} vertices · ${Math.floor(mesh.indices.length / 3)} triangles · largest index ${highestIndex(mesh)}`;

  return (
    <View style={styles.fill}>
      {DrawView ? (
        <ViewerBoundary>
          <DrawView
            mesh={mesh}
            routes={siblings}
            draft={draft}
            onPick={pick}
            hint="One finger turns it. Pinch zooms. Tap the stone to drop the selected point."
          />
        </ViewerBoundary>
      ) : (
        <View style={styles.stats}>
          <Text style={styles.statsTitle}>Model on this phone</Text>
          <Text style={styles.statsBody}>{stats}</Text>
          <Text style={styles.statsBody}>
            Nothing is drawn yet. The last version closed the app while starting the graphics view, before the rock appeared. Drawing starts only when you tap the button.
          </Text>
          {trace.safeViewer ? (
            <Text style={styles.statsBody}>Safe mode is on. Turn it off from Diagnostics if you want to try drawing.</Text>
          ) : (
            <BigButton label={drawing ? "Starting 3D…" : "Draw the model"} disabled={drawing} onPress={() => void drawModel()} />
          )}
        </View>
      )}
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetBody}>
        <Text style={styles.length}>
          {stats} · {draft.length} points · {routeLengthMeters(draft).toFixed(2)} m
        </Text>
        <ChipRow>
          {POINT_TYPES.map((type) => (
            <Chip key={type} label={type} selected={pointType === type} onPress={() => setPointType(type)} />
          ))}
        </ChipRow>
        <View style={styles.undoRow}>
          <Pressable onPress={() => setDraft((current) => current.slice(0, -1))} disabled={draft.length === 0}>
            <Text style={styles.undo}>Undo last point</Text>
          </Pressable>
          <Pressable onPress={() => setDraft([])}>
            <Text style={styles.undo}>Clear</Text>
          </Pressable>
        </View>
        {draft.slice(-4).map((point) => (
          <Text key={point.id} style={styles.point}>
            {point.order + 1}. {point.type} {point.position.x.toFixed(2)}, {point.position.y.toFixed(2)}, {point.position.z.toFixed(2)} m
          </Text>
        ))}
        <Field label="Route name" value={name} onChangeText={setName} />
        <ChipRow>
          {GRADES.map((item) => (
            <Chip key={item} label={item} selected={grade === item} onPress={() => setGrade(item)} />
          ))}
        </ChipRow>
        <Field label="Grade" value={grade} onChangeText={setGrade} autoCapitalize="none" />
        <ChipRow>
          {ROUTE_TYPES.map((type) => (
            <Chip key={type} label={type} selected={routeType === type} onPress={() => setRouteType(type)} />
          ))}
        </ChipRow>
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        <BigButton label={saving ? "Saving…" : "Save route"} disabled={saving} onPress={() => void save()} />
      </ScrollView>
    </View>
  );
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  missing: { color: colors.sand, padding: space.lg, fontSize: 16 },
  stats: { flex: 1, justifyContent: "center", padding: space.lg, gap: 12, backgroundColor: colors.bg },
  statsTitle: { color: colors.chalk, fontSize: 28, fontWeight: "800" },
  statsBody: { color: colors.sand, fontSize: 16, lineHeight: 22 },
  sheet: { maxHeight: "46%", borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  sheetBody: { padding: space.md, gap: 10, paddingBottom: 28 },
  length: { color: colors.chalk, fontWeight: "800", fontSize: 16 },
  undoRow: { flexDirection: "row", gap: 16 },
  undo: { color: colors.amber, fontWeight: "800" },
  point: { color: colors.muted, fontSize: 13 },
});
