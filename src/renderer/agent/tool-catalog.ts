import type { McpToolDescriptor, RuntimeToolDescriptor } from "../lib/types";

type LocalToolDescriptor = {
  name: string;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
};

export function buildRuntimeToolCatalog(input: {
  backendTools: McpToolDescriptor[];
  localTools: LocalToolDescriptor[];
}): RuntimeToolDescriptor[] {
  return [
    ...input.backendTools.map((tool) => ({
      name: `backend.${tool.name}`,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema ?? null,
      plane: "backend" as const,
      backendName: tool.name,
      localName: null,
    })),
    ...input.localTools.map((tool) => ({
      name: `local.${tool.name}`,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema ?? null,
      plane: "local" as const,
      backendName: null,
      localName: tool.name,
    })),
  ];
}
