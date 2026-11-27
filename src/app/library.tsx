import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { formatPlace } from "../device/maps";
import { useLibrary } from "../state/useLibrary";
import { colors, space } from "../theme/theme";

export default function LibraryScreen() {
  const scans = useLibrary((state) => state.scans);
  const routes = useLibrary((state) => state.routes);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const rows = useMemo(() => {
    return routes
      .map((route) => ({ route, scan: scans.find((scan) => scan.id === route.rockScanId) }))
      .filter(({ route, scan }) => {
        if (!needle) return true;
        const blob = `${route.name} ${route.grade ?? ""} ${route.notes ?? ""} ${route.type} ${scan?.name ?? ""}`.toLowerCase();
        return blob.includes(needle);
      });
  }, [routes, scans, needle]);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name, grade, notes"
        placeholderTextColor={colors.muted}
        style={styles.search}
        autoCorrect={false}
      />
      {rows.length === 0 ? (
        <Text style={styles.empty}>
          {routes.length === 0
            ? "No routes yet. Scan a rock, open the model, and tap the holds."
            : "Nothing matches that search."}
        </Text>
      ) : null}
      {rows.map(({ route, scan }) => (
        <Pressable
          key={route.id}
          style={styles.card}
          onPress={() => scan && router.push(`/rock/${scan.id}/plot?routeId=${route.id}`)}
        >
          <View style={styles.row}>
            <Text style={styles.name}>{route.name}</Text>
            <Text style={styles.grade}>{route.grade ?? route.type}</Text>
          </View>
          <Text style={styles.meta}>
            {scan?.name ?? "Missing rock"} · {route.type}
            {route.lengthMeters != null ? ` · ${route.lengthMeters.toFixed(1)} m` : ""}
            {route.numberOfHolds != null ? ` · ${route.numberOfHolds} holds` : ""}
          </Text>
          {route.notes ? <Text style={styles.notes}>{route.notes}</Text> : null}
          {scan ? <Text style={styles.meta}>{formatPlace(scan)}</Text> : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: 12, paddingBottom: 40 },
  search: {
    backgroundColor: colors.bgRaised,
    color: colors.chalk,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 52,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  empty: { color: colors.sand, fontSize: 16, lineHeight: 22 },
  card: {
    backgroundColor: colors.bgRaised,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" },
  name: { color: colors.chalk, fontSize: 18, fontWeight: "800", flex: 1 },
  grade: { color: colors.ink, backgroundColor: colors.amber, fontWeight: "800", overflow: "hidden", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  meta: { color: colors.muted, fontSize: 14 },
  notes: { color: colors.sand, fontSize: 15, lineHeight: 21 },
});
