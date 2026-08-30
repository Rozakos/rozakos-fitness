import Constants from "expo-constants";

/**
 * API base URL resolution:
 * 1. EXPO_PUBLIC_API_URL env var (set in .env or shell) wins.
 * 2. In Expo Go dev, reuse the dev machine's LAN IP from the Metro host
 *    (so the phone reaches the backend without any config).
 * 3. Release builds use the public production API.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:8000`;
  }
  return "https://fitness-api.rozakos.eu";
}

export const API_URL = resolveApiUrl();
export const WS_URL = API_URL.replace(/^http/, "ws");
