import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput, SessionMessage } from "../../src/renderer/lib/types";
import { buildMessage, buildProfile, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { installAppFlowEnv } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";

describe("User onboarding flow", () => {
  const env = installAppFlowEnv();

  it("starts user onboarding through the global session flow and finishes after structured tool execution", async () => {
    let transcript: SessionMessage[] = [];
    const llmBodies: Array<Record<string, unknown>> = [];
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/sessions?workspace_id=ws-1") ? jsonResponse({ items: [buildSession({ id: "session-onboard", active_capability_key: "user_onboarding", execution_id: "exec-1", execution_status: "running" })] }) : null,
      (input, init) => input.endsWith("/v1/llm/responses") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; llmBodies.push(payload); return jsonResponse(llmBodies.length === 1 ? { output_text: "Привет. Давай начнем знакомство: как мне к вам обращаться и как вы хотите называть меня?" } : { output_text: "Отлично, онбординг завершён." }); })() : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/me/mcp" } } }) : null,
      (input) => input.includes("/v1/capabilities") ? jsonResponse({ items: [{ capability_key: "user_onboarding", display_name: "User onboarding", mode: "interactive" }] }) : null,
      (input) => input.endsWith("/v1/sessions/session-onboard") ? jsonResponse(buildSession({ id: "session-onboard", active_capability_key: "user_onboarding", execution_id: "exec-1", execution_status: "completed" })) : null,
      (input, init) => input.endsWith("/v1/sessions/session-onboard/messages") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; const saved = buildMessage({ id: `${payload.role === "assistant" ? "assistant" : "user"}-${transcript.length + 1}`, session_id: "session-onboard", role: payload.role === "assistant" ? "assistant" : "user", content_markdown: String(payload.content_markdown ?? ""), is_hidden: payload.role !== "assistant" }); transcript = [...transcript, saved]; return jsonResponse({ session_id: "session-onboard", items: [saved] }); })() : null,
      (input) => input.endsWith("/v1/sessions/session-onboard/messages") ? jsonResponse({ items: transcript }) : null,
      (input, init) => input.endsWith("/v1/me/mcp") && init?.method === "POST" ? jsonResponse({ jsonrpc: "2.0", id: "tools-list-1", result: { tools: [{ name: "profile_complete_onboarding", description: "Complete user onboarding", inputSchema: { type: "object" } }] } }) : null,
    ]);
    render(<WorkspaceShell language="en" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: false })} project={null} projects={[]} globalSessions={[buildSession({ id: "session-onboard", active_capability_key: "user_onboarding", execution_id: "exec-1", execution_status: "running" })]} globalAssistantMessages={transcript} projectSessions={[]} onboarding={{ kind: "user", workspaceId: "ws-1", onComplete: vi.fn() }} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("workspace-global-session-session-onboard"));
    expect(await screen.findByText("Привет. Давай начнем знакомство: как мне к вам обращаться и как вы хотите называть меня?")).toBeTruthy();
    fireEvent.change(await screen.findByPlaceholderText("Reply to the agent..."), { target: { value: "Меня зовут Вахтанг, тебя я хочу называть Фрунзик. Я системный аналитик, общайся коротко и по делу." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(llmBodies.length).toBeGreaterThanOrEqual(1), { timeout: 3000 });
    expect(llmBodies[0]?.thread_id ?? llmBodies[0]?.session_id).toBe("session-onboard");
  });

  it("sends the hidden user-onboarding bootstrap prompt only once for the active global session", async () => {
    let hiddenPromptPosts = 0;
    let llmRequestCount = 0;
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/sessions?workspace_id=ws-1") ? jsonResponse({ items: [buildSession({ id: "session-onboard", title: "Assistant" })] }) : null,
      (input, init) => input.endsWith("/v1/llm/responses") && init?.method === "POST" ? (() => new Promise<Response>((resolve) => {
        llmRequestCount += 1;
        window.setTimeout(() => resolve(jsonResponse({ output_text: "Первый вопрос задан." })), 60);
      }))() : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp") ? jsonResponse({ mcpServers: {} }) : null,
      (input) => input.includes("/v1/capabilities") ? jsonResponse({ items: [{ capability_key: "user_onboarding", display_name: "User onboarding", mode: "interactive" }] }) : null,
      (input, init) => input.endsWith("/v1/sessions/session-onboard/messages") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; if (payload.role !== "assistant" && payload.content_markdown === "Начни онбординг на русском языке, задай первый вопрос и веди диалог до завершения.") hiddenPromptPosts += 1; return jsonResponse({ session_id: "session-onboard", items: [buildMessage({ id: `msg-${hiddenPromptPosts}`, session_id: "session-onboard", role: payload.role === "assistant" ? "assistant" : "user", content_markdown: String(payload.content_markdown ?? ""), is_hidden: payload.role !== "assistant" })] }); })() : null,
      (input) => input.endsWith("/v1/sessions/session-onboard/messages") ? jsonResponse({ items: [] }) : null,
      (input, init) => input.endsWith("/v1/me/mcp") && init?.method === "POST" ? jsonResponse({ jsonrpc: "2.0", id: "tools-list-1", result: { tools: [] } }) : null,
      (input) => input.endsWith("/v1/me") ? jsonResponse(buildProfile({ onboarding_completed: false })) : null,
    ]);
    render(<WorkspaceShell language="ru" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: false })} project={null} projects={[]} globalSessions={[buildSession({ id: "session-onboard", title: "Assistant" })]} globalAssistantMessages={[]} projectSessions={[]} onboarding={{ kind: "user", workspaceId: "ws-1", onComplete: vi.fn() }} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    await waitFor(() => expect(llmRequestCount).toBe(1));
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    expect(llmRequestCount).toBe(1);
    expect(hiddenPromptPosts).toBe(0);
  });

  it("keeps Files navigation available during user onboarding and no longer shows a lock popup", async () => {
    render(<WorkspaceShell language="ru" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: false })} project={null} projects={[]} globalSessions={[buildSession({ id: "session-onboard", active_capability_key: "user_onboarding", execution_id: "exec-1", execution_status: "running" })]} globalAssistantMessages={[]} projectSessions={[]} onboarding={{ kind: "user", workspaceId: "ws-1", onComplete: vi.fn() }} initialWorkspaceMode="home" onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} onWorkspaceModeChange={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("workspace-nav-files"));
    expect(await screen.findByTestId("workspace-files-view")).toBeTruthy();
    expect(screen.queryByTestId("workspace-locked-popup")).toBeNull();
  });
});
