import { searchSummaries } from "../lib/api";
import { getBridge } from "../lib/bridge";
import type { SearchSummaryResult } from "../lib/types";

export const SEARCH_LIMIT = 10;
export const RESULT_LIMIT = 5;
export const DISTANCE_THRESHOLD = 0.3;

export type RetrievalOptions = {
  sessionId?: string;
  limit?: number;
  distanceThreshold?: number;
};

export async function retrieveRelevantSummaries(
  text: string,
  options: RetrievalOptions = {},
): Promise<SearchSummaryResult[]> {
  const embedding = await getBridge().python.embedQuery(text);
  const results = await searchSummaries({
    embedding,
    limit: options.limit ?? SEARCH_LIMIT,
    session_id: options.sessionId,
  });
  const threshold = options.distanceThreshold ?? DISTANCE_THRESHOLD;
  const filtered = results.filter((summary) => {
    if (typeof summary.distance !== "number") return true;
    return summary.distance < threshold;
  });
  return filtered.slice(0, RESULT_LIMIT);
}
