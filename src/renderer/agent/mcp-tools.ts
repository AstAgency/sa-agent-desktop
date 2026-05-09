import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { McpBridge, McpToolCallResult, McpToolDescriptor } from "../lib/types";

export function createMcpAgentTools(input: {
  runtimeId: string;
  descriptors: McpToolDescriptor[];
  bridge: Pick<McpBridge, "callTool">;
}): AgentTool<any>[] {
  return input.descriptors.map((descriptor) => ({
    name: `${descriptor.serverName}.${descriptor.name}`,
    label: `${descriptor.serverName} / ${descriptor.title ?? descriptor.name}`,
    description: descriptor.description ?? `${descriptor.serverName}.${descriptor.name}`,
    parameters: toToolParametersSchema(descriptor.inputSchema),
    async execute(_toolCallId, params): Promise<AgentToolResult<McpToolCallResult>> {
      const result = await input.bridge.callTool(
        input.runtimeId,
        descriptor.serverName,
        descriptor.name,
        params as Record<string, unknown>,
      );

      if (result.isError) {
        throw new Error(readToolErrorMessage(result));
      }

      return {
        content: normalizeToolContent(result.content),
        details: {
          ...result,
          serverName: descriptor.serverName,
          toolName: descriptor.name,
        },
      };
    },
  }));
}

function toToolParametersSchema(inputSchema: Record<string, unknown> | null | undefined) {
  return (inputSchema && typeof inputSchema === "object"
    ? inputSchema
    : {
        type: "object",
        properties: {},
      }) as any;
}

function normalizeToolContent(content: McpToolCallResult["content"] | null | undefined): TextContent[] {
  if (!Array.isArray(content) || content.length === 0) {
    return [{ type: "text", text: "Tool executed successfully." }];
  }

  return content.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    if (item.type === "text" && typeof item.text === "string") {
      return [{ type: "text", text: item.text }];
    }

    return [{ type: "text", text: JSON.stringify(item) }];
  });
}

function readToolErrorMessage(result: McpToolCallResult) {
  if (Array.isArray(result.content)) {
    const textEntry = result.content.find(
      (item): item is { type: "text"; text: string } =>
        !!item &&
        typeof item === "object" &&
        item.type === "text" &&
        typeof item.text === "string" &&
        item.text.trim().length > 0,
    );

    if (textEntry) {
      return textEntry.text;
    }
  }

  return "MCP tool execution failed.";
}
