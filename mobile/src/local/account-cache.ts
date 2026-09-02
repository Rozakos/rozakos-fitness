import { Platform } from "react-native";

import type { User } from "../api/types";

interface CacheEntry {
  savedAt: string;
  value: unknown;
}

interface AccountCache {
  version: 1;
  entries: Record<string, CacheEntry>;
}

const MAX_ENTRIES = 200;

export function accountCacheKey(user: User): string {
  return `${user.id}-${user.created_at.replace(/[^0-9]/g, "")}`;
}

function webKey(accountKey: string): string {
  return `rozakos_account_cache_${accountKey}`;
}

function nativeFile(accountKey: string) {
  // Required lazily so the native module never loads on web.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  return new File(Paths.document, `rozakos-account-cache-${accountKey}.json`);
}

function emptyCache(): AccountCache {
  return { version: 1, entries: {} };
}

function readCache(accountKey: string): AccountCache {
  try {
    const raw =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(webKey(accountKey)) ?? null
        : (() => {
            const file = nativeFile(accountKey);
            return file.exists ? file.textSync() : null;
          })();
    if (!raw) return emptyCache();
    const parsed = JSON.parse(raw) as Partial<AccountCache>;
    return { version: 1, entries: parsed.entries ?? {} };
  } catch {
    // A corrupt or unreadable cache must never prevent the cloud API working.
    return emptyCache();
  }
}

function writeCache(accountKey: string, cache: AccountCache): void {
  try {
    const json = JSON.stringify(cache);
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(webKey(accountKey), json);
      return;
    }
    const file = nativeFile(accountKey);
    if (!file.exists) file.create();
    file.write(json);
  } catch {
    // This is an availability aid. A full disk must not turn a successful API
    // request into an app error.
  }
}

export function cacheAccountResponse(accountKey: string, path: string, value: unknown): void {
  const cache = readCache(accountKey);
  cache.entries[path] = { savedAt: new Date().toISOString(), value };
  const keys = Object.keys(cache.entries);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => cache.entries[a].savedAt.localeCompare(cache.entries[b].savedAt))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((key) => delete cache.entries[key]);
  }
  writeCache(accountKey, cache);
}

export function getCachedAccountResponse<T>(
  accountKey: string,
  path: string,
): { found: false } | { found: true; value: T } {
  const entry = readCache(accountKey).entries[path];
  return entry === undefined ? { found: false } : { found: true, value: entry.value as T };
}

export function clearAccountCache(accountKey: string): void {
  try {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(webKey(accountKey));
      return;
    }
    const file = nativeFile(accountKey);
    if (file.exists) file.delete();
  } catch {
    // Logging out must still succeed if cache cleanup cannot complete.
  }
}
