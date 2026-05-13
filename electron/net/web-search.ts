import type { SearxngRuntime } from "../searxng-runtime.js";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type SearchDeps = {
  fetchImpl?: typeof fetch;
  searxng: Pick<SearxngRuntime, "ensureRunning">;
};

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;
const SEARCH_TIMEOUT_MS = 20_000;

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

export async function runSearch(
  query: string,
  limit: number,
  deps: SearchDeps,
): Promise<string> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) throw new Error("query must be non-empty");
  if (trimmedQuery.length > 256) throw new Error("query must be 256 chars or fewer");

  const { port } = await deps.searxng.ensureRunning();
  const normalizedLimit = normalizeSearchLimit(limit);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  const params = new URLSearchParams({
    q: trimmedQuery,
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

    return formatSearchResults({ query: trimmedQuery, results });
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
