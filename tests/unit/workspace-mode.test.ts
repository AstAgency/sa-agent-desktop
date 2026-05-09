import { describe, expect, it } from "vitest";
import { resolveWorkspaceMode } from "../../src/renderer/lib/workspace-mode";

describe("resolveWorkspaceMode", () => {
  it("falls back to home for invalid persisted mode", () => {
    expect(resolveWorkspaceMode("broken-mode")).toBe("home");
  });
});
