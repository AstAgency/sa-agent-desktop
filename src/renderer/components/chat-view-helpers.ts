import type { Message, OpenAIToolCallRecord } from "../lib/types.js";

export type ChatRuntimeTraceEvent =
  | {
      kind: "reasoning";
      id: string;
      round: number;
      text: string;
      at: number;
    }
  | {
      kind: "tool_call";
      id: string;
      round: number;
      toolCallId: string;
      name: string;
      argsJson: string;
      status: "queued" | "running" | "success" | "error";
      result?: string;
      error?: string;
      at: number;
    };

export type ChatTurn = {
  key: string;
  userMessage: Message | null;
  reasoningMessages: Message[];
  traceMessages: Message[];
  finalAssistant: Message | null;
};

export function groupTurns(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let current: ChatTurn | null = null;
  const flush = () => {
    if (current) turns.push(current);
    current = null;
  };
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      flush();
      current = {
        key: `turn-${message.id}`,
        userMessage: message,
        reasoningMessages: [],
        traceMessages: [],
        finalAssistant: null,
      };
      continue;
    }
    if (!current) {
      current = {
        key: `turn-orphan-${message.id}`,
        userMessage: null,
        reasoningMessages: [],
        traceMessages: [],
        finalAssistant: null,
      };
    }
    if (message.role === "tool") {
      current.traceMessages.push(message);
      continue;
    }
    if (message.role === "assistant") {
      const hasToolCalls = (message.tool_calls?.length ?? 0) > 0;
      if (hasToolCalls) {
        if (message.content.trim().length > 0) {
          current.reasoningMessages.push({ ...message, tool_calls: undefined });
        }
        current.traceMessages.push(message);
      } else {
        if (current.finalAssistant !== null) {
          current.traceMessages.push(current.finalAssistant);
        }
        current.finalAssistant = message;
      }
    }
  }
  flush();
  return turns;
}

export function buildHistoricalTrace(traceMessages: Message[]): ChatRuntimeTraceEvent[] {
  const events: ChatRuntimeTraceEvent[] = [];
  const resultsByCallId = new Map<string, { text: string; isError: boolean }>();
  for (const message of traceMessages) {
    if (message.role !== "tool") continue;
    const callId = message.tool_call_id ?? "";
    if (!callId) continue;
    resultsByCallId.set(callId, {
      text: message.content,
      isError: false,
    });
  }
  let counter = 0;
  for (const message of traceMessages) {
    if (message.role !== "assistant") continue;
    const toolCalls: OpenAIToolCallRecord[] = message.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      counter += 1;
      const result = resultsByCallId.get(toolCall.id);
      events.push({
        kind: "tool_call",
        id: `hist-tool-${toolCall.id}`,
        round: counter,
        toolCallId: toolCall.id,
        name: toolCall.function?.name ?? "",
        argsJson: prettifyJson(toolCall.function?.arguments ?? ""),
        status: result ? (result.isError ? "error" : "success") : "success",
        result: result ? result.text : undefined,
        at: Date.parse(message.created_at) || 0,
      });
    }
  }
  return events;
}

export function prettifyJson(value: string): string {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function isAtBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = 64,
): boolean {
  if (scrollHeight <= clientHeight) return true;
  return Math.abs(scrollHeight - scrollTop - clientHeight) < threshold;
}

export type ComposerAttachment = {
  name: string;
  size: number;
  mime: string;
  kind: "text" | "binary";
  content: string;
};

export const MAX_ATTACHMENT_SIZE_BYTES = 1 * 1024 * 1024;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 4 * 1024 * 1024;
export const MAX_COMBINED_MESSAGE_BYTES = 256 * 1024;

export function formatAttachmentsBlock(attachments: ComposerAttachment[]): string {
  if (attachments.length === 0) return "";
  const sections = attachments.map((attachment) => {
    const label =
      attachment.kind === "text" ? attachment.mime || "text/plain" : "binary base64";
    return `=== ${attachment.name} (${attachment.size} bytes, ${label}) ===\n${attachment.content}`;
  });
  return `<attachments>\n${sections.join("\n")}\n</attachments>`;
}

export function buildComposerMessage(
  text: string,
  attachments: ComposerAttachment[],
): string {
  const trimmed = text.trim();
  const attachmentBlock = formatAttachmentsBlock(attachments);
  if (!attachmentBlock) return trimmed;
  return trimmed.length > 0 ? `${attachmentBlock}\n\n${trimmed}` : attachmentBlock;
}

export function validateAttachmentSizes(attachments: ComposerAttachment[]): string | null {
  const total = attachments.reduce((sum, attachment) => sum + attachment.size, 0);
  const oversized = attachments.find((attachment) => attachment.size > MAX_ATTACHMENT_SIZE_BYTES);
  if (oversized) {
    return `${oversized.name} exceeds ${MAX_ATTACHMENT_SIZE_BYTES} bytes`;
  }
  if (total > MAX_ATTACHMENTS_TOTAL_BYTES) {
    return `Attachments exceed ${MAX_ATTACHMENTS_TOTAL_BYTES} bytes`;
  }
  const combinedBytes = new TextEncoder().encode(buildComposerMessage("", attachments)).length;
  if (combinedBytes > MAX_COMBINED_MESSAGE_BYTES) {
    return `Attachments exceed ${MAX_COMBINED_MESSAGE_BYTES} bytes once serialized`;
  }
  return null;
}
