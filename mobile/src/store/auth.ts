import { create } from "zustand";

import type { User } from "../api/types";
import { storage } from "./storage";

const TOKEN_KEY = "rozakos_token";
const USER_KEY = "rozakos_user";
const LOCAL_MODE_KEY = "rozakos_local_mode";

interface AuthState {
  token: string | null;
  user: User | null;
  /** On-phone mode: no account, no sync — data lives only on this device. */
  localMode: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  signIn: (token: string, user: User) => Promise<void>;
  enterLocalMode: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  localMode: false,
  hydrated: false,
  hydrate: async () => {
    const [token, userJson, localMode] = await Promise.all([
      storage.get(TOKEN_KEY),
      storage.get(USER_KEY),
      storage.get(LOCAL_MODE_KEY),
    ]);
    set({
      token,
      user: userJson ? JSON.parse(userJson) : null,
      localMode: localMode === "1",
      hydrated: true,
    });
  },
  signIn: async (token, user) => {
    await Promise.all([
      storage.set(TOKEN_KEY, token),
      storage.set(USER_KEY, JSON.stringify(user)),
      storage.delete(LOCAL_MODE_KEY),
    ]);
    set({ token, user, localMode: false });
  },
  enterLocalMode: async () => {
    await storage.set(LOCAL_MODE_KEY, "1");
    set({ localMode: true });
  },
  // Leaving local mode keeps the on-phone database; re-entering picks it back up.
  signOut: async () => {
    await Promise.all([
      storage.delete(TOKEN_KEY),
      storage.delete(USER_KEY),
      storage.delete(LOCAL_MODE_KEY),
    ]);
    set({ token: null, user: null, localMode: false });
  },
}));
