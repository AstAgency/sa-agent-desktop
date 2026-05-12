import type { SecretsStore } from "./secrets-store.js";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type SearchDeps = {
  fetchImpl?: typeof fetch;
  secretsStore: SecretsStore;
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
  endpoint: string;
  results: SearchResult[];
}): string {
  const lines = [
    `Query: "${input.query}"`,
    `Provider: orio (${input.endpoint})`,
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

  const config = await deps.secretsStore.getSearchConfig();
  const endpoint = config.endpoint;
  if (!endpoint) {
    throw new Error(
      "Web search endpoint is not configured. Open Profile → Web search to set the OrioSearch URL.",
    );
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${endpoint}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: trimmedQuery,
        max_results: normalizeSearchLimit(limit),
        search_depth: "basic",
        topic: "general",
        include_answer: false,
        include_images: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await safeReadError(response);
      throw new Error(
        `OrioSearch request failed (${response.status}${detail ? `: ${detail}` : ""})`,
      );
    }

    const payload = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    const results: SearchResult[] = (payload.results ?? [])
      .slice(0, normalizeSearchLimit(limit))
      .map((entry) => ({
        title: cleanText(entry.title, "Untitled result"),
        url: cleanText(entry.url, ""),
        snippet: cleanText(entry.content, ""),
      }))
      .filter((entry) => entry.url.length > 0);

    return formatSearchResults({ query: trimmedQuery, endpoint, results });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`OrioSearch request timed out after ${SEARCH_TIMEOUT_MS}ms`);
    }
    throw error instanceof Error
      ? error
      : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

export async function pingSearchEndpoint(
  endpoint: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const normalized = endpoint.trim().replace(/\/+$/, "");
  if (normalized.length === 0) throw new Error("Endpoint URL is empty");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetchImpl(`${normalized}/health`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Health check failed with status ${response.status}`);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Endpoint health check timed out");
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadError(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { detail?: string } | undefined;
    if (payload?.detail) return payload.detail;
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
