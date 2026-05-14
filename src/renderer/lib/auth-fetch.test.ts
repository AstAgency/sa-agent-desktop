import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_REFRESH_PATH, refreshTokens } from "./auth-api.js";
import { performAuthenticatedFetch } from "./auth-fetch.js";

test("refreshTokens posts to token refresh endpoint with refresh token payload", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(
      JSON.stringify({
        tokens: {
          access_token: "access-2",
          refresh_token: "refresh-2",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_expires_in: 7200,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  await refreshTokens("refresh-1");

  assert.match(requestUrl, new RegExp(`${AUTH_REFRESH_PATH.replaceAll("/", "\\/")}$`));
  assert.equal(requestInit?.method, "POST");
  assert.equal(requestInit?.headers instanceof Object, true);
  assert.equal(requestInit?.body, JSON.stringify({ refresh_token: "refresh-1" }));
});

test("performAuthenticatedFetch retries once after 403 and reuses refreshed token", async () => {
  const seenAuthHeaders: string[] = [];
  let refreshAttempts = 0;
  let invalidations = 0;

  const response = await performAuthenticatedFetch(
    "https://example.com/v1/profile",
    { method: "GET" },
    {
      fetchImpl: async (_url, init) => {
        seenAuthHeaders.push(new Headers(init?.headers).get("authorization") ?? "");
        if (seenAuthHeaders.length === 1) {
          return new Response("forbidden", { status: 403 });
        }
        return new Response('{"ok":true}', { status: 200 });
      },
      getAccessToken: () => (refreshAttempts === 0 ? "stale-token" : "fresh-token"),
      getRefreshToken: () => "refresh-token",
      refreshSession: async (refreshToken) => {
        assert.equal(refreshToken, "refresh-token");
        refreshAttempts += 1;
        return true;
      },
      clearAuthSession: () => {
        invalidations += 1;
      },
      onSessionInvalidated: () => {
        invalidations += 1;
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(seenAuthHeaders, ["Bearer stale-token", "Bearer fresh-token"]);
  assert.equal(refreshAttempts, 1);
  assert.equal(invalidations, 0);
});

test("performAuthenticatedFetch preserves fetch invocation context", async () => {
  let invoked = 0;
  const fetchHost: {
    fetch: (this: typeof globalThis, url: string, init?: RequestInit) => Promise<Response>;
  } = {
    async fetch(this: typeof globalThis, _url: string, _init?: RequestInit) {
      assert.equal(this, globalThis);
      invoked += 1;
      return new Response("ok", { status: 200 });
    },
  };

  const response = await performAuthenticatedFetch(
    "https://example.com/v1/profile",
    { method: "GET" },
    {
      fetchImpl: fetchHost.fetch as typeof fetch,
      getAccessToken: () => null,
      getRefreshToken: () => null,
      refreshSession: async () => false,
      clearAuthSession: () => undefined,
      onSessionInvalidated: null,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(invoked, 1);
});
