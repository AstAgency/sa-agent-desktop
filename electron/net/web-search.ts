import { setTimeout as delay } from "node:timers/promises";
import type { SearchProviderId, SecretsStore } from "./secrets-store.js";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type SearchProvider = {
  id: Exclude<SearchProviderId, "none">;
  search: (query: string, limit: number, signal: AbortSignal) => Promise<SearchResult[]>;
};

type SearchDeps = {
  fetchImpl?: typeof fetch;
  secretsStore: SecretsStore;
};

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;
const SEARCH_TIMEOUT_MS = 15_000;

export function normalizeSearchLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(value)));
}

export function formatSearchResults(input: {
  query: string;
  provider: Exclude<SearchProviderId, "none">;
  results: SearchResult[];
}): string {
  const lines = [
    `Query: "${input.query}"`,
    `Provider: ${input.provider}`,
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
  if (config.provider === "none" || !config.hasKey) {
    throw new Error(
      "Web search is not configured. Open Profile → Settings → Web search to add an API key.",
    );
  }

  const key = await deps.secretsStore.getSearchKey(config.provider);
  if (!key) {
    throw new Error(
      "Web search is not configured. Open Profile → Settings → Web search to add an API key.",
    );
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = delay(SEARCH_TIMEOUT_MS, undefined, { signal: controller.signal })
    .then(() => controller.abort(new Error(`Timed out after ${SEARCH_TIMEOUT_MS}ms`)))
    .catch(() => undefined);

  try {
    const provider = createProvider(config.provider, key, fetchImpl);
    const results = await provider.search(trimmedQuery, normalizeSearchLimit(limit), controller.signal);
    return formatSearchResults({ query: trimmedQuery, provider: provider.id, results });
  } finally {
    controller.abort();
    await timeout;
  }
}

function createProvider(
  provider: Exclude<SearchProviderId, "none">,
  apiKey: string,
  fetchImpl: typeof fetch,
): SearchProvider {
  if (provider === "brave") {
    return {
      id: "brave",
      async search(query, limit, signal) {
        const url = new URL("https://api.search.brave.com/res/v1/web/search");
        url.searchParams.set("q", query);
        url.searchParams.set("count", String(limit));
        url.searchParams.set("text_decorations", "false");
        const response = await fetchImpl(url, {
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": apiKey,
          },
          signal,
        });
        if (!response.ok) throw new Error(`Search provider request failed with status ${response.status}`);
        const payload = (await response.json()) as {
          web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
        };
        return (payload.web?.results ?? [])
          .slice(0, limit)
          .map((entry) => ({
            title: cleanText(entry.title, "Untitled result"),
            url: cleanText(entry.url, ""),
            snippet: cleanText(entry.description, ""),
          }))
          .filter((entry) => entry.url.length > 0);
      },
    };
  }

  return {
    id: "tavily",
    async search(query, limit, signal) {
      const response = await fetchImpl("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: limit,
          search_depth: "basic",
          include_answer: false,
          include_raw_content: false,
        }),
        signal,
      });
      if (!response.ok) throw new Error(`Search provider request failed with status ${response.status}`);
      const payload = (await response.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      return (payload.results ?? [])
        .slice(0, limit)
        .map((entry) => ({
          title: cleanText(entry.title, "Untitled result"),
          url: cleanText(entry.url, ""),
          snippet: cleanText(entry.content, ""),
        }))
        .filter((entry) => entry.url.length > 0);
    },
  };
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
