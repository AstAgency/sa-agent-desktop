import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../../src/renderer/App";
import { buildAssistantThread, buildProfile, buildProject, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { installAppFlowEnv } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";
import { renderWorkspaceShell } from "./support/app-flow-render";

describe("App bootstrap state", () => {
  const env = installAppFlowEnv();

  it("creates a global session implicitly when none exists and opens the thread view", async () => {
    mockFetchRoutes(env.fetchMock, [
      (input, init) => init?.method === "POST" && input.endsWith("/v1/sessions") ? jsonResponse(buildSession({ id: "session-auto", title: "New session" })) : null,
      (input) => input.endsWith("/v1/sessions/session-auto/messages") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/agents/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/agents/sa_analyst/mcps") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/mcp/sa_analyst" } } }) : null,
      (input) => input.includes("/v1/capabilities") ? jsonResponse({ items: [] }) : null,
    ]);
    renderWorkspaceShell({ globalSessions: [], globalAssistantMessages: [] });
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    await waitFor(() => expect(env.fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/v1\/sessions$/), expect.objectContaining({ method: "POST" })));
  });

  it("restores the last selected workspace mode after app restart", async () => {
    env.setState({ language: "en", isAuthenticated: true, selectedAgentKey: "sa_analyst", workspaceMode: "files", apiBaseUrl: null, devModeEnabled: true });
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/me/bootstrap") ? jsonResponse({ viewer_profile: buildProfile({ onboarding_completed: true }), assistant_thread: buildAssistantThread(), assistant_messages: [], workspaces: [buildWorkspace()], selected_project: buildProject({ id: "p-1", agent_key: "sa_analyst" }) }) : null,
      (input) => input.endsWith("/v1/agent-profiles") ? jsonResponse({ items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }] }) : null,
      (input) => input.endsWith("/v1/workspaces") ? jsonResponse({ items: [buildWorkspace()] }) : null,
      (input) => input.endsWith("/v1/workspaces/ws-1/projects") ? jsonResponse({ items: [buildProject({ id: "p-1", agent_key: "sa_analyst" })] }) : null,
      (input) => input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents") ? jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/project-agents/project-agent-1/mcp" } } }) : null,
      (input) => input.includes("/v1/capabilities?project_id=p-1") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/documents") ? jsonResponse({ items: [] }) : null,
    ]);
    render(<App />);
    expect(await screen.findByTestId("workspace-files-view")).toBeTruthy();
  });

  it("does not force project onboarding when the project payload omits onboarding_completed", async () => {
    env.setState({ language: "ru", isAuthenticated: true, selectedAgentKey: "sa_analyst", activeProjectId: "p-1", apiBaseUrl: null, devModeEnabled: true });
    const project = { ...buildProject({ id: "p-1", agent_key: "sa_analyst" }), onboarding_completed: undefined };
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/me/bootstrap") ? jsonResponse({ viewer_profile: buildProfile({ onboarding_completed: true }), assistant_thread: buildAssistantThread(), assistant_messages: [], workspaces: [buildWorkspace()], selected_project: project }) : null,
      (input) => input.endsWith("/v1/agent-profiles") ? jsonResponse({ items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }] }) : null,
      (input) => input.endsWith("/v1/workspaces/ws-1/projects") ? jsonResponse({ items: [project] }) : null,
      (input) => input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents") ? jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/project-agents/project-agent-1/mcp" } } }) : null,
      (input) => input.includes("/v1/capabilities?project_id=p-1") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/documents") ? jsonResponse({ items: [] }) : null,
    ]);
    render(<App />);
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    expect(screen.queryByText("Для этого проекта нужны данные проектного онбординга. Отправьте их, и я сохраню каноническое состояние проекта после завершения навыка.")).toBeNull();
  });

  it("does not show a global utility error when templates are unavailable outside project mode", async () => {
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/mcp/sa_analyst" } } }) : null,
      (input) => input.includes("/v1/capabilities") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/me/assistant-thread") ? jsonResponse({ thread: buildAssistantThread({ id: "session-1", title: "Global chat" }), messages: [] }) : null,
    ]);
    renderWorkspaceShell();
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    expect(screen.queryByText("Failed to load utility data.")).toBeNull();
  });
});
