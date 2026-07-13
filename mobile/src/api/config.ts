import Constants from "expo-constants";

/**
 * API base URL resolution:
 * 1. EXPO_PUBLIC_API_URL env var (set in .env or shell) wins.
 * 2. In Expo Go dev, reuse the dev machine's LAN IP from the Metro host
 *    (so the phone reaches the backend without any config).
 * 3. Fallback to localhost (web / emulator on same machine).
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:8000`;
  }
  return "http://127.0.0.1:8000";
}

export const API_URL = resolveApiUrl();
export const WS_URL = API_URL.replace(/^http/, "ws");
