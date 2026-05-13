import type { SearxngRuntime } from "../searxng-runtime.js";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type SearchDeps = {
  fetchImpl?: typeof fetch;
  searxng: Pick<SearxngRuntime, "ensureRunning">;
  now?: () => number;
};

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;
const SEARCH_TIMEOUT_MS = 20_000;

// Self-hosted SearXNG looks like a bot to upstream engines very quickly if
// we hammer it. Throttle: one in-flight request at a time, min 1.2s between
// successive calls, and cache results so the agent doesn't re-query the
// same thing every turn.
const MIN_INTERVAL_MS = 1_200;
const SUCCESS_CACHE_TTL_MS = 30 * 60 * 1_000;
const FAILURE_CACHE_TTL_MS = 30 * 1_000;

type SuccessEntry = { kind: "ok"; expiresAt: number; value: string };
type FailureEntry = { kind: "fail"; expiresAt: number; error: string };
type CacheEntry = SuccessEntry | FailureEntry;

const cache = new Map<string, CacheEntry>();
let queue: Promise<unknown> = Promise.resolve();
let lastAttemptAt = 0;

export function normalizeSearchLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(value)));
}

export function formatSearchResults(input: {
  query: string;
  results: SearchResult[];
}): string {
  const lines = [
    `Query: "${input.query}"`,
    `Provider: SearXNG (local)`,
    `Results (${input.results.length}):`,
  ];
  for (const [index, result] of input.results.entries()) {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   ${result.url}`);
    lines.push(`   ${truncateSnippet(result.snippet)}`);
  }
  return lines.join("\n");
}

export function _resetSearchCacheForTests(): void {
  cache.clear();
  queue = Promise.resolve();
  lastAttemptAt = 0;
}

export async function runSearch(
  query: string,
  limit: number,
  deps: SearchDeps,
): Promise<string> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) throw new Error("query must be non-empty");
  if (trimmedQuery.length > 256) throw new Error("query must be 256 chars or fewer");

  const normalizedLimit = normalizeSearchLimit(limit);
  const cacheKey = `${normalizedLimit}::${trimmedQuery.toLowerCase()}`;
  const now = deps.now ?? Date.now;

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now()) {
    if (cached.kind === "ok") return cached.value;
    throw new Error(`${cached.error} (cached, retry in a moment)`);
  }
  if (cached) cache.delete(cacheKey);

  // Serialize through the module-level queue: every caller awaits the same
  // chain, so we never have two upstream requests in flight at once.
  const slot = queue.catch(() => undefined).then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (now() - lastAttemptAt));
    if (wait > 0) await sleep(wait);
    lastAttemptAt = now();
    try {
      const value = await executeSearch(trimmedQuery, normalizedLimit, deps);
      cache.set(cacheKey, {
        kind: "ok",
        expiresAt: now() + SUCCESS_CACHE_TTL_MS,
        value,
      });
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      cache.set(cacheKey, {
        kind: "fail",
        expiresAt: now() + FAILURE_CACHE_TTL_MS,
        error: message,
      });
      throw error;
    }
  });
  queue = slot;
  return slot;
}

async function executeSearch(
  query: string,
  normalizedLimit: number,
  deps: SearchDeps,
): Promise<string> {
  const { port } = await deps.searxng.ensureRunning();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  const params = new URLSearchParams({
    q: query,
    format: "json",
    safesearch: "0",
    language: "auto",
  });

  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/search?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await safeReadError(response);
      throw new Error(
        `SearXNG request failed (${response.status}${detail ? `: ${detail}` : ""})`,
      );
    }

    const payload = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    const results: SearchResult[] = (payload.results ?? [])
      .slice(0, normalizedLimit)
      .map((entry) => ({
        title: cleanText(entry.title, "Untitled result"),
        url: cleanText(entry.url, ""),
        snippet: cleanText(entry.content, ""),
      }))
      .filter((entry) => entry.url.length > 0);

    return formatSearchResults({ query, results });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`SearXNG request timed out after ${SEARCH_TIMEOUT_MS}ms`);
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadError(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    if (text.length > 0) return text.slice(0, 300);
  } catch {
    // ignore
  }
  return null;
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : fallback;
}

function truncateSnippet(value: string): string {
  if (value.length <= 300) return value;
  return `${value.slice(0, 300)}… (truncated)`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
