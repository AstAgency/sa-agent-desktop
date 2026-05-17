import type {
  Api,
  AssistantMessage,
  Message as PiMessage,
  TextContent,
  ToolCall as PiToolCall,
} from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";
import type { Message, OpenAIToolCallRecord } from "../../lib/types";
import { BACKEND_MODEL } from "./constants";

export function buildPartialAssistantMessage(model: Model<Api>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

export function buildErrorAssistantMessage(
  model: Model<Api>,
  errorMessage: string,
  stopReason: "error" | "aborted",
): AssistantMessage {
  return {
    ...buildPartialAssistantMessage(model),
    stopReason,
    errorMessage,
  };
}

export function hydrateAgentMessages(messages: Message[]): PiMessage[] {
  const result: PiMessage[] = [];
  for (const message of messages) {
    const timestamp = Date.parse(message.created_at) || Date.now();
    if (message.role === "user") {
      result.push({ role: "user", content: message.content, timestamp });
      continue;
    }
    if (message.role === "assistant") {
      const content: AssistantMessage["content"] = [];
      if (message.content.length > 0) {
        content.push({ type: "text", text: message.content });
      }
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          content.push({
            type: "toolCall",
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: parseToolArguments(toolCall.function.arguments),
          });
        }
      }
      result.push({
        role: "assistant",
        content,
        api: BACKEND_MODEL.api,
        provider: BACKEND_MODEL.provider,
        model: BACKEND_MODEL.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp,
      });
      continue;
    }
    if (message.role === "tool") {
      result.push({
        role: "toolResult",
        toolCallId: message.tool_call_id ?? "",
        toolName: "",
        content: [{ type: "text", text: message.content }],
        isError: false,
        timestamp,
      });
    }
  }
  return result;
}

export function extractAssistantText(message: PiMessage): string {
  if (message.role !== "assistant") return "";
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function extractAssistantToolCalls(message: PiMessage): OpenAIToolCallRecord[] {
  if (message.role !== "assistant") return [];
  return message.content
    .filter((block): block is PiToolCall => block.type === "toolCall")
    .map((block) => ({
      id: block.id,
      type: "function" as const,
      function: { name: block.name, arguments: JSON.stringify(block.arguments ?? {}) },
    }));
}

export function parseToolArguments(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
