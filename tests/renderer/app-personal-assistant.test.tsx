import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput, SessionMessage } from "../../src/renderer/lib/types";
import { buildMessage, buildProfile, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { devtools, files, installAppFlowEnv, storage } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";
import { renderWorkspaceShell } from "./support/app-flow-render";

describe("Personal assistant runtime", () => {
  const env = installAppFlowEnv();

  it("persists user and assistant messages for the personal assistant and runs the reply locally", async () => {
    let transcript: SessionMessage[] = [];
    const persistedBodies: Array<Record<string, unknown>> = [];
    const llmBodies: Array<Record<string, unknown>> = [];
    mockFetchRoutes(env.fetchMock, [
      (input, init) => input.endsWith("/v1/llm/responses") && init?.method === "POST" ? (() => {
        llmBodies.push(JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>);
        return jsonResponse({ output_text: "Я могу помочь обновить профиль, создать проект или записать проектный контекст через MCP-инструменты. Опишите, что нужно сделать." });
      })() : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp") ? jsonResponse({ mcpServers: {} }) : null,
      (input) => input.includes("/v1/capabilities") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/sessions?workspace_id=ws-1") ? jsonResponse({ items: [buildSession({ id: "session-1", title: "Global chat" })] }) : null,
      (input) => input.endsWith("/v1/sessions/session-1") ? jsonResponse(buildSession({ id: "session-1", title: "Global chat" })) : null,
      (input, init) => input.endsWith("/v1/sessions/session-1/messages") && init?.method === "POST" ? (() => { const payload = JSON.parse(String(init.body)) as Record<string, unknown>; persistedBodies.push(payload); const role = payload.role === "assistant" ? "assistant" : "user"; const saved = buildMessage({ id: `${role}-${persistedBodies.length}`, session_id: "session-1", role, content_markdown: String(payload.content_markdown ?? "") }); transcript = [...transcript, saved]; return jsonResponse({ session_id: "session-1", items: [saved] }); })() : null,
      (input) => input.endsWith("/v1/sessions/session-1/messages") ? jsonResponse({ items: transcript }) : null,
      (input, init) => input.endsWith("/v1/me/mcp") && init?.method === "POST" ? jsonResponse({ jsonrpc: "2.0", id: "tools-list-1", result: { tools: [] } }) : null,
    ]);
    render(<WorkspaceShell language="en" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: true })} project={null} projects={[]} globalSessions={[buildSession({ id: "session-1", title: "Global chat" })]} globalAssistantMessages={transcript} projectSessions={[]} onboarding={null} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("workspace-global-session-session-1"));
    fireEvent.change(await screen.findByPlaceholderText("Ask the workspace agent anything..."), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Hello")).toBeTruthy();
    expect(await screen.findByText("Я могу помочь обновить профиль, создать проект или записать проектный контекст через MCP-инструменты. Опишите, что нужно сделать.")).toBeTruthy();
    expect(persistedBodies[0]).toMatchObject({ role: "user", content_markdown: "Hello" });
    await waitFor(() => {
      expect(persistedBodies[1]).toMatchObject({ role: "assistant", actor_id: "sa_analyst" });
    });
    expect(llmBodies[0]?.tool_choice).toBe("auto");
    expect(llmBodies[0]?.tools).toEqual([]);
    expect(screen.queryByText(/"tool_call"/)).toBeNull();
  });

  it("renders fetched messages even if MCP tool discovery for the runtime hangs", async () => {
    const transcript = [buildMessage({ id: "assistant-1", role: "assistant", content_markdown: "История уже загружена." })];
    window.saAgent = { storage, devtools, files, mcp: { listTools: vi.fn(async () => await new Promise(() => undefined)), callTool: vi.fn(async () => ({ content: [], isError: false })), closeRuntime: vi.fn(async () => undefined) } };
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp") ? jsonResponse({ mcpServers: { filesystem: { command: "node", args: ["server.js"] } } }) : null,
      (input) => input.includes("/v1/capabilities") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/sessions?workspace_id=ws-1") ? jsonResponse({ items: [buildSession({ id: "session-1", title: "Assistant" })] }) : null,
      (input) => input.endsWith("/v1/sessions/session-1/messages") ? jsonResponse({ items: transcript }) : null,
    ]);
    renderWorkspaceShell({ globalSessions: [buildSession({ id: "session-1", title: "Assistant" })], globalAssistantMessages: transcript });
    fireEvent.click(await screen.findByTestId("workspace-global-session-session-1"));
    expect(await screen.findByText("История уже загружена.")).toBeTruthy();
    expect(screen.queryByText("Loading messages.")).toBeNull();
  });

  it("scrolls the thread stream to the latest message", async () => {
    const scrollIntoView = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => (callback(0), 1));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    const transcript = [buildMessage({ id: "assistant-1", role: "assistant", content_markdown: "История уже загружена." })];
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp") ? jsonResponse({ mcpServers: {} }) : null,
      (input) => input.includes("/v1/capabilities") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/sessions?workspace_id=ws-1") ? jsonResponse({ items: [buildSession({ id: "session-1", title: "Assistant" })] }) : null,
      (input) => input.endsWith("/v1/sessions/session-1/messages") ? jsonResponse({ items: transcript }) : null,
    ]);
    renderWorkspaceShell({ globalSessions: [buildSession({ id: "session-1", title: "Assistant" })], globalAssistantMessages: transcript });
    fireEvent.click(await screen.findByTestId("workspace-global-session-session-1"));
    expect(await screen.findByText("История уже загружена.")).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
