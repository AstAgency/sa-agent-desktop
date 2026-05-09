import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { WorkspaceSummary } from "../../src/renderer/lib/types";

describe("WorkspaceShell debug UX", () => {
  it("does not render a capability picker in the thread composer", async () => {
    render(
      <WorkspaceShell
        language="ru"
        workspace={buildWorkspace()}
        agents={[{ agent_key: "sa-agent", display_name: "SA Agent", is_active: true }]}
        selectedAgentKey="sa-agent"
        profile={buildProfile()}
        project={null}
        projects={[]}
        globalSessions={[]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={null}
        initialWorkspaceMode="thread"
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn(async () => undefined)}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("workspace-thread-composer")).toBeTruthy();
    expect(screen.queryByText("Выберите возможность")).toBeNull();
    expect(screen.queryByText("BRD Generator")).toBeNull();
  });
});

function buildWorkspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    id: "ws-1",
    name: "Workspace",
    slug: "workspace",
    visibility: "private",
    ...overrides,
  };
}

function buildProfile() {
  return {
    display_name: "Demo User",
    email: "demo@sa-agent.local",
    onboarding_completed: true,
    preferred_user_name: null,
    preferred_agent_name: null,
    activity_domain: null,
    onboarding_payload: null,
  };
}
