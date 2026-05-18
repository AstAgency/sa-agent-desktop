/**
 * localStorage-backed token store. Holds the active auth session
 * (access + refresh tokens and the cached user). Survives reloads so the
 * client can resume without re-authenticating.
 *
 * Why localStorage and not the keychain: this is a desktop client, but the
 * renderer process has its own isolated storage. For dev/local use the
 * extra round trip to the OS keychain is not worth the complexity. A future
 * iteration can swap getAuthSession/setAuthSession for an IPC-backed
 * encrypted store without touching call sites.
 */

import type { AuthSession, AuthTokens, AuthUser } from "./auth-api.js";

const STORAGE_KEY = "sa-agent.auth-session";

type Persisted = {
  version: 1;
  user: AuthUser;
  tokens: AuthTokens;
  savedAt: string;
};

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed?.version !== 1 || !parsed.tokens?.access_token) return null;
    return { user: parsed.user, tokens: parsed.tokens };
  } catch {
    return null;
  }
}

export function setAuthSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  const payload: Persisted = {
    version: 1,
    user: session.user,
    tokens: session.tokens,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getAccessToken(): string | null {
  return getAuthSession()?.tokens.access_token ?? null;
}

export function getRefreshToken(): string | null {
  return getAuthSession()?.tokens.refresh_token ?? null;
}
