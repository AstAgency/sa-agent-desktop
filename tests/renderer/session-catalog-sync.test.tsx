import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput } from "../../src/renderer/lib/types";
import { buildProfile, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { installAppFlowEnv } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";

describe("Session catalog sync", () => {
  const env = installAppFlowEnv();

  it("adds a newly created global chat to the sidebar immediately", async () => {
    mockFetchRoutes(env.fetchMock, [
      (input, init) => input.endsWith("/v1/sessions") && init?.method === "POST"
        ? jsonResponse(buildSession({ id: "session-2", title: "Чат 2", project_id: null }))
        : null,
      (input) => input.endsWith("/v1/sessions/session-1/messages") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/sessions/session-2/messages") ? jsonResponse({ items: [] }) : null,
    ]);

    render(
      <WorkspaceShell
        language="ru"
        workspace={buildWorkspace()}
        agents={[{ agent_key: "sa-agent", display_name: "SA Agent", is_active: true }]}
        selectedAgentKey="sa-agent"
        profile={buildProfile({ onboarding_completed: true })}
        project={null}
        projects={[]}
        globalSessions={[buildSession({ id: "session-1", title: "Старый чат", project_id: null })]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Новый чат" }));

    await waitFor(() => {
      expect(screen.getByText("Чат 2")).toBeTruthy();
    });
  });
});
