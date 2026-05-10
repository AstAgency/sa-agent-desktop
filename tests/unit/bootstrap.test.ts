import { describe, expect, it, vi } from "vitest";
import {
  decideInitialScreen,
  isExplicitlyIncompleteOnboarding,
  resolveBootstrapNextScreen,
  runBootstrapFlow,
  selectBootstrapProject,
} from "../../src/renderer/state/bootstrap";

vi.mock("../../src/renderer/lib/cache", () => ({
  getCachedResource: vi.fn(async (input: { loader: () => Promise<unknown> }) => input.loader()),
}));

vi.mock("../../src/renderer/lib/api", () => ({
  getAgentProfiles: vi.fn(async () => []),
  getAssistantThread: vi.fn(async () => {
    throw new Error("legacy assistant-thread path should not run");
  }),
  getMeBootstrap: vi.fn(async () => ({
    viewer_profile: {
      user_id: "user-1",
      email: null,
      display_name: "User",
      preferred_user_name: null,
      preferred_agent_name: null,
      activity_domain: null,
      onboarding_completed: true,
      onboarding_completed_at: null,
      created_at: "2026-05-10T00:00:00.000Z",
      updated_at: "2026-05-10T00:00:00.000Z",
    },
    workspaces: [
      {
        id: "ws-1",
        name: "Workspace",
        slug: "workspace",
        created_by_user_id: "user-1",
        created_at: "2026-05-10T00:00:00.000Z",
        updated_at: "2026-05-10T00:00:00.000Z",
      },
    ],
    user_global_session: {
      id: "global-session-1",
      workspace_id: "ws-1",
      project_id: null,
      title: "Global Session",
    },
    user_global_messages: [
      {
        id: "message-1",
        session_id: "global-session-1",
        parent_message_id: null,
        role: "assistant",
        message_kind: "chat",
        content_markdown: "Hello",
        token_estimate: 0,
        is_hidden: false,
        attachments: [],
        created_at: "2026-05-10T00:00:00.000Z",
      },
    ],
  })),
  getSessions: vi.fn(async () => []),
  getWorkspaceProjects: vi.fn(async () => []),
}));

describe("decideInitialScreen", () => {
  it("shows language setup when no language is stored", () => {
    expect(decideInitialScreen({ language: null, isAuthenticated: false })).toBe("language-setup");
  });

  it("shows auth after language is chosen but before login", () => {
    expect(decideInitialScreen({ language: "ru", isAuthenticated: false })).toBe("auth");
  });

  it("shows bootstrapping after language is chosen and auth is complete", () => {
    expect(decideInitialScreen({ language: "en", isAuthenticated: true })).toBe("bootstrapping");
  });
});

describe("resolveBootstrapNextScreen", () => {
  it("stops at user onboarding before project selection", () => {
    expect(
      resolveBootstrapNextScreen({
        profile: { onboarding_completed: false },
        workspaces: [{ id: "ws-1" }],
        projects: [],
      }),
    ).toBe("workspace-shell");
  });

  it("keeps the user in workspace shell after onboarding is complete and no projects exist", () => {
    expect(
      resolveBootstrapNextScreen({
        profile: { onboarding_completed: true },
        workspaces: [{ id: "ws-1" }],
        projects: [],
        selectedProject: null,
      }),
    ).toBe("workspace-shell");
  });

  it("stops in project onboarding when the selected project is incomplete", () => {
    expect(
      resolveBootstrapNextScreen({
        profile: { onboarding_completed: true },
        workspaces: [{ id: "ws-1" }],
        projects: [{ id: "p-1" }],
        selectedProject: { id: "p-1", onboarding_completed: false },
      }),
    ).toBe("workspace-shell");
  });

  it("shows the workspace shell after both onboarding flows complete", () => {
    expect(
      resolveBootstrapNextScreen({
        profile: { onboarding_completed: true },
        workspaces: [{ id: "ws-1" }],
        projects: [{ id: "p-1" }],
        selectedProject: { id: "p-1", onboarding_completed: true },
      }),
    ).toBe("workspace-shell");
  });
});

describe("isExplicitlyIncompleteOnboarding", () => {
  it("returns true only for an explicit false value", () => {
    expect(isExplicitlyIncompleteOnboarding(false)).toBe(true);
    expect(isExplicitlyIncompleteOnboarding(true)).toBe(false);
    expect(isExplicitlyIncompleteOnboarding(undefined)).toBe(false);
    expect(isExplicitlyIncompleteOnboarding(null)).toBe(false);
  });
});

describe("selectBootstrapProject", () => {
  const projects = [
    { id: "p-1", onboarding_completed: true },
    { id: "p-2", onboarding_completed: false },
  ];

  it("keeps a previously selected project when it still exists", () => {
    expect(selectBootstrapProject(projects, "p-2")).toEqual(projects[1]);
  });

  it("falls back to the first project when the previous selection is gone", () => {
    expect(selectBootstrapProject(projects, "missing-project")).toEqual(projects[0]);
  });
});

describe("runBootstrapFlow", () => {
  it("maps user_global_session and user_global_messages into session-first global bootstrap", async () => {
    const result = await runBootstrapFlow();

    expect(result.errorKind).toBeNull();
    expect(result.snapshot?.globalSessions).toEqual([
      expect.objectContaining({
        id: "global-session-1",
        workspace_id: "ws-1",
        project_id: null,
        title: "Global Session",
      }),
    ]);
    expect(result.snapshot?.globalAssistantMessages).toEqual([
      expect.objectContaining({
        id: "message-1",
        session_id: "global-session-1",
        content_markdown: "Hello",
      }),
    ]);
  });
});
