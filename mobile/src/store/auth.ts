import { create } from "zustand";

import type { User } from "../api/types";
import { storage } from "./storage";

const TOKEN_KEY = "rozakos_token";
const USER_KEY = "rozakos_user";

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
