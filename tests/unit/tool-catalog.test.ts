import { describe, expect, it } from "vitest";
import { buildRuntimeToolCatalog } from "../../src/renderer/agent/tool-catalog";

describe("buildRuntimeToolCatalog", () => {
  it("namespaces backend and local tools into one catalog", () => {
    const catalog = buildRuntimeToolCatalog({
      backendTools: [
        {
          serverName: "user",
          name: "projects.create",
          description: "Create project",
          inputSchema: { type: "object" },
        },
      ],
      localTools: [
        {
          name: "files.write_file",
          description: "Write local file",
          inputSchema: { type: "object" },
        },
      ],
    });

    expect(catalog.map((tool) => tool.name)).toEqual([
      "backend.projects.create",
      "local.files.write_file",
    ]);
    expect(catalog[0]?.plane).toBe("backend");
    expect(catalog[1]?.plane).toBe("local");
  });
});
