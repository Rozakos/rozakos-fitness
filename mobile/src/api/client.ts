import { localApi } from "../local/api";
import {
  accountCacheKey,
  cacheAccountResponse,
  getCachedAccountResponse,
} from "../local/account-cache";
import { useAuth } from "../store/auth";
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
    // Account mode keeps the last successful GET on this phone. Mutations are
    // never guessed or silently queued yet, so callers still see write errors.
    if (method === "GET" && user !== null) {
      const cached = getCachedAccountResponse<T>(accountCacheKey(user), path);
      if (cached.found) return cached.value;
    }
    throw error;
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
  if (res.status === 204) return undefined as T;
  const data = (await res.json()) as T;
  if (method === "GET" && user !== null) cacheAccountResponse(accountCacheKey(user), path, data);
  return data;
}
