import type { McpToolCallResult } from "../../lib/types";

export async function callLocalTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
  if (name === "files.write_file") {
    const path = typeof args.path === "string" ? args.path : "";
    const content = typeof args.content === "string" ? args.content : "";
    const result = await window.saAgent?.files?.writeFiles?.([
      { relativePath: path, content },
    ]);

    if (!result?.ok) {
      return {
        serverName: "local",
        toolName: name,
        isError: true,
        content: [{ type: "text" as const, text: result?.error ?? "Local file write failed." }],
        structuredContent: null,
      };
    }

    return {
      serverName: "local",
      toolName: name,
      isError: false,
      content: [{ type: "text" as const, text: `Saved ${path}` }],
      structuredContent: { path, rootPath: result.rootPath ?? null },
    };
  }

  return {
    serverName: "local",
    toolName: name,
    isError: true,
    content: [{ type: "text" as const, text: `Unsupported local tool: ${name}` }],
    structuredContent: null,
  };
}
