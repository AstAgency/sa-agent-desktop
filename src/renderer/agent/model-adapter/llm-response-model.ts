import type { StopReason, TextContent, ToolCall } from "@earendil-works/pi-ai";
import { postLlmResponse } from "../../lib/api";
import type {
  LlmRequestMessage,
  LlmToolChoice,
  RuntimeToolDescriptor,
} from "../../lib/types";
import { mapLlmResponseToAssistantContent } from "./tool-call-mapping";

export async function completeWithStructuredTools(input: {
  workspaceId: string;
  projectId?: string | null;
  threadId?: string | null;
  sessionId?: string | null;
  projectAgentId?: string | null;
  messages: LlmRequestMessage[];
  tools: RuntimeToolDescriptor[];
  toolChoice?: LlmToolChoice | null;
  fetcher?: typeof fetch;
}) {
  const response = await postLlmResponse(
    {
      workspace_id: input.workspaceId,
      project_id: input.projectId ?? null,
      thread_id: input.threadId ?? null,
      session_id: input.sessionId ?? null,
      project_agent_id: input.projectAgentId ?? null,
      operation_kind: "generate_text",
      messages: input.messages,
      tools: input.tools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description ?? "",
          parameters: tool.inputSchema ?? { type: "object", additionalProperties: true },
        },
      })),
      tool_choice: input.toolChoice ?? "auto",
    },
    input.fetcher,
  );

  return {
    content: mapLlmResponseToAssistantContent(response) as Array<TextContent | ToolCall>,
    finishReason: (response.tool_calls?.length ? "toolUse" : (response.finish_reason ?? "stop")) as StopReason,
    outputText: response.output_text ?? "",
    toolCalls: response.tool_calls ?? [],
  };
}
