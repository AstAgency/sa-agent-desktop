import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput, SessionMessage } from "../../src/renderer/lib/types";
import { buildMessage, buildProfile, buildProject, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { installAppFlowEnv } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";

describe("Project interactive runtime", () => {
  const env = installAppFlowEnv();

  it("persists project thread messages locally and uses project-agent MCP for interactive work", async () => {
    const persistedBodies: Array<Record<string, unknown>> = [];
    const mcpBodies: Array<Record<string, unknown>> = [];
    const llmBodies: Array<Record<string, unknown>> = [];
    let transcript: SessionMessage[] = [];
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents") ? jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp") ? jsonResponse({ mcpServers: {} }) : null,
      (input) => input.includes("/v1/capabilities?project_id=p-1") || input.endsWith("/v1/projects/p-1/documents") || input.endsWith("/v1/projects/p-1/threads") || input.endsWith("/v1/projects/p-1/commitments") ? jsonResponse({ items: [] }) : null,
      (input, init) => input.endsWith("/v1/sessions/session-p1/messages") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; persistedBodies.push(payload); const role = payload.role === "assistant" ? "assistant" : "user"; transcript = [...transcript, buildMessage({ id: `${role}-${persistedBodies.length}`, session_id: "session-p1", role, content_markdown: String(payload.content_markdown ?? "") })]; return jsonResponse({ session_id: "session-p1", items: [transcript[transcript.length - 1]] }); })() : null,
      (input) => input.endsWith("/v1/sessions/session-p1/messages") ? jsonResponse({ items: transcript }) : null,
      (input) => input.endsWith("/v1/sessions/session-p1") ? jsonResponse(buildSession({ id: "session-p1", project_id: "p-1" })) : null,
      (input, init) => input.endsWith("/v1/project-agents/project-agent-1/mcp") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; mcpBodies.push(payload); return jsonResponse(payload.method === "tools/list" ? { jsonrpc: "2.0", id: "tools-list-1", result: { tools: [{ name: "project.context.upsert", description: "Update project context", inputSchema: { type: "object" } }] } } : { jsonrpc: "2.0", id: "tool-call-1", result: { content: [{ type: "text", text: "ok" }], isError: false } }); })() : null,
      (input, init) => input.endsWith("/v1/llm/responses") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; llmBodies.push(payload); return jsonResponse(llmBodies.length === 1 ? { output_text: null, tool_calls: [{ id: "call-1", type: "function", name: "backend.project.context.upsert", arguments: { key: "thread-note-1", title: "Thread context", content_markdown: "Сохрани контекст проекта: мы строим платформу для аналитиков." } }] } : { output_text: "Контекст проекта обновлён через MCP. Можете продолжать." }); })() : null,
    ]);
    render(<WorkspaceShell language="ru" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: true })} project={buildProject({ id: "p-1", agent_key: "sa_analyst" })} projects={[buildProject({ id: "p-1", agent_key: "sa_analyst" })]} globalSessions={[]} globalAssistantMessages={[]} projectSessions={[buildSession({ id: "session-p1", project_id: "p-1" })]} onboarding={null} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("workspace-project-session-session-p1"));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Сохрани контекст проекта: мы строим платформу для аналитиков." } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Контекст проекта обновлён через MCP. Можете продолжать.")).toBeTruthy();
    await waitFor(() => expect(persistedBodies).toHaveLength(2));
    expect(llmBodies).toHaveLength(2);
    expect(llmBodies[0]?.tool_choice).toBe("auto");
    expect(mcpBodies.some((payload) => payload.method === "tools/call")).toBe(true);
  });

  it("does not show raw tool-call payloads in project chat", async () => {
    const persistedBodies: Array<Record<string, unknown>> = [];
    let transcript: SessionMessage[] = [];
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents") ? jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }] }) : null,
      (input) => input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp") ? jsonResponse({ mcpServers: {} }) : null,
      (input) => input.includes("/v1/capabilities?project_id=p-1") || input.endsWith("/v1/projects/p-1/documents") || input.endsWith("/v1/projects/p-1/threads") || input.endsWith("/v1/projects/p-1/commitments") ? jsonResponse({ items: [] }) : null,
      (input, init) => input.endsWith("/v1/sessions/session-p1/messages") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; persistedBodies.push(payload); const role = payload.role === "assistant" ? "assistant" : "user"; transcript = [...transcript, buildMessage({ id: `${role}-${persistedBodies.length}`, session_id: "session-p1", role, content_markdown: String(payload.content_markdown ?? "") })]; return jsonResponse({ session_id: "session-p1", items: [transcript[transcript.length - 1]] }); })() : null,
      (input) => input.endsWith("/v1/sessions/session-p1/messages") ? jsonResponse({ items: transcript }) : null,
      (input) => input.endsWith("/v1/sessions/session-p1") ? jsonResponse(buildSession({ id: "session-p1", project_id: "p-1" })) : null,
      (input, init) => input.endsWith("/v1/project-agents/project-agent-1/mcp") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; return jsonResponse(payload.method === "tools/list" ? { jsonrpc: "2.0", id: "tools-list-1", result: { tools: [{ name: "project.context.upsert", description: "Update project context", inputSchema: { type: "object" } }] } } : { jsonrpc: "2.0", id: "tool-call-1", result: { content: [{ type: "text", text: "ok" }], structuredContent: { item_id: "ctx-1" }, isError: false } }); })() : null,
      (input, init) => input.endsWith("/v1/llm/responses") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; const messages = Array.isArray(payload.messages) ? payload.messages : []; const hasToolResult = messages.some((message) => typeof message === "object" && message !== null && String((message as { content?: unknown }).content ?? "").includes("Инструмент backend.project.context.upsert выполнен успешно.")); return jsonResponse(hasToolResult ? { output_text: "Контекст проекта обновлён." } : { output_text: null, tool_calls: [{ id: "call-ctx-1", type: "function", name: "backend.project.context.upsert", arguments: { key: "ctx-1", title: "Project context", content_markdown: "Платформа AI-агентов для IT." } }] }); })() : null,
    ]);
    render(<WorkspaceShell language="ru" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: true })} project={buildProject({ id: "p-1", agent_key: "sa_analyst" })} projects={[buildProject({ id: "p-1", agent_key: "sa_analyst" })]} globalSessions={[]} globalAssistantMessages={[]} projectSessions={[buildSession({ id: "session-p1", project_id: "p-1" })]} onboarding={null} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("workspace-project-session-session-p1"));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Зафиксируй контекст проекта." } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Контекст проекта обновлён.")).toBeTruthy();
    expect(screen.queryByText(/\"tool_call\"/)).toBeNull();
    expect(screen.queryByText(/Фиксирую контекст проекта/)).toBeNull();
    await waitFor(() => expect(persistedBodies[1]).toMatchObject({ role: "assistant", content_markdown: "Контекст проекта обновлён." }));
  });
});
