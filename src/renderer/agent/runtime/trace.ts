import type { Message as PiMessage } from "@earendil-works/pi-ai";
import {
  extractToolResultText,
  summarizeToolResultForHistory,
} from "../tool-result-summary";
import { getToolPolicyWarnings } from "./tool-policy";
import { enqueuePersistence, persistAgentMessage } from "./persistence";
import type { ActiveRound, RuntimeInternals, RuntimeTraceEvent, ToolCallStatus } from "./types";

let traceEventCounter = 0;

export function nextTraceEventId(prefix: string): string {
  traceEventCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${traceEventCounter}`;
}

export function appendTraceEvent(rt: RuntimeInternals, event: RuntimeTraceEvent): void {
  rt.state = { ...rt.state, trace: [...rt.state.trace, event] };
}

export function updateTraceEvent(
  rt: RuntimeInternals,
  id: string,
  patch: Partial<RuntimeTraceEvent>,
): void {
  const trace = rt.state.trace.map((event) =>
    event.id === id ? ({ ...event, ...patch } as RuntimeTraceEvent) : event,
  );
  rt.state = { ...rt.state, trace };
}

export function updateToolCallStatus(
  rt: RuntimeInternals,
  toolCallId: string,
  status: ToolCallStatus,
  text: string,
  isError: boolean,
) {
  if (!toolCallId) return;
  let mutated = false;
  const trace = rt.state.trace.map((event) => {
    if (event.kind !== "tool_call" || event.toolCallId !== toolCallId) return event;
    mutated = true;
    return {
      ...event,
      status,
      result: isError ? undefined : text,
      error: isError ? text : undefined,
    };
  });
  if (!mutated) return;
  rt.state = { ...rt.state, trace };
  rt.notify();
}

export function applyToolCallPolicyWarnings(
  rt: RuntimeInternals,
  traceEventId: string,
  name: string,
  args: Record<string, unknown> | null | undefined,
) {
  const warnings = getToolPolicyWarnings(rt.state.trace, { name, args }, traceEventId);
  if (warnings.length === 0) return;
  updateTraceEvent(rt, traceEventId, { advisoryWarnings: warnings });
  rt.notify();
}

export function promoteToReasoning(rt: RuntimeInternals, round: ActiveRound): void {
  if (round.reasoningEventId) return;
  if (round.textBuffer.length === 0) {
    round.hasToolCalls = true;
    return;
  }
  const id = nextTraceEventId("reasoning");
  round.reasoningEventId = id;
  round.hasToolCalls = true;
  appendTraceEvent(rt, {
    kind: "reasoning",
    id,
    round: round.index,
    text: round.textBuffer,
    at: Date.now(),
  });
  // This round used a tool, so its text was never the final answer. Clear the
  // optimistic live bubble so the same text is not shown twice (once as a
  // streaming answer and once as a reasoning entry) — the duplicated/jumping
  // text users reported.
  rt.state = { ...rt.state, streamingFinalText: "" };
}

export function handleAgentEvent(
  rt: RuntimeInternals,
  event: { type: string } & Record<string, unknown>,
) {
  if (event.type !== "message_end") return;
  const message = event.message as PiMessage | undefined;
  if (!message) return;
  if (message.role === "user") return;
  if (message.role === "toolResult") {
    const isError = (message as { isError?: boolean }).isError === true;
    const rawText = extractToolResultText(message as unknown as {
      content?: Array<{ type: string; text?: string }>;
    });
    if (rawText.trim().length > 0) {
      rt.currentTurnToolResults.push({
        toolCallId: (message as { toolCallId?: string }).toolCallId ?? "",
        toolName: (message as { toolName?: string }).toolName ?? "tool",
        content: rawText,
      });
    }
    const text = summarizeToolResultForHistory(message as unknown as {
      toolName?: string;
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
      details?: Record<string, unknown> | null;
    });
    updateToolCallStatus(
      rt,
      (message as { toolCallId?: string }).toolCallId ?? "",
      isError ? "error" : "success",
      text,
      isError,
    );
  }
  enqueuePersistence(rt, () => persistAgentMessage(rt, message));
}
