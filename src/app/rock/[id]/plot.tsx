import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MeshCanvas } from "../../../components/MeshCanvas";
import { BigButton, Chip, ChipRow, Field } from "../../../components/ui";
import { buildRoute, makePoint } from "../../../domain/create";
import type { Route, RoutePoint, Vector3 } from "../../../domain/types";
import { routeLengthMeters } from "../../../domain/route";
import type { SurfaceMesh } from "../../../mesh/types";
import { readMeshFile } from "../../../storage/meshFiles";
import { useLibrary } from "../../../state/useLibrary";
import { colors, space } from "../../../theme/theme";

const GRADES = ["V0", "V2", "V3", "V4", "V5", "V6", "V8", "5.10a", "5.11a"];
const POINT_TYPES: RoutePoint["type"][] = ["start", "hold", "path", "anchor", "finish"];
const ROUTE_TYPES: Route["type"][] = ["boulder", "sport", "trad", "mixed"];

export default function PlotScreen() {
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
    void readMeshFile(scan.meshUrl)
      .then((loaded) => {
        if (!cancelled) setMesh(loaded);
      })
      .catch((loadError: unknown) => {
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

  if (!scan) return <Text style={styles.missing}>That rock is not on this phone.</Text>;
  if (error) return <Text style={styles.missing}>{error}</Text>;
  if (!mesh) return <Text style={styles.missing}>Opening the model…</Text>;

  return (
    <View style={styles.fill}>
      <MeshCanvas
        mesh={mesh}
        routes={siblings}
        draft={draft}
        onPick={pick}
        hint="One finger turns it. Pinch zooms. Tap the stone to drop the selected point."
      />
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetBody}>
        <Text style={styles.length}>
          {draft.length} points · {routeLengthMeters(draft).toFixed(2)} m
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
  sheet: { maxHeight: "46%", borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  sheetBody: { padding: space.md, gap: 10, paddingBottom: 28 },
  length: { color: colors.chalk, fontWeight: "800", fontSize: 16 },
  undoRow: { flexDirection: "row", gap: 16 },
  undo: { color: colors.amber, fontWeight: "800" },
  point: { color: colors.muted, fontSize: 13 },
});
