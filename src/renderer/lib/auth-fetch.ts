export type AuthFetchDeps = {
  fetchImpl: typeof fetch;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  refreshSession: (refreshToken: string) => Promise<boolean>;
  clearAuthSession: () => void;
  onSessionInvalidated?: (() => void) | null;
};

export function isAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function buildAuthorizedHeaders(
  getAccessToken: () => string | null,
  extra?: HeadersInit,
): Headers {
  const headers = new Headers(extra);
  const token = getAccessToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

export async function performAuthenticatedFetch(
  url: string,
  init: RequestInit,
  deps: AuthFetchDeps,
): Promise<Response> {
  const response = await deps.fetchImpl.call(globalThis, url, {
    ...init,
    headers: buildAuthorizedHeaders(deps.getAccessToken, init.headers),
  });
  if (!isAuthFailureStatus(response.status)) return response;

  const refreshToken = deps.getRefreshToken();
  const refreshed = refreshToken ? await deps.refreshSession(refreshToken) : false;
  if (!refreshed) {
    deps.clearAuthSession();
    deps.onSessionInvalidated?.();
    return response;
  }

  const replay = await deps.fetchImpl.call(globalThis, url, {
    ...init,
    headers: buildAuthorizedHeaders(deps.getAccessToken, init.headers),
  });
  return replay;
}
