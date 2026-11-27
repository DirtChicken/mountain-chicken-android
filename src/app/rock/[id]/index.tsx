import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BigButton } from "../../../components/ui";
import { formatPlace, formatWhen, hasSavedLocation, openMaps } from "../../../device/maps";
import { useLibrary } from "../../../state/useLibrary";
import { colors, space } from "../../../theme/theme";

export default function RockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scanId = one(id);
  const scans = useLibrary((state) => state.scans);
  const allRoutes = useLibrary((state) => state.routes);
  const scan = scans.find((item) => item.id === scanId);
  const routes = useMemo(
    () => allRoutes.filter((item) => item.rockScanId === scanId),
    [allRoutes, scanId],
  );
  const removeScan = useLibrary((state) => state.removeScan);
  const removeRoute = useLibrary((state) => state.removeRoute);
  const navigation = useNavigation();
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (scan?.name) navigation.setOptions({ title: scan.name });
  }, [navigation, scan?.name]);

  if (!scan) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.title}>That rock is not on this phone.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.title}>{scan.name}</Text>
      {scan.description ? <Text style={styles.bodyText}>{scan.description}</Text> : null}
      <Text style={styles.meta}>
        {(scan.scanQuality ?? "unrated")} scan · {formatWhen(scan.createdAt)}
      </Text>
      <Text style={styles.meta}>{formatPlace(scan)}</Text>
      {scan.boundingBox ? (
        <Text style={styles.meta}>
          About {span(scan).toFixed(1)} m across, measured in scan meters.
        </Text>
      ) : null}
      <BigButton label="View the model and plot" onPress={() => router.push(`/rock/${scan.id}/plot`)} />
      <BigButton label="In your space" tone="sand" onPress={() => router.push(`/rock/${scan.id}/space`)} />
      {hasSavedLocation(scan) ? (
        <BigButton label="Directions" tone="slate" onPress={() => void openMaps(scan)} />
      ) : null}
      <Text style={styles.section}>Routes</Text>
      {routes.length === 0 ? <Text style={styles.bodyText}>No lines yet. Open the model and tap the holds.</Text> : null}
      {routes.map((route) => (
        <Pressable key={route.id} style={styles.card} onPress={() => router.push(`/rock/${scan.id}/plot?routeId=${route.id}`)}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>{route.name}</Text>
            <Text style={styles.grade}>{route.grade ?? route.type}</Text>
          </View>
          <Text style={styles.meta}>
            {route.type}
            {route.lengthMeters != null ? ` · ${route.lengthMeters.toFixed(1)} m` : ""}
            {route.numberOfHolds != null ? ` · ${route.numberOfHolds} holds` : ""}
          </Text>
          {route.notes ? <Text style={styles.bodyText}>{route.notes}</Text> : null}
          <Pressable
            onPress={() => {
              Alert.alert("Delete this route?", route.name, [
                { text: "Keep", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => void removeRoute(route.id) },
              ]);
            }}
          >
            <Text style={styles.delete}>Delete route</Text>
          </Pressable>
        </Pressable>
      ))}
      <BigButton
        label={removing ? "Deleting…" : "Delete this rock"}
        tone="danger"
        disabled={removing}
        onPress={() => {
          Alert.alert("Delete this rock and its routes?", scan.name, [
            { text: "Keep", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                setRemoving(true);
                void removeScan(scan.id).then(() => router.replace("/"));
              },
            },
          ]);
        }}
      />
    </ScrollView>
  );
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function span(scan: { boundingBox?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }): number {
  const box = scan.boundingBox;
  if (!box) return 0;
  return Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: 12, paddingBottom: 48 },
  emptyWrap: { flex: 1, padding: space.lg, backgroundColor: colors.bg },
  title: { color: colors.chalk, fontSize: 32, fontWeight: "800" },
  bodyText: { color: colors.sand, fontSize: 16, lineHeight: 22 },
  meta: { color: colors.muted, fontSize: 14 },
  section: { color: colors.chalk, fontSize: 18, fontWeight: "800", marginTop: 8 },
  card: {
    backgroundColor: colors.bgRaised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" },
  cardTitle: { color: colors.chalk, fontSize: 18, fontWeight: "800", flex: 1 },
  grade: { color: colors.ink, backgroundColor: colors.amber, fontWeight: "800", borderRadius: 8, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4 },
  delete: { color: colors.danger, fontWeight: "800" },
});
