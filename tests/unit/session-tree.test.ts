import { describe, expect, it } from "vitest";
import { buildSessionTree } from "../../src/renderer/components/workspace-shell/session-tree";
import type { ProjectSummary, SessionSummary } from "../../src/renderer/lib/types";

describe("buildSessionTree", () => {
  it("derives grouped sidebar data with selection state and files-only visible modes", () => {
    const tree = buildSessionTree({
      globalSessions: [
        buildSession({ id: "g-1", project_id: null, title: "Global Chat" }),
      ],
      projects: [
        buildProject({ id: "p-1", name: "Alpha" }),
        buildProject({ id: "p-2", name: "Beta" }),
      ],
      projectSessions: [
        buildSession({ id: "s-1", project_id: "p-1", title: "Alpha Session" }),
      ],
      selectedProjectId: "p-1",
      selectedSessionId: "s-1",
    });

    expect(tree.visibleModes).toEqual(["files"]);
    expect(tree.globalGroup.sessions).toHaveLength(1);
    expect(tree.globalGroup.sessions[0]?.isSelected).toBe(false);
    expect(tree.projectGroups).toHaveLength(2);
    expect(tree.projectGroups[0]).toMatchObject({
      project: { id: "p-1", name: "Alpha" },
      isSelected: true,
    });
    expect(tree.projectGroups[0]?.sessions[0]).toMatchObject({
      session: { id: "s-1", project_id: "p-1", title: "Alpha Session" },
      isSelected: true,
    });
    expect(tree.projectGroups[1]).toMatchObject({
      project: { id: "p-2", name: "Beta" },
      isSelected: false,
      sessions: [],
    });
    expect(tree.selected).toEqual({
      projectId: "p-1",
      sessionId: "s-1",
    });
  });
});

function buildProject(overrides: Partial<ProjectSummary> & Pick<ProjectSummary, "id" | "name">): ProjectSummary {
  return {
    id: overrides.id,
    workspace_id: overrides.workspace_id ?? "ws-1",
    key: overrides.key ?? overrides.name.slice(0, 3).toUpperCase(),
    name: overrides.name,
    description: overrides.description ?? null,
    onboarding_skill_id: overrides.onboarding_skill_id ?? null,
    onboarding_payload: overrides.onboarding_payload ?? null,
    preferred_user_name: overrides.preferred_user_name ?? null,
    preferred_agent_name: overrides.preferred_agent_name ?? null,
    activity_domain: overrides.activity_domain ?? null,
    onboarding_completed: overrides.onboarding_completed ?? true,
    onboarding_completed_at: overrides.onboarding_completed_at ?? null,
    lifecycle_state: overrides.lifecycle_state ?? "active",
    created_by_user_id: overrides.created_by_user_id ?? "user-1",
    created_at: overrides.created_at ?? "2026-05-10T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-05-10T00:00:00.000Z",
  };
}

function buildSession(overrides: Partial<SessionSummary> & Pick<SessionSummary, "id" | "project_id">): SessionSummary {
  return {
    id: overrides.id,
    workspace_id: overrides.workspace_id ?? "ws-1",
    project_id: overrides.project_id,
    active_capability_key: overrides.active_capability_key ?? null,
    active_skill_id: overrides.active_skill_id ?? null,
    execution_id: overrides.execution_id ?? null,
    execution_status: overrides.execution_status ?? null,
    channel_kind: overrides.channel_kind ?? "desktop",
    session_state: overrides.session_state ?? "active",
    title: overrides.title ?? "Conversation",
    created_at: overrides.created_at ?? "2026-05-10T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-05-10T00:00:00.000Z",
  };
}
