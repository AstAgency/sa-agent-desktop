import { describe, expect, it } from "vitest";
import { resolveSharedConnectionKey } from "../../electron/mcp-manager";

describe("resolveSharedConnectionKey", () => {
  it("returns null for http MCP servers", () => {
    expect(
      resolveSharedConnectionKey("backend", {
        transport: "http",
        url: "http://127.0.0.1:3000/v1/me/mcp",
      }),
    ).toBeNull();
  });

  it("returns a stable key for equivalent command MCP servers", () => {
    const first = resolveSharedConnectionKey("pdf", {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-pdf", "--port", "3001"],
      env: {
        NODE_ENV: "development",
      },
    });

    const second = resolveSharedConnectionKey("pdf", {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-pdf", "--port", "3001"],
      env: {
        NODE_ENV: "development",
      },
    });

    expect(first).toBe(second);
    expect(first).toContain("@modelcontextprotocol/server-pdf");
  });

  it("distinguishes different command MCP configs", () => {
    const pdf3001 = resolveSharedConnectionKey("pdf", {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-pdf", "--port", "3001"],
    });

    const pdf3002 = resolveSharedConnectionKey("pdf", {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-pdf", "--port", "3002"],
    });

    expect(pdf3001).not.toBe(pdf3002);
  });
});
