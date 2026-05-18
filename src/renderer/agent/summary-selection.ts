import type { Message, SearchSummaryResult, Summary } from "../lib/types.js";

export const RESULT_LIMIT = 5;
export const DISTANCE_THRESHOLD = 0.3;
// Always anchor the prompt with the N most-recent session summaries so that
// anaphora / short follow-ups ("continue", "and the other one?") never lose
// all prior context when semantic retrieval misses.
export const RECENCY_ANCHOR = 2;
// Even when nothing clears the distance threshold, still surface the N
// closest-ranked summaries — a weak match beats an empty context.
export const MIN_SEMANTIC_RESULTS = 2;
// Bounds for the retrieval query so it stays within the e5 query budget.
const ASSISTANT_TAIL_CHARS = 600;
const USER_QUERY_CHARS = 1500;

function distanceOf(summary: SearchSummaryResult): number {
  // Unknown distance sorts last and never clears the threshold — previously it
  // silently passed, which let unscored rows masquerade as strong matches.
  return typeof summary.distance === "number"
    ? summary.distance
    : Number.POSITIVE_INFINITY;
}

/**
 * Build the text embedded for retrieval. A bare last user message embeds
 * poorly for short / anaphoric follow-ups, so we prepend the tail of the
 * previous assistant turn for extra grounding.
 */
export function buildRetrievalQuery(messages: Message[], userText: string): string {
  const user = userText.trim().slice(0, USER_QUERY_CHARS);
  let lastAssistant = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role === "assistant" && message.content.trim().length > 0) {
      lastAssistant = message.content.trim();
      break;
    }
  }
  if (lastAssistant.length === 0) return user;
  const tail = lastAssistant.slice(-ASSISTANT_TAIL_CHARS);
  return user.length > 0 ? `${tail}\n\n${user}` : tail;
}

function dedupeById(summaries: SearchSummaryResult[]): SearchSummaryResult[] {
  const seen = new Set<string>();
  const out: SearchSummaryResult[] = [];
  for (const summary of summaries) {
    if (seen.has(summary.id)) continue;
    seen.add(summary.id);
    out.push(summary);
  }
  return out;
}

/**
 * Hybrid relevance + recency selection. Kept pure (types-only deps) so it is
 * unit-testable without the embedding bridge or the network.
 */
export function selectSummaries(input: {
  results: SearchSummaryResult[];
  recentSummaries?: Summary[];
  distanceThreshold?: number;
}): SearchSummaryResult[] {
  const threshold = input.distanceThreshold ?? DISTANCE_THRESHOLD;
  const ranked = [...input.results].sort((a, b) => distanceOf(a) - distanceOf(b));

  const semantic: SearchSummaryResult[] = [];
  for (const summary of ranked) {
    if (semantic.length >= RESULT_LIMIT) break;
    // Take everything under the threshold, but guarantee at least
    // MIN_SEMANTIC_RESULTS best-ranked items even if they exceed it.
    if (distanceOf(summary) < threshold || semantic.length < MIN_SEMANTIC_RESULTS) {
      semantic.push(summary);
    } else {
      break;
    }
  }

  const recent: SearchSummaryResult[] = (input.recentSummaries ?? [])
    .slice(-RECENCY_ANCHOR)
    .map((summary) => ({ ...summary }));

  // Semantic hits first (ordered by relevance), then the recency anchor.
  return dedupeById([...semantic, ...recent]);
}
