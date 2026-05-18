import type { ChatMessage, Message } from "../lib/types.js";

export type EphemeralToolResult = {
  toolCallId: string;
  toolName: string;
  content: string;
};

/**
 * Convert the persisted transcript to the shape we send to
 * /v1/chat/completions.
 *
 * The conversation is reconstructed as a proper OpenAI tool-calling exchange:
 *   - assistant turns keep their `tool_calls` (even when they carry no text),
 *   - tool outputs are emitted as `role: "tool"` messages tied to their
 *     `tool_call_id`.
 *
 * This is what fixes the "context loss" class of bugs: previously assistant
 * tool-call turns were dropped entirely and results were faked as `user`
 * messages, so the model never saw that *it* had requested a tool and kept
 * repeating work.
 *
 * Persisted tool messages are intentionally summarized for storage/history
 * (e.g. large file reads). Within the in-flight turn we still want the model
 * to see the full output, so any `ephemeralToolResults` entry overrides the
 * summarized persisted content for the matching `tool_call_id`.
 *
 * Tool results without a matching assistant `tool_call` are dropped: the
 * backend rejects a `tool` message that is not preceded by its call.
 */
export function transcriptToChatMessages(
  messages: Message[],
  ephemeralToolResults: EphemeralToolResult[] = [],
): ChatMessage[] {
  const ephemeralById = new Map<string, EphemeralToolResult>();
  for (const result of ephemeralToolResults) {
    if (result.toolCallId && result.content.trim().length > 0) {
      ephemeralById.set(result.toolCallId, result);
    }
  }

  const knownToolCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !message.tool_calls) continue;
    for (const call of message.tool_calls) {
      if (call?.id) knownToolCallIds.add(call.id);
    }
  }

  const result: ChatMessage[] = [];
  const emittedToolCallIds = new Set<string>();

  for (const message of messages) {
    if (message.role === "user") {
      if (message.content.length === 0) continue;
      result.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const toolCalls = message.tool_calls ?? undefined;
      const hasToolCalls = !!toolCalls && toolCalls.length > 0;
      const hasText = message.content.trim().length > 0;
      // A turn with neither text nor tool calls carries no information.
      if (!hasText && !hasToolCalls) continue;
      result.push({
        role: "assistant",
        content: hasText ? message.content : null,
        ...(hasToolCalls ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }
    if (message.role === "tool") {
      const callId = message.tool_call_id ?? "";
      if (!callId || !knownToolCallIds.has(callId)) continue;
      const ephemeral = ephemeralById.get(callId);
      const content = ephemeral ? ephemeral.content : message.content;
      if (content.trim().length === 0) continue;
      result.push({ role: "tool", content, tool_call_id: callId });
      emittedToolCallIds.add(callId);
    }
  }

  // Full results for the in-flight round whose persisted tool message has not
  // landed yet (persistence is async). The matching assistant tool_call is
  // already in `result`, so OpenAI ordering still holds.
  for (const toolResult of ephemeralToolResults) {
    if (!toolResult.toolCallId || emittedToolCallIds.has(toolResult.toolCallId)) {
      continue;
    }
    if (!knownToolCallIds.has(toolResult.toolCallId)) continue;
    if (toolResult.content.trim().length === 0) continue;
    result.push({
      role: "tool",
      content: toolResult.content,
      tool_call_id: toolResult.toolCallId,
    });
    emittedToolCallIds.add(toolResult.toolCallId);
  }

  return result;
}
