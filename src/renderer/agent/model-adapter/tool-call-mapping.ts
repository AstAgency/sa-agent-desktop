import type { TextContent, ToolCall } from "@earendil-works/pi-ai";
import type { LlmResponseRecord } from "../../lib/types";

export function mapLlmResponseToAssistantContent(
  response: Pick<LlmResponseRecord, "output_text" | "tool_calls">,
): Array<TextContent | ToolCall> {
  if (Array.isArray(response.tool_calls) && response.tool_calls.length > 0) {
    return response.tool_calls.map((toolCall) => ({
      type: "toolCall" as const,
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments ?? {},
    }));
  }

  return [
    {
      type: "text" as const,
      text: response.output_text ?? "",
    },
  ];
}
