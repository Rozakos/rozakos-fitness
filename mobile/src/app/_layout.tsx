import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { Loading } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import { colors } from "@/theme/colors";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function AuthGate() {
  const { token, localMode, hydrated, hydrate } = useAuth();
  const unlocked = !!token || localMode;
  const hydrateSettings = useSettings((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    hydrateSettings();
  }, [hydrate, hydrateSettings]);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  // Drop cached queries when switching between account and local mode so one
  // mode's data never shows up in the other.
  const sessionKey = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    const key = `${token ?? ""}|${localMode}`;
    if (sessionKey.current !== null && sessionKey.current !== key) queryClient.clear();
    sessionKey.current = key;
  }, [hydrated, token, localMode]);

  if (!hydrated) return <Loading />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={unlocked}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="exercise/[id]" options={{ title: "Exercise" }} />
        <Stack.Screen name="routine/[id]" options={{ title: "Routine" }} />
        <Stack.Screen name="workout-summary/[id]" options={{ title: "Workout complete" }} />
        <Stack.Screen name="devices" options={{ title: "Devices" }} />
      </Stack.Protected>
      <Stack.Protected guard={!unlocked}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Android runs edge-to-edge, so every inset has to come from the provider
  // rather than being assumed. `initialMetrics` lets the first frame use the
  // real insets instead of zeroes, which otherwise shows as a visible jump on
  // the login screen. Full-screen Modals need their own provider — they render
  // outside this tree's host view (see ExercisePicker).
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <AuthGate />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
