/**
 * Auth controller. Coordinates the persisted token store, the auth API and
 * the global state slice.
 *
 * Boot path:
 *   1. Load tokens from localStorage.
 *   2. If present, try GET /v1/profile (api.ts auto-attaches Bearer).
 *      - On success: mark authenticated, the regular controller.bootstrap
 *        runs and populates the rest of the state.
 *      - On 401: api.ts attempts refresh internally. If refresh works the
 *        replay succeeds; if not it clears the session and we land in
 *        unauthenticated below.
 *   3. No tokens → unauthenticated.
 */

import {
  buildDevSession,
  requestEmailCode as apiRequestCode,
  verifyEmailCode as apiVerifyCode,
  AuthApiError,
  type AuthSession,
} from "../lib/auth-api";
import { getProfile } from "../lib/api";
import { setAuthInvalidationHandler } from "../lib/api";
import { clearAuthSession, getAuthSession, setAuthSession } from "../lib/token-store";
import {
  getState,
  setAuthAuthenticated,
  setAuthLoading,
  setAuthUnauthenticated,
  setState,
} from "./store";

setAuthInvalidationHandler(() => {
  // Called from api.ts when a refresh attempt has already failed.
  clearAuthSession();
  setAuthUnauthenticated("session_expired");
});

export async function initializeAuth(): Promise<boolean> {
  setAuthLoading();
  const stored = getAuthSession();
  if (!stored) {
    setAuthUnauthenticated(null);
    return false;
  }
  try {
    await getProfile();
    setAuthAuthenticated(stored);
    return true;
  } catch (error) {
    // api.ts already attempted refresh + replay on 401. Any error here
    // means we can't authenticate with the stored tokens.
    if (getState().auth.status !== "unauthenticated") {
      clearAuthSession();
      setAuthUnauthenticated(error instanceof Error ? error.message : "session_invalid");
    }
    return false;
  }
}

export async function requestEmailCode(email: string): Promise<void> {
  await apiRequestCode(email);
}

export async function verifyEmailCode(input: {
  email: string;
  code: string;
  name: string;
}): Promise<AuthSession> {
  const session = await apiVerifyCode(input);
  setAuthSession(session);
  setAuthAuthenticated(session);
  return session;
}

/**
 * Skip the real auth flow. Used when the auth service is unreachable in
 * development. Stores a session that uses the demo JWT understood by the
 * backend.
 */
export function signInWithDevFallback(input: { email: string; name: string }): AuthSession {
  const session = buildDevSession(input);
  setAuthSession(session);
  setAuthAuthenticated(session);
  return session;
}

export function signOut(): void {
  clearAuthSession();
  setAuthUnauthenticated(null);
  setState((state) => ({
    ...state,
    bootstrap: { status: "idle", error: null, pythonReady: state.bootstrap.pythonReady, pythonError: state.bootstrap.pythonError },
    profile: null,
    projects: [],
    globalSessions: [],
    projectSessions: {},
    messagesBySession: {},
    summariesBySession: {},
    selection: { kind: "none" },
    runtimeTrace: [],
    streamingFinalText: "",
  }));
}

export function isAuthApiError(error: unknown): error is AuthApiError {
  return error instanceof AuthApiError;
}
