import { describe, expect, it, vi } from "vitest";
import { createMcpAgentTools } from "../../src/renderer/agent/mcp-tools";
import type { McpToolDescriptor } from "../../src/renderer/lib/types";

describe("createMcpAgentTools", () => {
  it("maps MCP tool descriptors into executable agent tools", async () => {
    const callTool = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "Saved profile_vahtang.md" }],
      structuredContent: { path: "profile_vahtang.md" },
      isError: false,
    }));

    const tools = createMcpAgentTools({
      runtimeId: "runtime-1",
      bridge: {
        callTool,
      },
      descriptors: [
        buildDescriptor({
          serverName: "filesystem",
          name: "write_file",
          description: "Write a file to disk",
        }),
      ],
    });

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "filesystem.write_file",
      label: "filesystem / write_file",
      description: "Write a file to disk",
    });

    const result = await tools[0].execute("tool-call-1", {
      path: "profile_vahtang.md",
      content: "Hello",
    });

    expect(callTool).toHaveBeenCalledWith("runtime-1", "filesystem", "write_file", {
      path: "profile_vahtang.md",
      content: "Hello",
    });
    expect(result.content).toEqual([{ type: "text", text: "Saved profile_vahtang.md" }]);
    expect(result.details).toMatchObject({
      serverName: "filesystem",
      toolName: "write_file",
      structuredContent: { path: "profile_vahtang.md" },
      isError: false,
    });
  });

  it("throws when MCP tool returns an error result", async () => {
    const tools = createMcpAgentTools({
      runtimeId: "runtime-1",
      bridge: {
        callTool: vi.fn(async () => ({
          content: [{ type: "text" as const, text: "Permission denied" }],
          isError: true,
        })),
      },
      descriptors: [
        buildDescriptor({
          serverName: "filesystem",
          name: "write_file",
        }),
      ],
    });

    await expect(
      tools[0].execute("tool-call-1", {
        path: "profile_vahtang.md",
      }),
    ).rejects.toThrow("Permission denied");
  });
});

function buildDescriptor(input: Partial<McpToolDescriptor> & Pick<McpToolDescriptor, "serverName" | "name">): McpToolDescriptor {
  return {
    serverName: input.serverName,
    name: input.name,
    title: input.title ?? input.name,
    description: input.description ?? "MCP tool",
    inputSchema: input.inputSchema ?? {
      type: "object",
      properties: {
        path: { type: "string" },
      },
    },
  };
}
