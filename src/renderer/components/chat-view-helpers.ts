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

export function getVisibleTurns(turns: ChatTurn[], sending: boolean): ChatTurn[] {
  if (!sending || turns.length === 0) return turns;
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn) return turns;
  const isInFlightTurn =
    lastTurn.finalAssistant === null &&
    (lastTurn.userMessage !== null ||
      lastTurn.reasoningMessages.length > 0 ||
      lastTurn.traceMessages.length > 0);
  return isInFlightTurn ? turns.slice(0, -1) : turns;
}

export function groupTurns(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let current: ChatTurn | null = null;
  const flush = () => {
    if (current) {
      if (current.finalAssistant === null) {
        // The turn ended without a plain closing answer — the agent stopped
        // right after a tool-call round, or only produced tool-call
        // narration. Surface its last words as the final answer so the
        // dialog is never silently empty ("pipeline завершается, диалог
        // пустой").
        for (let i = current.reasoningMessages.length - 1; i >= 0; i -= 1) {
          const candidate = current.reasoningMessages[i]!;
          if (candidate.content.trim().length > 0) {
            current.finalAssistant = candidate;
            current.reasoningMessages.splice(i, 1);
            break;
          }
        }
      }
      turns.push(current);
    }
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
          // A later plain assistant message supersedes this one as the
          // answer, but its text must stay visible — keep it in the main
          // flow as reasoning instead of burying it in the trace (where
          // assistant text is never rendered).
          current.reasoningMessages.push(current.finalAssistant);
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
  content?: string;
  workspacePath?: string;
};

export type PersistedAttachment = {
  name: string;
  size: number;
  mime: string;
  kind: "text" | "binary";
  workspacePath: string;
};

export const MAX_ATTACHMENT_SIZE_BYTES = 1 * 1024 * 1024;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 4 * 1024 * 1024;
export const MAX_COMBINED_MESSAGE_BYTES = 256 * 1024;
export const DEFAULT_ATTACHMENT_ALLOWED_EXTENSIONS =
  ".txt,.md,.markdown,.json,.yaml,.yml,.xml,.csv,.log,.ini,.conf,.toml,.pdf,.doc,.docx,.rtf,.odt,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif,.svg";

export function parseAllowedAttachmentExtensions(raw: string | undefined | null): Set<string> {
  const source = raw && raw.trim().length > 0 ? raw : DEFAULT_ATTACHMENT_ALLOWED_EXTENSIONS;
  return new Set(
    source
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0)
      .map((part) => (part.startsWith(".") ? part : `.${part}`)),
  );
}

export function validateAllowedAttachmentExtension(
  fileName: string,
  allowedExtensions: ReadonlySet<string>,
): string | null {
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
  if (extension.length === 0 || !allowedExtensions.has(extension)) {
    return `${fileName} has unsupported file type`;
  }
  return null;
}

export function formatAttachmentsBlock(attachments: PersistedAttachment[]): string {
  if (attachments.length === 0) return "";
  const sections = attachments.map((attachment) => {
    const label = attachment.mime || (attachment.kind === "text" ? "text/plain" : "application/octet-stream");
    return `=== ${attachment.name} (${attachment.size} bytes, ${label}) :: workspace_path="${escapeAttachmentValue(
      attachment.workspacePath,
    )}" ===`;
  });
  return `<attachments>\n${sections.join("\n")}\n</attachments>`;
}

export function buildComposerMessage(
  text: string,
  attachments: PersistedAttachment[],
): string {
  const trimmed = text.trim();
  const attachmentBlock = formatAttachmentsBlock(attachments);
  if (!attachmentBlock) return trimmed;
  const userMessageBlock = `<user_message>\n${trimmed}\n</user_message>`;
  return [
    attachmentBlock,
    "<attachment_instructions>",
    "Use read_file on each workspace_path listed in <attachments> before answering.",
    "</attachment_instructions>",
    userMessageBlock,
  ].join("\n");
}

export function validateAttachmentSizes(attachments: ComposerAttachment[]): string | null {
  const transientAttachments = attachments.filter((attachment) => !attachment.workspacePath);
  const total = transientAttachments.reduce((sum, attachment) => sum + attachment.size, 0);
  const oversized = transientAttachments.find((attachment) => attachment.size > MAX_ATTACHMENT_SIZE_BYTES);
  if (oversized) {
    return `${oversized.name} exceeds ${MAX_ATTACHMENT_SIZE_BYTES} bytes`;
  }
  if (total > MAX_ATTACHMENTS_TOTAL_BYTES) {
    return `Attachments exceed ${MAX_ATTACHMENTS_TOTAL_BYTES} bytes`;
  }
  const combinedBytes = new TextEncoder().encode(
    attachments.map((attachment) => `${attachment.name}:${attachment.size}:${attachment.mime}`).join("\n"),
  ).length;
  if (combinedBytes > MAX_COMBINED_MESSAGE_BYTES) {
    return `Attachments exceed ${MAX_COMBINED_MESSAGE_BYTES} bytes once serialized`;
  }
  return null;
}

export function nextAvailableAttachmentPath(
  fileName: string,
  existingPaths: ReadonlySet<string>,
): string {
  if (!existingPaths.has(fileName)) return fileName;
  const dot = fileName.lastIndexOf(".");
  const stem = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot >= 0 ? fileName.slice(dot) : "";
  let index = 2;
  while (true) {
    const candidate = `${stem} (${index})${ext}`;
    if (!existingPaths.has(candidate)) return candidate;
    index += 1;
  }
}

export function extractRenderedUserMessageParts(content: string): {
  attachments: PersistedAttachment[];
  text: string;
} {
  const attachments = parsePersistedAttachments(content);
  const userMessageMatch = content.match(/<user_message>\n?([\s\S]*?)\n?<\/user_message>/);
  const rawText = userMessageMatch ? userMessageMatch[1] ?? "" : content;
  return {
    attachments,
    text: rawText.trim(),
  };
}

function parsePersistedAttachments(content: string): PersistedAttachment[] {
  const blockMatch = content.match(/<attachments>\n?([\s\S]*?)\n?<\/attachments>/);
  if (!blockMatch) return [];
  const lines = (blockMatch[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const attachments: PersistedAttachment[] = [];
  for (const line of lines) {
    const match = line.match(
      /^=== (.+) \((\d+) bytes, (.+)\) :: workspace_path="(.+)" ===$/,
    );
    if (!match) continue;
    attachments.push({
      name: match[1] ?? "",
      size: Number(match[2] ?? "0"),
      mime: match[3] ?? "application/octet-stream",
      kind: (match[3] ?? "").startsWith("text/") ? "text" : "binary",
      workspacePath: unescapeAttachmentValue(match[4] ?? ""),
    });
  }
  return attachments;
}

function escapeAttachmentValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescapeAttachmentValue(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

export function validateAttachmentTypes(
  attachments: ComposerAttachment[],
  allowedExtensions: ReadonlySet<string>,
): string | null {
  for (const attachment of attachments) {
    const error = validateAllowedAttachmentExtension(attachment.name, allowedExtensions);
    if (error) return error;
  }
  return null;
}

export function insertTextAtSelection(
  value: string,
  insertedText: string,
  selectionStart: number,
  selectionEnd: number,
): { nextValue: string; nextCaret: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const nextValue = `${value.slice(0, start)}${insertedText}${value.slice(end)}`;
  return {
    nextValue,
    nextCaret: start + insertedText.length,
  };
}
