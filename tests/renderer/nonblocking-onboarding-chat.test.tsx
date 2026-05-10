import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput } from "../../src/renderer/lib/types";
import { buildProfile, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { installAppFlowEnv } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";

describe("Non-blocking onboarding chat", () => {
  const env = installAppFlowEnv();

  it("keeps the global onboarding composer interactive while onboarding is incomplete", async () => {
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/sessions/session-1/messages") ? jsonResponse({ items: [] }) : null,
    ]);

    render(
      <WorkspaceShell
        language="ru"
        workspace={buildWorkspace()}
        agents={[{ agent_key: "sa-agent", display_name: "SA Agent", is_active: true }]}
        selectedAgentKey="sa-agent"
        profile={buildProfile({ onboarding_completed: false })}
        project={null}
        projects={[]}
        globalSessions={[buildSession({ id: "session-1", title: "Онбординг" })]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={{ kind: "user", workspaceId: "ws-1", onComplete: vi.fn() }}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText("Ответьте агенту...");
    expect((input as HTMLTextAreaElement).disabled).toBe(false);
    expect(screen.queryByText("Запускается сессия онбординга. Дождитесь первого сообщения агента.")).toBeNull();
  });
});
