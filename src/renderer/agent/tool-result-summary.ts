type ToolResultContentBlock = {
  type: string;
  text?: string;
};

export type ToolResultLike = {
  role?: string;
  toolName?: string;
  isError?: boolean;
  content?: ToolResultContentBlock[];
  details?: Record<string, unknown> | null;
};

const MAX_PERSISTED_TOOL_TEXT = 8_000;

export function summarizeToolResultForHistory(message: ToolResultLike): string {
  const rawText = sanitizeToolText(extractToolResultText(message));
  if (message.toolName === "read_file" && message.isError !== true) {
    const path = typeof message.details?.path === "string" ? message.details.path : "file";
    const bytes =
      typeof message.details?.bytes === "number"
        ? message.details.bytes
        : typeof message.details?.size === "number"
          ? message.details.size
          : null;
    return bytes === null
      ? `Read file ${path}. Content omitted from history.`
      : `Read file ${path} (${bytes} bytes). Content omitted from history.`;
  }
  if (rawText.length <= MAX_PERSISTED_TOOL_TEXT) return rawText;
  return `${rawText.slice(0, MAX_PERSISTED_TOOL_TEXT)}\n… (truncated)`;
}

export function extractToolResultText(message: ToolResultLike): string {
  return (message.content ?? [])
    .map((block) => (block.type === "text" ? block.text ?? "" : ""))
    .join("");
}

export function sanitizeToolText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n");
}
