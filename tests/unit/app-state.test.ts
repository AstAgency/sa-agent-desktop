import { describe, expect, it } from "vitest";
import { defaultAppState, normalizeAppState } from "../../src/renderer/state/app-state";

describe("app state normalization", () => {
  it("keeps explicit runtime identity fields for workspace, project agent, session, and thread", () => {
    const state = normalizeAppState({
      ...defaultAppState,
      activeWorkspaceId: "ws-1",
      activeProjectId: "p-1",
      activeProjectAgentId: "project-agent-2",
      activeSessionId: "session-p1",
      activeThreadId: "thread-7",
    });

    expect(state.activeWorkspaceId).toBe("ws-1");
    expect(state.activeProjectId).toBe("p-1");
    expect(state.activeProjectAgentId).toBe("project-agent-2");
    expect(state.activeSessionId).toBe("session-p1");
    expect(state.activeThreadId).toBe("thread-7");
  });
});
