import type { Message } from "@earendil-works/pi-ai";
import type { LlmRequestMessage } from "../lib/types";

export function mapToolResultToPromptMessage(
  message: Extract<Message, { role: "toolResult" }>,
  input: {
    normalizeToolName?: (toolName: string) => string;
    omitToolNames?: Set<string>;
  } = {},
): LlmRequestMessage | null {
  const toolName = input.normalizeToolName ? input.normalizeToolName(message.toolName) : message.toolName;
  if (input.omitToolNames?.has(toolName)) {
    return null;
  }

  return {
    role: "assistant",
    content: [
      `Инструмент ${toolName} ${message.isError ? "завершился ошибкой" : "выполнен успешно"}.`,
      `Результат: ${JSON.stringify(message.details ?? null)}`,
    ].join(" "),
  };
}
