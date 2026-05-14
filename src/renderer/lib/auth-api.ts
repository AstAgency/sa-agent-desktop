/**
 * Auth service client. Talks to a separate auth backend that handles email
 * code verification and JWT issuance. The main SA-Agent backend trusts the
 * resulting access token via the Authorization header.
 *
 * Endpoints (per spec):
 *   POST /v1/auth/email/request-code { email }
 *   POST /v1/auth/email/verify-code  { email, code, name }
 *   POST /v1/auth/token/refresh      { refresh_token }
 *
 * The refresh endpoint uses the same JSON payload shape as the curl examples.
 */

export type AuthUser = {
  id: string;
  email: string;
  status: string;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
};

export type AuthSession = {
  user: AuthUser;
  tokens: AuthTokens;
};

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? `${code} (HTTP ${status})`);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_AUTH_BASE_URL = "http://127.0.0.1:3100";
export const AUTH_REFRESH_PATH = "/v1/auth/token/refresh";

function getAuthBaseUrl(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("sa-agent.auth-base-url");
    if (stored && stored.trim().length > 0) return stored.trim();
  }
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  return env?.VITE_AUTH_BASE_URL ?? DEFAULT_AUTH_BASE_URL;
}

export function setAuthBaseUrl(url: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("sa-agent.auth-base-url", url);
}

export function getCurrentAuthBaseUrl(): string {
  return getAuthBaseUrl();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${getAuthBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Network / DNS / connection failures: surface as a dedicated code so the
    // UI can offer the dev fallback path.
    throw new AuthApiError(0, "network_unavailable", String(error));
  }
  const text = await response.text();
  let payload: { error?: string } & Record<string, unknown> = {};
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      // ignore — keep payload as empty object
    }
  }
  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : "request_failed";
    throw new AuthApiError(response.status, code);
  }
  return payload as T;
}

export async function requestEmailCode(email: string): Promise<void> {
  const trimmed = email.trim();
  if (trimmed.length === 0) throw new AuthApiError(400, "invalid_email");
  await postJson<{ accepted: boolean }>("/v1/auth/email/request-code", { email: trimmed });
}

export async function verifyEmailCode(input: {
  email: string;
  code: string;
  name: string;
}): Promise<AuthSession> {
  const payload = await postJson<{ user: AuthUser; tokens: AuthTokens }>(
    "/v1/auth/email/verify-code",
    {
      email: input.email.trim(),
      code: input.code.trim(),
      name: input.name.trim(),
    },
  );
  return { user: payload.user, tokens: payload.tokens };
}

/**
 * Refresh the access token. The exact endpoint contract is not pinned in
 * the spec we received, so we default to the conventional shape. Adjust
 * here only — callers don't depend on the wire format.
 */
export async function refreshTokens(refreshToken: string): Promise<AuthSession> {
  if (!refreshToken) throw new AuthApiError(400, "missing_refresh_token");
  const payload = await postJson<{ user?: AuthUser; tokens: AuthTokens }>(
    AUTH_REFRESH_PATH,
    { refresh_token: refreshToken },
  );
  // Some servers omit the user on refresh — surface a placeholder; the
  // caller will fall back to the cached profile.
  const user: AuthUser = payload.user ?? {
    id: "",
    email: "",
    status: "active",
  };
  return { user, tokens: payload.tokens };
}

/**
 * Dev fallback session used when the auth service is unavailable or the
 * user explicitly chooses to skip authentication in development. The
 * backend accepts dev-demo-user-1-jwt as an immortal access token; the
 * "refresh token" mirrors it so callers never need to retry refresh.
 */
const DEV_DEMO_JWT = "dev-demo-user-1-jwt";

export function buildDevSession(input: { email: string; name: string }): AuthSession {
  const email = input.email.trim() || "dev@example.com";
  const name = input.name.trim() || "Dev User";
  return {
    user: {
      id: `dev-${email}`,
      email,
      status: "active",
    },
    tokens: {
      access_token: DEV_DEMO_JWT,
      refresh_token: DEV_DEMO_JWT,
      token_type: "Bearer",
      // Dev token is treated as immortal; set very large expiry so the
      // auto-refresh logic never bothers it.
      expires_in: 60 * 60 * 24 * 365 * 10,
      refresh_expires_in: 60 * 60 * 24 * 365 * 10,
    },
  };
}
