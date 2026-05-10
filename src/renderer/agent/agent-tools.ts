import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type TSchema } from "@earendil-works/pi-ai";
import type { McpToolCallContentItem, McpToolCallResult, RuntimeToolDescriptor } from "../lib/types";

type BuildAgentToolsInput = {
  descriptors: RuntimeToolDescriptor[];
  executeBackendTool: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>;
  executeLocalTool: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>;
};

export function buildAgentTools(input: BuildAgentToolsInput): AgentTool[] {
  return input.descriptors.map((descriptor) => ({
    name: descriptor.name,
    label: descriptor.name,
    description: descriptor.description ?? "",
    parameters: toToolParameters(descriptor.inputSchema),
    execute: async (_toolCallId, args) => {
      const safeArgs = typeof args === "object" && args !== null ? args as Record<string, unknown> : {};
      const result = await executeDescriptor(descriptor, safeArgs, input);

      if (result.isError) {
        throw new Error(readToolErrorMessage(result));
      }

      return {
        content: mapToolContent(result.content),
        details: result.structuredContent ?? null,
      };
    },
  }));
}

function executeDescriptor(
  descriptor: RuntimeToolDescriptor,
  args: Record<string, unknown>,
  input: BuildAgentToolsInput,
) {
  return descriptor.plane === "backend"
    ? input.executeBackendTool(descriptor.backendName ?? descriptor.name, args)
    : input.executeLocalTool(descriptor.localName ?? descriptor.name, args);
}

function toToolParameters(inputSchema?: Record<string, unknown> | null): TSchema {
  return (inputSchema as TSchema | null | undefined) ?? Type.Object({}, { additionalProperties: true });
}

function mapToolContent(content: McpToolCallResult["content"]) {
  return (content ?? []).flatMap((item) => {
    if (item.type === "text" && typeof item.text === "string") {
      return [{ type: "text" as const, text: item.text }];
    }

    return [];
  });
}

function readToolErrorMessage(result: McpToolCallResult) {
  const firstText = (result.content ?? []).find(
    (item: McpToolCallContentItem): item is Extract<McpToolCallContentItem, { type: "text" }> =>
      item.type === "text" && typeof item.text === "string",
  );

  return firstText?.text ?? `Tool ${result.toolName} failed.`;
}
