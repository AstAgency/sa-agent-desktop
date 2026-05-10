import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedResource,
  invalidateCacheValue,
  isCacheFresh,
  readCacheValue,
  writeCacheValue,
} from "../../src/renderer/lib/cache";

beforeEach(() => {
  window.localStorage.clear();
});

describe("isCacheFresh", () => {
  it("treats values inside the ttl window as fresh", () => {
    const now = new Date("2026-05-06T12:00:00.000Z").valueOf();

    vi.spyOn(Date, "now").mockReturnValue(now);

    expect(isCacheFresh(new Date(now - 30_000).toISOString(), 60_000)).toBe(true);
  });

  it("treats values outside the ttl window as stale", () => {
    const now = new Date("2026-05-06T12:00:00.000Z").valueOf();

    vi.spyOn(Date, "now").mockReturnValue(now);

    expect(isCacheFresh(new Date(now - 61_000).toISOString(), 60_000)).toBe(false);
  });
});

describe("cache storage", () => {
  it("round-trips cached values through localStorage", () => {
    writeCacheValue("me", { user_id: "demo-user-1" }, "2026-05-06T12:00:00.000Z");

    expect(readCacheValue<{ user_id: string }>("me")).toMatchObject({
      data: { user_id: "demo-user-1" },
      fetchedAt: "2026-05-06T12:00:00.000Z",
    });
  });

  it("supports project-scoped session cache keys", () => {
    writeCacheValue("sessions:ws-1:p-1", [{ id: "session-1" }], "2026-05-06T12:00:00.000Z");

    expect(readCacheValue<Array<{ id: string }>>("sessions:ws-1:p-1")).toMatchObject({
      data: [{ id: "session-1" }],
      fetchedAt: "2026-05-06T12:00:00.000Z",
    });
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem("sa-agent.cache.me", "{");

    expect(readCacheValue("me")).toBeNull();
  });

  it("bypasses a fresh cached value when force refresh is requested", async () => {
    writeCacheValue("workspaces", [], "2026-05-06T12:00:00.000Z");

    const loader = vi.fn().mockResolvedValue([{ id: "ws-1" }]);

    await expect(
      getCachedResource({
        key: "workspaces",
        ttlMs: 60_000,
        loader,
        forceRefresh: true,
      }),
    ).resolves.toEqual([{ id: "ws-1" }]);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not let an older background refresh overwrite newer force-refresh data", async () => {
    writeCacheValue("workspaces", [{ id: "cached" }], new Date().toISOString());

    let releaseBackground: ((value: Array<{ id: string }>) => void) | null = null;
    const backgroundLoader = vi.fn(
      () =>
        new Promise<Array<{ id: string }>>((resolve) => {
          releaseBackground = resolve;
        }),
    );
    const forceRefreshLoader = vi.fn().mockResolvedValue([{ id: "fresh" }]);

    await expect(
      getCachedResource({
        key: "workspaces",
        ttlMs: 60_000,
        loader: backgroundLoader,
      }),
    ).resolves.toEqual([{ id: "cached" }]);

    await expect(
      getCachedResource({
        key: "workspaces",
        ttlMs: 60_000,
        loader: forceRefreshLoader,
        forceRefresh: true,
      }),
    ).resolves.toEqual([{ id: "fresh" }]);

    releaseBackground?.([{ id: "stale-background" }]);
    await Promise.resolve();

    expect(readCacheValue<Array<{ id: string }>>("workspaces")).toMatchObject({
      data: [{ id: "fresh" }],
      fetchedAt: expect.any(String),
    });
  });

  it("does not let an older cold load overwrite a newer force-refresh result", async () => {
    let releaseColdLoad: ((value: Array<{ id: string }>) => void) | null = null;
    const coldLoader = vi.fn(
      () =>
        new Promise<Array<{ id: string }>>((resolve) => {
          releaseColdLoad = resolve;
        }),
    );
    const forceRefreshLoader = vi.fn().mockResolvedValue([{ id: "fresh" }]);

    const coldPromise = getCachedResource({
      key: "workspaces",
      ttlMs: 60_000,
      loader: coldLoader,
    });

    await Promise.resolve();

    await expect(
      getCachedResource({
        key: "workspaces",
        ttlMs: 60_000,
        loader: forceRefreshLoader,
        forceRefresh: true,
      }),
    ).resolves.toEqual([{ id: "fresh" }]);

    releaseColdLoad?.([{ id: "stale-cold-load" }]);

    await expect(coldPromise).resolves.toEqual([{ id: "stale-cold-load" }]);

    expect(readCacheValue<Array<{ id: string }>>("workspaces")).toMatchObject({
      data: [{ id: "fresh" }],
      fetchedAt: expect.any(String),
    });
  });

  it("swallows background revalidation failures while keeping cached data", async () => {
    writeCacheValue("workspaces", [{ id: "cached" }], new Date().toISOString());

    const onUnhandledRejection = vi.fn();
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    await expect(
      getCachedResource({
        key: "workspaces",
        ttlMs: 60_000,
        loader: vi.fn().mockRejectedValue(new Error("background failed")),
      }),
    ).resolves.toEqual([{ id: "cached" }]);

    await Promise.resolve();

    expect(onUnhandledRejection).not.toHaveBeenCalled();

    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  });

  it("does not fall back to cached data when force refresh fails", async () => {
    writeCacheValue("workspaces", [], new Date().toISOString());

    await expect(
      getCachedResource({
        key: "workspaces",
        ttlMs: 60_000,
        loader: vi.fn().mockRejectedValue(new Error("backend failed")),
        forceRefresh: true,
      }),
    ).rejects.toThrow("backend failed");
  });

  it("seeds the next generation from persisted cache after a fresh session reload", async () => {
    window.localStorage.setItem(
      "sa-agent.cache.workspaces",
      JSON.stringify({
        data: [{ id: "persisted" }],
        fetchedAt: "2026-05-06T12:00:00.000Z",
        generation: 8,
      }),
    );

    vi.resetModules();

    const reloadedCacheModule = await import("../../src/renderer/lib/cache");

    reloadedCacheModule.writeCacheValue("workspaces", [{ id: "next-session" }], "2026-05-06T12:01:00.000Z");

    expect(reloadedCacheModule.readCacheValue<Array<{ id: string }>>("workspaces")).toMatchObject({
      data: [{ id: "next-session" }],
      fetchedAt: "2026-05-06T12:01:00.000Z",
      generation: 9,
    });
  });
});
