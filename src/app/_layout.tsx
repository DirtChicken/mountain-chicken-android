import { Stack } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { bootDiagnostics } from "../device/diagnostics";
import { useLibrary } from "../state/useLibrary";
import { colors } from "../theme/theme";

export default function RootLayout() {
  bootDiagnostics();
  const hydrate = useLibrary((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.sand,
            headerTitleStyle: { fontWeight: "800", color: colors.chalk },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="library" options={{ title: "Route library" }} />
          <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="scan" options={{ headerShown: false }} />
          <Stack.Screen name="rock/[id]/index" options={{ title: "Rock" }} />
          <Stack.Screen name="rock/[id]/plot" options={{ title: "Plot the route" }} />
          <Stack.Screen name="rock/[id]/space" options={{ title: "In your space", headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
