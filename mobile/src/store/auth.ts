import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";

import type { User } from "../api/types";

const TOKEN_KEY = "rozakos_token";
const USER_KEY = "rozakos_user";

// SecureStore is unavailable on web; fall back to localStorage there.
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async delete(key: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  hydrate: async () => {
    const [token, userJson] = await Promise.all([storage.get(TOKEN_KEY), storage.get(USER_KEY)]);
    set({ token, user: userJson ? JSON.parse(userJson) : null, hydrated: true });
  },
  signIn: async (token, user) => {
    await Promise.all([storage.set(TOKEN_KEY, token), storage.set(USER_KEY, JSON.stringify(user))]);
    set({ token, user });
  },
  signOut: async () => {
    await Promise.all([storage.delete(TOKEN_KEY), storage.delete(USER_KEY)]);
    set({ token: null, user: null });
  },
}));
