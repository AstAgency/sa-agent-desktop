import type { ChatMessage, Message } from "../lib/types.js";

export type EphemeralToolResult = {
  toolCallId: string;
  toolName: string;
  content: string;
};

/**
 * Convert the persisted transcript to the shape we send to /v1/chat/completions.
 *
 * Persisted tool messages are intentionally summarized for storage/history.
 * Full tool outputs that are only needed within the current in-flight turn are
 * appended from `ephemeralToolResults` so the model can continue reasoning
 * without forcing duplicate tool calls.
 */
export function transcriptToChatMessages(
  messages: Message[],
  ephemeralToolResults: EphemeralToolResult[] = [],
): ChatMessage[] {
  const toolNameById = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !message.tool_calls) continue;
    for (const call of message.tool_calls) {
      if (call?.id && call.function?.name) {
        toolNameById.set(call.id, call.function.name);
      }
    }
  }

  const result: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      if (message.content.length === 0) continue;
      result.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      if (message.content.trim().length === 0) continue;
      result.push({ role: "assistant", content: message.content });
      continue;
    }
    if (message.role === "tool") {
      if (message.content.trim().length === 0) continue;
      const toolName =
        (message.tool_call_id ? toolNameById.get(message.tool_call_id) : undefined) ?? "tool";
      result.push({
        role: "user",
        content: `<tool_result name="${escapeAttribute(toolName)}">\n${message.content}\n</tool_result>`,
      });
    }
  }

  for (const toolResult of ephemeralToolResults) {
    if (toolResult.content.trim().length === 0) continue;
    result.push({
      role: "user",
      content: `<tool_result name="${escapeAttribute(toolResult.toolName)}">\n${toolResult.content}\n</tool_result>`,
    });
  }

  return result;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
