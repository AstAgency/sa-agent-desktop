import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput, SessionMessage } from "../../src/renderer/lib/types";
import { buildAssistantThread, buildMessage, buildProfile, buildProject, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { installAppFlowEnv } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";
import { renderWorkspaceShell } from "./support/app-flow-render";

describe("Project onboarding and project-level shell state", () => {
  const env = installAppFlowEnv();

  it("attempts project onboarding session bootstrap only once after a session creation error", async () => {
    const workspace = buildWorkspace();
    const project = buildProject({ id: "p-1", workspace_id: workspace.id, agent_key: "sa-agent", onboarding_completed: false });
    let createSessionAttempts = 0;
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles/sa-agent") ? jsonResponse({ agent_key: "sa-agent", display_name: "SA Agent", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents") ? jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa-agent", display_name: "SA Agent" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp") ? jsonResponse({ mcpServers: {} }) : null,
      (input) => input.includes("/v1/capabilities?project_id=p-1") ? jsonResponse({ items: [{ capability_key: "project_onboarding", display_name: "Project onboarding", mode: "interactive" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/documents") || input.endsWith("/v1/projects/p-1/threads") || input.endsWith("/v1/projects/p-1/commitments") ? jsonResponse({ items: [] }) : null,
      (input, init) => input.endsWith("/v1/sessions") && init?.method === "POST" ? (createSessionAttempts += 1, jsonResponse({ error: { code: "internal_error", message: "GitHub catalog request failed with 403: API rate limit exceeded", status: 500 } }, { status: 500 })) : null,
    ]);
    render(<WorkspaceShell language="ru" workspace={workspace} agents={[{ agent_key: "sa-agent", display_name: "SA Agent", is_active: true }]} selectedAgentKey="sa-agent" profile={buildProfile({ onboarding_completed: true })} project={project} projects={[project]} globalSessions={[]} globalAssistantMessages={[]} projectSessions={[]} onboarding={{ kind: "project", projectId: project.id, onComplete: vi.fn() }} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    await waitFor(() => expect(createSessionAttempts).toBe(1));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    expect(createSessionAttempts).toBe(1);
  });

  it("keeps workspace navigation available during project onboarding", async () => {
    let transcript: SessionMessage[] = [];
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents") ? jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp") ? jsonResponse({ mcpServers: {} }) : null,
      (input) => input.includes("/v1/capabilities?project_id=p-1") ? jsonResponse({ items: [{ capability_key: "project_onboarding", mode: "interactive" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/documents") || input.endsWith("/v1/projects/p-1/threads") || input.endsWith("/v1/projects/p-1/commitments") ? jsonResponse({ items: [] }) : null,
      (input, init) => input.endsWith("/v1/sessions/session-onboard/messages") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; const role = payload.role === "assistant" ? "assistant" : "user"; transcript = [...transcript, buildMessage({ id: `${role}-${transcript.length + 1}`, session_id: "session-onboard", role, content_markdown: String(payload.content_markdown ?? ""), is_hidden: role === "user" })]; return jsonResponse({ session_id: "session-onboard", items: [transcript[transcript.length - 1]] }); })() : null,
      (input) => input.endsWith("/v1/sessions/session-onboard/messages") ? jsonResponse({ items: transcript }) : null,
      (input) => input.endsWith("/v1/sessions/session-onboard") ? jsonResponse(buildSession({ id: "session-onboard", project_id: "p-1", active_capability_key: "project_onboarding", execution_id: "exec-1", execution_status: "running" })) : null,
      (input, init) => input.endsWith("/v1/llm/responses") && init?.method === "POST" ? jsonResponse({ output_text: "Продолжаем проектный онбординг." }) : null,
    ]);
    render(<WorkspaceShell language="ru" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: true })} project={buildProject({ id: "p-1", agent_key: "sa_analyst", onboarding_completed: false })} projects={[buildProject({ id: "p-1", agent_key: "sa_analyst", onboarding_completed: false })]} globalSessions={[]} globalAssistantMessages={[]} projectSessions={[buildSession({ id: "session-onboard", project_id: "p-1", active_capability_key: "project_onboarding", execution_id: "exec-1", execution_status: "running" })]} onboarding={{ kind: "project", projectId: "p-1", onComplete: vi.fn() }} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workspace-project-session-session-onboard"));
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    fireEvent.click(screen.getByTestId("assistant-trigger-ask"));
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
  });

  it("starts project onboarding after project agent binding becomes ready", async () => {
    let transcript: SessionMessage[] = [];
    let persistedBodies: Array<Record<string, unknown>> = [];
    let agentRequestCount = 0;

    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents") ? new Promise<Response>((resolve) => {
        agentRequestCount += 1;
        const payload = agentRequestCount === 1
          ? { items: [] }
          : { items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }] };
        window.setTimeout(() => resolve(jsonResponse(payload)), 40);
      }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp") ? jsonResponse({ mcpServers: {} }) : null,
      (input) => input.includes("/v1/capabilities?project_id=p-1") ? jsonResponse({ items: [{ capability_key: "project_onboarding", mode: "interactive" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/documents") || input.endsWith("/v1/projects/p-1/threads") || input.endsWith("/v1/projects/p-1/commitments") ? jsonResponse({ items: [] }) : null,
      (input, init) => input.endsWith("/v1/sessions") && init?.method === "POST" ? jsonResponse(buildSession({ id: "session-onboard", project_id: "p-1", active_capability_key: "project_onboarding", execution_id: "exec-1", execution_status: "running" })) : null,
      (input, init) => input.endsWith("/v1/sessions/session-onboard/messages") && init?.method === "POST" ? (() => {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        persistedBodies = [...persistedBodies, payload];
        const role = payload.role === "assistant" ? "assistant" : "user";
        transcript = [...transcript, buildMessage({ id: `${role}-${transcript.length + 1}`, session_id: "session-onboard", role, content_markdown: String(payload.content_markdown ?? ""), is_hidden: role === "user" })];
        return jsonResponse({ session_id: "session-onboard", items: [transcript[transcript.length - 1]] });
      })() : null,
      (input) => input.endsWith("/v1/sessions/session-onboard/messages") ? jsonResponse({ items: transcript }) : null,
      (input) => input.endsWith("/v1/sessions/session-onboard") ? jsonResponse(buildSession({ id: "session-onboard", project_id: "p-1", active_capability_key: "project_onboarding", execution_id: "exec-1", execution_status: "running" })) : null,
      (input, init) => input.endsWith("/v1/project-agents/project-agent-1/mcp") && init?.method === "POST" ? jsonResponse({ jsonrpc: "2.0", id: "tools-list-1", result: { tools: [] } }) : null,
      (input, init) => input.endsWith("/v1/llm/responses") && init?.method === "POST" ? jsonResponse({ output_text: "Продолжаем проектный онбординг." }) : null,
    ]);

    render(<WorkspaceShell language="ru" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: true })} project={buildProject({ id: "p-1", agent_key: "sa_analyst", onboarding_completed: false })} projects={[buildProject({ id: "p-1", agent_key: "sa_analyst", onboarding_completed: false })]} globalSessions={[]} globalAssistantMessages={[]} projectSessions={[]} onboarding={{ kind: "project", projectId: "p-1", onComplete: vi.fn() }} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);

    expect(await screen.findByText("Продолжаем проектный онбординг.")).toBeTruthy();
    expect(agentRequestCount).toBeGreaterThan(1);
    expect(persistedBodies.some((payload) => payload.content_markdown === "Начни онбординг на русском языке, задай первый вопрос и веди диалог до завершения.")).toBe(false);
  });

  it("renders profile details from onboarding payload and hides project context block", async () => {
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles") ? jsonResponse({ items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }] }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/mcp/sa_analyst" } } }) : null,
      (input) => input.includes("/v1/capabilities") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/me/assistant-thread") ? jsonResponse({ thread: buildAssistantThread({ id: "session-1", title: "Global chat" }), messages: [] }) : null,
    ]);
    render(<WorkspaceShell language="ru" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: true, preferred_agent_name: "Фрунзик", onboarding_payload: { profile_saved: true, user_name: "Вахтанг", agent_name: "Фрунзик", role: "системный аналитик", tech_stack: ["Python", "JavaScript", "PostgreSQL"], communication_style: "текстовое общение" } })} project={null} projects={[]} globalSessions={[buildSession({ id: "session-1", title: "Global chat" })]} globalAssistantMessages={[]} projectSessions={[]} onboarding={null} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    expect(await screen.findByText("Вахтанг")).toBeTruthy();
    expect(screen.getByText("Фрунзик")).toBeTruthy();
    expect(screen.getByText("системный аналитик")).toBeTruthy();
    expect(screen.queryByText("Контекст проекта")).toBeNull();
  });
});
