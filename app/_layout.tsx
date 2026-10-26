import { useEffect, useState, useCallback } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import * as ExpoSplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "../lib/clerk-token-cache";
import SplashScreen from "./splash-screen";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Add it to your .env file."
  );
}

const IS_WEB = Platform.OS === "web";

// Keep the native splash visible while JS bundle loads (no-op on web)
if (!IS_WEB) {
  ExpoSplashScreen.preventAutoHideAsync();
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(IS_WEB); // web is always "ready" immediately
  // On web skip the custom splash entirely — Reanimated runOnJS can silently
  // fail on web and leave the app stuck. Web has no native splash to replace.
  const [splashDone, setSplashDone] = useState(IS_WEB);

  useEffect(() => {
    if (IS_WEB) return; // nothing to do on web
    async function prepare() {
      await ExpoSplashScreen.hideAsync();
      setAppReady(true);
    }
    prepare();
  }, []);

  const handleSplashFinish = useCallback(() => {
    setSplashDone(true);
  }, []);

  // Always render the full provider tree — never return early before the
  // Stack, because that changes the hook count between renders and triggers
  // "rendered fewer hooks than expected" from expo-router's Stack internals.
  // Instead, overlay a solid cover while the app isn't ready yet.
  return (
    <ClerkProvider
      publishableKey={publishableKey!}
      // expo-secure-store is unavailable on web; omit tokenCache there
      tokenCache={IS_WEB ? undefined : tokenCache}
    >
      <SafeAreaProvider>
        {/* backgroundColor prevents white flash between Stack screens */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#1A3C5E" },
          }}
        />
        {/* Solid cover shown while the JS bundle is initialising on native.
            Sits above the Stack so no screen content flashes through early. */}
        {!appReady && <View style={styles.cover} />}
      </SafeAreaProvider>
      {/* Rendered outside SafeAreaProvider so absoluteFillObject covers the
          full window including status-bar / navigation-bar inset areas */}
      {appReady && !splashDone && (
        <SplashScreen onFinish={handleSplashFinish} />
      )}
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#1A3C5E",
  },
});
