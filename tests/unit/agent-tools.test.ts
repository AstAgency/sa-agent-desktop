import { describe, expect, it, vi } from "vitest";
import { buildAgentTools } from "../../src/renderer/agent/agent-tools";
import type { RuntimeToolDescriptor } from "../../src/renderer/lib/types";

describe("buildAgentTools", () => {
  it("builds executable AgentTool instances for backend and local tools", async () => {
    const descriptors: RuntimeToolDescriptor[] = [
      {
        name: "backend.projects.create",
        description: "Create a project",
        inputSchema: { type: "object" },
        plane: "backend",
        backendName: "projects.create",
      },
      {
        name: "local.files.write_file",
        description: "Write a file",
        inputSchema: { type: "object" },
        plane: "local",
        localName: "files.write_file",
      },
    ];

    const executeBackendTool = vi.fn().mockResolvedValue({
      serverName: "backend",
      toolName: "projects.create",
      content: [{ type: "text", text: "Created project" }],
      structuredContent: { ok: true, id: "project-1" },
      isError: false,
    });
    const executeLocalTool = vi.fn().mockResolvedValue({
      serverName: "local",
      toolName: "files.write_file",
      content: [{ type: "text", text: "Saved README.md" }],
      structuredContent: { path: "README.md" },
      isError: false,
    });

    const tools = buildAgentTools({
      descriptors,
      executeBackendTool,
      executeLocalTool,
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "backend.projects.create",
      "local.files.write_file",
    ]);
    expect(tools[0]?.label).toBe("backend.projects.create");
    expect(tools[1]?.label).toBe("local.files.write_file");

    const backendResult = await tools[0]!.execute("call-1", { payload: { name: "Alpha" } });
    const localResult = await tools[1]!.execute("call-2", { path: "README.md", content: "# Title" });

    expect(executeBackendTool).toHaveBeenCalledWith("projects.create", { payload: { name: "Alpha" } });
    expect(executeLocalTool).toHaveBeenCalledWith("files.write_file", { path: "README.md", content: "# Title" });
    expect(backendResult).toEqual({
      content: [{ type: "text", text: "Created project" }],
      details: { ok: true, id: "project-1" },
    });
    expect(localResult).toEqual({
      content: [{ type: "text", text: "Saved README.md" }],
      details: { path: "README.md" },
    });
  });
});
