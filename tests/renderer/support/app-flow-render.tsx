import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { WorkspaceShell } from "../../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput } from "../../../src/renderer/lib/types";
import { buildProfile, buildSession, buildWorkspace } from "./app-flow-fixtures";

export function renderWorkspaceShell(overrides: Partial<ComponentProps<typeof WorkspaceShell>> = {}) {
  const workspace = overrides.workspace ?? buildWorkspace();
  const globalSession = overrides.globalSessions?.[0] ?? buildSession({ id: "session-1", title: "Global chat" });

  return render(
    <WorkspaceShell
      language="en"
      workspace={workspace}
      agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
      selectedAgentKey="sa_analyst"
      profile={buildProfile({ onboarding_completed: true })}
      project={null}
      projects={[]}
      globalSessions={[globalSession]}
      globalAssistantMessages={overrides.globalAssistantMessages ?? []}
      projectSessions={[]}
      onboarding={null}
      onSelectAgent={vi.fn()}
      onSelectProject={vi.fn()}
      onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
      onOpenSettings={vi.fn()}
      {...overrides}
    />,
  );
}
