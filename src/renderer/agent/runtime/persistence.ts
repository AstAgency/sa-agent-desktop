import type { Message as PiMessage } from "@earendil-works/pi-ai";
import { appendMessage } from "../../lib/api";
import type { Message } from "../../lib/types";
import { summarizeToolResultForHistory } from "../tool-result-summary";
import { extractAssistantText, extractAssistantToolCalls } from "./converters";
import type { RuntimeInternals } from "./types";

export function enqueuePersistence(rt: RuntimeInternals, work: () => Promise<void>) {
  rt.persistenceChain = rt.persistenceChain.then(work).catch((error) => {
    console.error("[runtime persist]", error);
  });
}

export async function persistAgentMessage(rt: RuntimeInternals, message: PiMessage) {
  try {
    if (message.role === "assistant") {
      const text = extractAssistantText(message);
      const toolCalls = extractAssistantToolCalls(message);
      if (text.trim().length === 0 && toolCalls.length === 0) return;
      const saved = await appendMessage(rt.input.sessionId, "assistant", text, {
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      });
      appendPersistedMessage(rt, saved);
      return;
    }
    if (message.role === "toolResult") {
      const text = summarizeToolResultForHistory(message as unknown as {
        toolName?: string;
        isError?: boolean;
        content?: Array<{ type: string; text?: string }>;
        details?: Record<string, unknown> | null;
      });
      if (text.trim().length === 0) return;
      const saved = await appendMessage(rt.input.sessionId, "tool", text, {
        tool_call_id: message.toolCallId,
      });
      appendPersistedMessage(rt, saved);
    }
  } catch (error) {
    console.error("[runtime persist]", error);
  }
}

export function appendPersistedMessage(rt: RuntimeInternals, message: Message) {
  if (rt.persistedMessageIds.has(message.id)) return;
  rt.persistedMessageIds.add(message.id);
  rt.state = {
    ...rt.state,
    messages: [...rt.state.messages, message],
  };
  rt.notify();
}
