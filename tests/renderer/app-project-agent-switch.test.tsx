import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput, SessionMessage } from "../../src/renderer/lib/types";
import { buildMessage, buildProfile, buildProject, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { installAppFlowEnv } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";

describe("Project agent switching", () => {
  const env = installAppFlowEnv();

  it("switches the active project agent explicitly and rebuilds the project runtime bindings", async () => {
    const mcpBodies: Array<Record<string, unknown>> = [];
    const llmBodies: Array<Record<string, unknown>> = [];
    let transcript: SessionMessage[] = [];
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/research_agent") ? jsonResponse({ agent_key: "research_agent", display_name: "Research Agent", is_active: true }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents") ? jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }, { id: "project-agent-2", agent_key: "research_agent", display_name: "Research Agent" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/project-agents/project-agent-1/mcp" } } }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents/project-agent-2/mcp") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/project-agents/project-agent-2/mcp" } } }) : null,
      (input) => input.includes("/v1/capabilities?project_id=p-1") || input.endsWith("/v1/projects/p-1/documents") || input.endsWith("/v1/projects/p-1/threads") || input.endsWith("/v1/projects/p-1/commitments") ? jsonResponse({ items: [] }) : null,
      (input, init) => input.endsWith("/v1/sessions/session-p1/messages") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; const role = payload.role === "assistant" ? "assistant" : "user"; transcript = [...transcript, buildMessage({ id: `${role}-${transcript.length + 1}`, session_id: "session-p1", role, content_markdown: String(payload.content_markdown ?? "") })]; return jsonResponse({ session_id: "session-p1", items: [transcript[transcript.length - 1]] }); })() : null,
      (input) => input.endsWith("/v1/sessions/session-p1/messages") ? jsonResponse({ items: transcript }) : null,
      (input) => input.endsWith("/v1/sessions/session-p1") ? jsonResponse(buildSession({ id: "session-p1", project_id: "p-1" })) : null,
      (input, init) => input.endsWith("/v1/project-agents/project-agent-2/mcp") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; mcpBodies.push(payload); return jsonResponse(payload.method === "tools/list" ? { jsonrpc: "2.0", id: "tools-list-1", result: { tools: [{ name: "project.context.upsert", description: "Update project context", inputSchema: { type: "object" } }] } } : { jsonrpc: "2.0", id: "tool-call-1", result: { content: [{ type: "text", text: "ok" }], isError: false } }); })() : null,
      (input, init) => input.endsWith("/v1/llm/responses") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; llmBodies.push(payload); return jsonResponse(llmBodies.length === 1 ? { output_text: null, tool_calls: [{ id: "call-2", type: "function", name: "backend.project.context.upsert", arguments: { key: "thread-note-2", title: "Research context", content_markdown: "Зафиксируй исследовательский контекст проекта." } }] } : { output_text: "Исследовательский агент обновил контекст проекта." }); })() : null,
    ]);
    render(<WorkspaceShell language="ru" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }, { agent_key: "research_agent", display_name: "Research Agent", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: true })} project={buildProject({ id: "p-1", agent_key: "sa_analyst" })} projects={[buildProject({ id: "p-1", agent_key: "sa_analyst" })]} globalSessions={[]} globalAssistantMessages={[]} projectSessions={[buildSession({ id: "session-p1", project_id: "p-1" })]} onboarding={null} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    fireEvent.change(await screen.findByTestId("workspace-project-agent-select"), { target: { value: "project-agent-2" } });
    fireEvent.click(screen.getByTestId("workspace-project-session-session-p1"));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Зафиксируй исследовательский контекст проекта." } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Исследовательский агент обновил контекст проекта.")).toBeTruthy();
    expect(llmBodies.some((payload) => payload.project_agent_id === "project-agent-2")).toBe(true);
    expect(llmBodies[0]?.tool_choice).toBe("auto");
    expect(mcpBodies.some((payload) => payload.method === "tools/call")).toBe(true);
  });
});
