import { searchSummaries } from "../lib/api";
import { getBridge } from "../lib/bridge";
import type { SearchSummaryResult, Summary } from "../lib/types";
import { selectSummaries } from "./summary-selection";

export { buildRetrievalQuery, selectSummaries } from "./summary-selection";
export {
  DISTANCE_THRESHOLD,
  MIN_SEMANTIC_RESULTS,
  RECENCY_ANCHOR,
  RESULT_LIMIT,
} from "./summary-selection";

export const SEARCH_LIMIT = 10;

export type RetrievalOptions = {
  sessionId?: string;
  limit?: number;
  distanceThreshold?: number;
  /** Session summaries in chronological order; used for the recency anchor. */
  recentSummaries?: Summary[];
};

export async function retrieveRelevantSummaries(
  text: string,
  options: RetrievalOptions = {},
): Promise<SearchSummaryResult[]> {
  const query = text.trim();
  if (query.length === 0) {
    // No query to embed — still anchor on recency so context is never empty.
    return selectSummaries({ results: [], recentSummaries: options.recentSummaries });
  }
  const embedding = await getBridge().python.embedQuery(query);
  const results = await searchSummaries({
    embedding,
    limit: options.limit ?? SEARCH_LIMIT,
    session_id: options.sessionId,
  });
  return selectSummaries({
    results,
    recentSummaries: options.recentSummaries,
    distanceThreshold: options.distanceThreshold,
  });
}
