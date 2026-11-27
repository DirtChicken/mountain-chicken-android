import { useState, useSyncExternalStore } from "react";
import { Image, ScrollView, StyleSheet, Text } from "react-native";
import { BigButton } from "../components/ui";
import { readDepthReport, subscribeDepthReport } from "../device/depthReport";
import { readTextureReport, subscribeTextureReport } from "../device/textureReport";
import { noteScreen, readTrace, setSafeViewer, subscribeTrace } from "../device/diagnostics";
import { colors, space } from "../theme/theme";

export default function DiagnosticsScreen() {
  noteScreen("diagnostics");
  const trace = useSyncExternalStore(subscribeTrace, readTrace, readTrace);
  const depth = useSyncExternalStore(subscribeDepthReport, readDepthReport, readDepthReport);
  const texture = useSyncExternalStore(subscribeTextureReport, readTextureReport, readTextureReport);
  const [showPhoto, setShowPhoto] = useState(false);
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.title}>Diagnostics</Text>
      <Text style={styles.bodyText}>
        If the app closes by itself, reopen it and come back here. The last screen is saved on the phone before the graphics code runs.
      </Text>
      <Text style={styles.label}>Last screen</Text>
      <Text style={styles.value}>{trace.lastScreen || "none"}</Text>
      <Text style={styles.meta}>{trace.lastScreenAt}</Text>
      <Text style={styles.label}>Last time the app closed</Text>
      <Text style={styles.value}>{trace.lastClosedWhile ?? "No unclean exit recorded"}</Text>
      <Text style={styles.label}>Depth</Text>
      <Text style={styles.value}>{depth.mode} · {depth.source}</Text>
      <Text style={styles.meta}>{depth.samplesPerSec} samples/sec · {depth.total} this scan</Text>
      <Text style={styles.bodyText}>{depth.message}</Text>
      <Text style={styles.label}>Face photo</Text>
      <Text style={styles.value}>{texture.keyframesCaptured} frames kept · {texture.keyframesUsed} used in the bake</Text>
      <Text style={styles.meta}>
        {texture.textureWidth}×{texture.textureHeight} · {texture.textureBytes} bytes · {texture.paintedVertices} colored vertices · view {texture.load}
      </Text>
      <Text style={styles.bodyText}>{texture.message}</Text>
      {texture.loadError ? <Text style={styles.value}>{texture.loadError}</Text> : null}
      {texture.jpgUri ? (
        <BigButton label={showPhoto ? "Hide texture image" : "Show texture image"} tone="slate" onPress={() => setShowPhoto((value) => !value)} />
      ) : null}
      {showPhoto && texture.jpgUri ? (
        <Image source={{ uri: texture.jpgUri }} style={styles.photo} resizeMode="contain" />
      ) : null}
      <Text style={styles.label}>Last error</Text>
      <Text style={styles.value}>{trace.lastError ?? "None"}</Text>
      {trace.lastErrorAt ? <Text style={styles.meta}>{trace.lastErrorAt}</Text> : null}
      <Text style={styles.bodyText}>
        Safe mode keeps the model as numbers only. Drawing the rock stays off, which is how you can tell a crash apart from a bad file.
      </Text>
      <BigButton
        label={trace.safeViewer ? "Safe mode is on" : "Turn on safe mode"}
        tone={trace.safeViewer ? "sand" : "slate"}
        onPress={() => setSafeViewer(!trace.safeViewer)}
      />
      {trace.history.length > 0 ? <Text style={styles.label}>Earlier closes</Text> : null}
      {trace.history.map((event) => (
        <Text key={`${event.at}-${event.screen}`} style={styles.meta}>
          {event.at} · {event.screen} · {event.message}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: 10, paddingBottom: 40 },
  title: { color: colors.chalk, fontSize: 32, fontWeight: "800" },
  bodyText: { color: colors.sand, fontSize: 16, lineHeight: 22 },
  label: { color: colors.copper, fontWeight: "800", marginTop: 8 },
  value: { color: colors.chalk, fontSize: 18, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 14 },
  photo: { width: "100%", height: 280, backgroundColor: colors.bgRaised, borderRadius: 12 },
});
