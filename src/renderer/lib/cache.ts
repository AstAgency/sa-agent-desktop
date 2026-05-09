type CacheEntry<T> = {
  data: T;
  fetchedAt: string;
  generation?: number;
};

export type DebugCacheEntry = {
  storageKey: string;
  cacheKey: string;
  fetchedAt?: string;
  generation?: number;
  data: unknown;
};

export type CacheKey =
  | "me"
  | "me-bootstrap"
  | "agents"
  | "agent-profiles"
  | "assistant-thread"
  | "workspaces"
  | `projects:${string}`
  | `sessions:${string}:global`
  | `sessions:${string}:${string}`;

const cacheGenerations = new Map<CacheKey, number>();

function getCacheStorageKey(key: CacheKey) {
  return `sa-agent.cache.${key}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCacheFresh(fetchedAt: string, ttlMs: number) {
  const fetchedTime = new Date(fetchedAt).getTime();

  if (Number.isNaN(fetchedTime)) {
    return false;
  }

  return Date.now() - fetchedTime < ttlMs;
}

export function readCacheValue<T>(key: CacheKey): CacheEntry<T> | null {
  if (typeof window === "undefined") {
    return null;
  }

  let rawValue: string | null = null;

  try {
    rawValue = window.localStorage.getItem(getCacheStorageKey(key));
  } catch {
    return null;
  }

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!isRecord(parsed) || typeof parsed.fetchedAt !== "string" || !("data" in parsed)) {
      return null;
    }

    const entry: CacheEntry<T> = {
      data: parsed.data as T,
      fetchedAt: parsed.fetchedAt,
    };

    if (typeof parsed.generation === "number") {
      entry.generation = parsed.generation;
    }

    return entry;
  } catch {
    return null;
  }
}

function getNextGeneration(key: CacheKey) {
  const persistedGeneration = readCacheValue(key)?.generation ?? 0;
  const currentGeneration = Math.max(cacheGenerations.get(key) ?? 0, persistedGeneration);
  const nextGeneration = currentGeneration + 1;
  cacheGenerations.set(key, nextGeneration);
  return nextGeneration;
}

export function writeCacheValue<T>(
  key: CacheKey,
  data: T,
  fetchedAt = new Date().toISOString(),
  generation = getNextGeneration(key),
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const currentEntry = readCacheValue<T>(key);

    if ((currentEntry?.generation ?? 0) > generation) {
      return;
    }

    window.localStorage.setItem(getCacheStorageKey(key), JSON.stringify({ data, fetchedAt, generation }));
  } catch {
    // Ignore cache write failures and keep bootstrap live.
  }
}

export function invalidateCacheValue(key: CacheKey) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getCacheStorageKey(key));
  } catch {
    // Ignore local cleanup failures.
  }
}

export function clearEntityCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToDelete: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith("sa-agent.cache.")) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore local cleanup failures.
  }
}

export function readAllCacheValuesDebug(): DebugCacheEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const entries: DebugCacheEntry[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (!key?.startsWith("sa-agent.cache.")) {
        continue;
      }

      const rawValue = window.localStorage.getItem(key);

      if (!rawValue) {
        continue;
      }

      try {
        const parsed = JSON.parse(rawValue) as Record<string, unknown>;
        entries.push({
          storageKey: key,
          cacheKey: key.replace(/^sa-agent\.cache\./, ""),
          fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : undefined,
          generation: typeof parsed.generation === "number" ? parsed.generation : undefined,
          data: "data" in parsed ? parsed.data : null,
        });
      } catch {
        entries.push({
          storageKey: key,
          cacheKey: key.replace(/^sa-agent\.cache\./, ""),
          data: rawValue,
        });
      }
    }

    return entries.sort((left, right) => left.storageKey.localeCompare(right.storageKey));
  } catch {
    return [];
  }
}

export async function getCachedResource<T>(input: {
  key: CacheKey;
  ttlMs: number;
  loader: () => Promise<T>;
  forceRefresh?: boolean;
  onFallbackToCache?: () => void;
}): Promise<T> {
  const cached = readCacheValue<T>(input.key);

  if (!input.forceRefresh && cached && isCacheFresh(cached.fetchedAt, input.ttlMs)) {
    const backgroundGeneration = getNextGeneration(input.key);

    void input
      .loader()
      .then((data) => {
        writeCacheValue(input.key, data, new Date().toISOString(), backgroundGeneration);
      })
      .catch(() => {
        // Ignore background refresh failures and keep the current cached view.
      });

    return cached.data;
  }

  const requestGeneration = getNextGeneration(input.key);

  try {
    const data = await input.loader();
    writeCacheValue(input.key, data, new Date().toISOString(), requestGeneration);
    return data;
  } catch (error) {
    if (cached && !input.forceRefresh) {
      input.onFallbackToCache?.();
      return cached.data;
    }

    throw error;
  }
}
