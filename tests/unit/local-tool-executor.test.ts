import { describe, expect, it, vi } from "vitest";
import { callLocalTool } from "../../src/renderer/agent/executors/local-tool-executor";

describe("callLocalTool", () => {
  it("writes a single file through the Electron file bridge", async () => {
    const writeFiles = vi.fn().mockResolvedValue({ ok: true, rootPath: "/tmp/agent-files" });

    window.saAgent = {
      ...window.saAgent,
      files: {
        writeFiles,
        openFolder: vi.fn(),
      },
    };

    const result = await callLocalTool("files.write_file", {
      path: "README.md",
      content: "# Title",
    });

    expect(writeFiles).toHaveBeenCalledWith([
      { relativePath: "README.md", content: "# Title" },
    ]);
    expect(result.isError).toBe(false);
  });
});
