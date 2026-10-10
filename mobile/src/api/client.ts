import { localApi } from "../local/api";
import {
  accountCacheKey,
  cacheAccountResponse,
  getCachedAccountResponse,
} from "../local/account-cache";
import { useAuth } from "../store/auth";
import { setServingCached } from "../store/connectivity";
import { API_URL } from "./config";
import { ApiError } from "./error";

export { ApiError } from "./error";

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { token, user, localMode } = useAuth.getState();
  if (localMode) return localApi<T>(path, options);
  const method = options.method ?? "GET";
  // Account mode keeps the last successful GET on this phone. Mutations are
  // never guessed or silently queued yet, so callers still see write errors.
  const fromCache = (): { found: false } | { found: true; value: T } =>
    method === "GET" && user !== null
      ? getCachedAccountResponse<T>(accountCacheKey(user), path)
      : { found: false };
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    const cached = fromCache();
    if (cached.found) {
      setServingCached(true);
      return cached.value;
    }
    throw error;
  }
  // The API sits behind a Cloudflare Tunnel: with the origin down, Cloudflare
  // still answers (502/530), so a 5xx is the common "server unreachable" shape
  // and has to fall back exactly like a network error.
  if (res.status >= 500) {
    const cached = fromCache();
    if (cached.found) {
      setServingCached(true);
      return cached.value;
    }
  }
  if (res.status === 401 && token) {
    // token expired/revoked — drop the session so the auth gate kicks in
    void useAuth.getState().signOut();
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, detail);
  }
  setServingCached(false);
  if (res.status === 204) return undefined as T;
  const data = (await res.json()) as T;
  if (method === "GET" && user !== null) cacheAccountResponse(accountCacheKey(user), path, data);
  return data;
}
