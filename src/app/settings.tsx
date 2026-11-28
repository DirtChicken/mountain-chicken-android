import { useEffect, useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { BigButton } from "../components/ui";
import { noteScreen } from "../device/diagnostics";
import { readDetailSettings, writeDetailSettings, type DetailSettings } from "../detail/settings";
import { colors, space } from "../theme/theme";

export default function SettingsScreen() {
  noteScreen("settings");
  const [settings, setSettings] = useState<DetailSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void readDetailSettings().then(setSettings);
  }, []);

  if (!settings) {
    return <Text style={{ color: colors.sand, padding: space.lg }}>Opening settings…</Text>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: 12 }}>
      <Text style={{ color: colors.chalk, fontSize: 28, fontWeight: "800" }}>High detail PC</Text>
      <Text style={{ color: colors.sand, fontSize: 16, lineHeight: 22 }}>
        The phone sends sharp photos to your computer. The computer runs the gateway on port 8787. At home that is the LAN address. Away from home, connect UniFi Teleport first.
      </Text>
      <Text style={{ color: colors.copper, fontWeight: "800" }}>Server URL</Text>
      <TextInput
        value={settings.url}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(url) => { setSaved(false); setSettings({ ...settings, url }); }}
        style={input}
      />
      <Text style={{ color: colors.copper, fontWeight: "800" }}>App key</Text>
      <TextInput
        value={settings.appKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        onChangeText={(appKey) => { setSaved(false); setSettings({ ...settings, appKey }); }}
        placeholder="Same as APP_KEY on the PC"
        placeholderTextColor={colors.muted}
        style={input}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ color: colors.chalk, fontSize: 16, flex: 1 }}>Wait for Wi-Fi or VPN</Text>
        <Switch
          value={settings.waitForLan}
          onValueChange={(waitForLan) => { setSaved(false); setSettings({ ...settings, waitForLan }); }}
        />
      </View>
      <BigButton
        label={saved ? "Saved" : "Save"}
        onPress={() => {
          void writeDetailSettings(settings).then(() => setSaved(true));
        }}
      />
    </View>
  );
}

const input = {
  backgroundColor: colors.bgRaised,
  color: colors.chalk,
  borderRadius: 12,
  minHeight: 52,
  paddingHorizontal: 14,
  fontSize: 17,
  borderWidth: 1,
  borderColor: colors.line,
};
