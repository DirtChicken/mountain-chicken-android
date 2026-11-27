import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mark } from "../components/Mark";
import { BigButton } from "../components/ui";
import { noteScreen } from "../device/diagnostics";
import { formatPlace, formatWhen } from "../device/maps";
import { useLibrary } from "../state/useLibrary";
import { colors, space } from "../theme/theme";

export default function HomeScreen() {
  noteScreen("home");
  const ready = useLibrary((state) => state.ready);
  const error = useLibrary((state) => state.error);
  const scans = useLibrary((state) => state.scans);
  const routes = useLibrary((state) => state.routes);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Mark size={84} />
          <Text style={styles.kicker}>OUTDOOR BOULDERING</Text>
          <Text style={styles.title}>Mountain Chicken</Text>
          <Text style={styles.lead}>
            Walk the camera across a face, keep the model, and tap the holds onto it. Come back later and put that same rock in the room.
          </Text>
        </View>
        <BigButton label="Scan a rock" onPress={() => router.push("/scan")} />
        <BigButton label="Route library" tone="slate" onPress={() => router.push("/library")} />
        <BigButton label="Diagnostics" tone="slate" onPress={() => router.push("/diagnostics")} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.section}>{ready ? "On this phone" : "Opening saved rocks…"}</Text>
        {scans.length === 0 && ready ? (
          <Text style={styles.empty}>No scans yet. The first one can be a real face, or a practice boulder if you are not at the rock.</Text>
        ) : null}
        {scans.slice(0, 6).map((scan) => {
          const count = routes.filter((route) => route.rockScanId === scan.id).length;
          return (
            <Pressable key={scan.id} style={styles.card} onPress={() => router.push(`/rock/${scan.id}`)}>
              <Text style={styles.cardTitle}>{scan.name}</Text>
              <Text style={styles.cardMeta}>
                {scan.scanQuality ? `${scan.scanQuality} scan` : "scan"} · {count} {count === 1 ? "route" : "routes"} · {formatWhen(scan.updatedAt)}
              </Text>
              <Text style={styles.cardMeta}>{formatPlace(scan)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, gap: 14, paddingBottom: 40 },
  hero: { gap: 8, marginBottom: 8 },
  kicker: { color: colors.copper, fontWeight: "800", letterSpacing: 1.4, fontSize: 12 },
  title: { color: colors.chalk, fontSize: 40, fontWeight: "800", letterSpacing: -0.8 },
  lead: { color: colors.sand, fontSize: 17, lineHeight: 24 },
  section: { color: colors.muted, fontWeight: "800", marginTop: 8, letterSpacing: 0.4 },
  empty: { color: colors.chalk, fontSize: 16, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 15 },
  card: {
    backgroundColor: colors.bgRaised,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: 4,
  },
  cardTitle: { color: colors.chalk, fontSize: 18, fontWeight: "800" },
  cardMeta: { color: colors.muted, fontSize: 14 },
});
