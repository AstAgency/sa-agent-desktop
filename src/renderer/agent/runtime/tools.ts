import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { OpenAIToolDefinition } from "../../lib/types";

export function toolsToOpenAIDefinitions(tools: AgentTool[]): OpenAIToolDefinition[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as Record<string, unknown>,
    },
  }));
}
