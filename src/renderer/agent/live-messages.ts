import type { Message, Summary } from "../lib/types.js";

/**
 * Returns messages that are not covered by any summary. Per the contract,
 * coverage is determined by `to_message_id`: we find the latest message that
 * appears as `to_message_id` on any summary and treat every message after it
 * as "live".
 */
export function getLiveMessages(messages: Message[], summaries: Summary[]): Message[] {
  if (messages.length === 0) return [];
  if (summaries.length === 0) return messages;
  const coveredIds = new Set<string>();
  for (const summary of summaries) {
    if (summary.to_message_id) coveredIds.add(summary.to_message_id);
  }
  let lastCoveredIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (coveredIds.has(messages[i]!.id)) {
      lastCoveredIndex = i;
      break;
    }
  }
  return lastCoveredIndex === -1 ? messages : messages.slice(lastCoveredIndex + 1);
}
