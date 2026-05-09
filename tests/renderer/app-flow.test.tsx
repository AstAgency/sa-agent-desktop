import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/renderer/App";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput, ProjectSummary, SessionMessage, SessionSummary, ViewerProfile, WorkspaceSummary } from "../../src/renderer/lib/types";

type StorageSnapshot = {
  language: "ru" | "en" | null;
  isAuthenticated: boolean;
  themeMode?: "dark" | "light" | null;
  workspaceMode?: "home" | "activity" | "thread" | "tasks" | "agents" | "files" | "executions" | null;
  selectedAgentKey?: string | null;
  activeWorkspaceId?: string | null;
  apiBaseUrl?: string | null;
  devModeEnabled?: boolean;
  activeProjectId?: string | null;
  activeProjectAgentId?: string | null;
  activeSessionId?: string | null;
  activeThreadId?: string | null;
};

const storage = {
  getAppState: vi.fn<() => Promise<StorageSnapshot | null>>(),
  setAppState: vi.fn<(value: Partial<StorageSnapshot>) => Promise<StorageSnapshot>>(),
  clearAppState: vi.fn<() => Promise<void>>(),
};

const devtools = {
  open: vi.fn<() => Promise<{ ok: boolean; error?: string | null }>>(),
};

const files = {
  writeFiles: vi.fn<
    (entries: Array<{ relativePath: string; content: string }>) => Promise<{ ok: boolean; rootPath?: string | null; error?: string | null }>
  >(),
  openFolder: vi.fn<() => Promise<{ ok: boolean; rootPath?: string | null; error?: string | null }>>(),
};

declare global {
  interface Window {
    saAgent?: {
      storage: typeof storage;
      devtools?: typeof devtools;
      files?: typeof files;
    };
  }
}

describe("App flow", () => {
  let currentState: StorageSnapshot;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    currentState = { language: null, isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    storage.getAppState.mockImplementation(async () => currentState);
    storage.setAppState.mockImplementation(async (patch) => {
      currentState = { ...currentState, ...patch };
      return currentState;
    });
    storage.clearAppState.mockResolvedValue();
    devtools.open.mockResolvedValue({ ok: true });
    files.writeFiles.mockResolvedValue({ ok: true, rootPath: "/tmp/agent-files" });
    files.openFolder.mockResolvedValue({ ok: true, rootPath: "/tmp/agent-files" });
    window.saAgent = { storage, devtools, files };
    document.documentElement.lang = "en";
    document.documentElement.dataset.themeMode = "";
    window.localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("moves from language setup to auth after choosing a language", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Choose your language" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Русский" }));

    await waitFor(() => {
      expect(storage.setAppState).toHaveBeenCalledWith({ language: "ru" });
    });

    expect(await screen.findByRole("heading", { name: "Войти в SA-Agent" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("ru");
  });

  it("opens workspace shell instead of a separate empty-projects screen when no projects exist", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };

    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/me/bootstrap")) {
        return jsonResponse({
          viewer_profile: buildProfile({ onboarding_completed: true }),
          assistant_thread: buildAssistantThread(),
          assistant_messages: [],
          workspaces: [buildWorkspace()],
        });
      }

      if (input.endsWith("/v1/agent-profiles")) {
        return jsonResponse({ items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }] });
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [] });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByTestId("workspace-home-view")).toBeTruthy();
    expect(screen.getByTestId("workspace-project-create")).toBeTruthy();
  });

  it("restores saved agent selection and falls back to the first active agent when it is invalid", async () => {
    currentState = {
      language: "en",
      isAuthenticated: true,
      selectedAgentKey: "missing-agent",
      apiBaseUrl: null,
      devModeEnabled: true,
    };

    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/me/bootstrap")) {
        return jsonResponse({
          viewer_profile: buildProfile({ onboarding_completed: true }),
          assistant_thread: buildAssistantThread(),
          assistant_messages: [],
          workspaces: [buildWorkspace()],
        });
      }

      if (input.endsWith("/v1/agent-profiles")) {
        return jsonResponse({
          items: [
            { agent_key: "inactive-agent", display_name: "Inactive Agent", is_active: false },
            { agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true },
            { agent_key: "biz_architect", display_name: "Biz Architect", is_active: true },
          ],
        });
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [] });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByTestId("workspace-home-view")).toBeTruthy();

    await waitFor(() => {
      expect(storage.setAppState).toHaveBeenCalledWith({ selectedAgentKey: "sa_analyst" });
    });
  });

  it("lands in Project Home after bootstrap instead of opening chat-first main content", async () => {
    renderWorkspaceShell();

    expect(await screen.findByTestId("workspace-home-view")).toBeTruthy();
    expect(screen.getByTestId("workspace-shell-topbar")).toBeTruthy();
    expect(screen.getByTestId("workspace-shell-nav")).toBeTruthy();
    expect(screen.getByTestId("workspace-shell-main")).toBeTruthy();
    expect(screen.getByTestId("workspace-shell-context-panel")).toBeTruthy();
    expect(screen.getByTestId("workspace-nav-home")).toBeTruthy();
    expect(screen.getByTestId("workspace-nav-activity")).toBeTruthy();
    expect(screen.getByTestId("workspace-nav-thread")).toBeTruthy();
    expect(screen.getByTestId("workspace-search-slot")).toBeTruthy();
    expect(screen.getByTestId("workspace-runtime-badge")).toBeTruthy();
    expect(screen.getByTestId("workspace-home-status-section")).toBeTruthy();
    expect(screen.getByTestId("workspace-home-agents-section")).toBeTruthy();
    expect(screen.getByTestId("workspace-home-tasks-section")).toBeTruthy();
    expect(screen.getByTestId("workspace-home-executions-section")).toBeTruthy();
    expect(screen.getByTestId("workspace-home-artifacts-section")).toBeTruthy();
    expect(screen.getByTestId("workspace-home-activity-section")).toBeTruthy();
    expect(screen.getByTestId("workspace-context-default-state")).toBeTruthy();
  });

  it("uses shrinkable grid tracks so the main workspace area can scroll", async () => {
    renderWorkspaceShell();

    const shell = await screen.findByTestId("workspace-shell");
    const body = screen.getByTestId("workspace-shell-body");
    const main = screen.getByTestId("workspace-shell-main");

    expect((shell as HTMLElement).style.gridTemplateRows).toBe("auto minmax(0, 1fr)");
    expect((shell as HTMLElement).style.height).toBe("100vh");
    expect((body as HTMLElement).style.gridTemplateColumns).toBe("280px minmax(0, 1fr) 340px");
    expect((main as HTMLElement).style.minHeight).toBe("0");
    expect((main as HTMLElement).style.overflow).toBe("auto");
  });

  it("keeps thread composer pinned to the bottom of the thread workspace", async () => {
    renderWorkspaceShell();

    fireEvent.click(await screen.findByTestId("workspace-nav-thread"));

    const threadView = await screen.findByTestId("workspace-thread-view");
    const threadStream = screen.getByTestId("workspace-thread-stream");
    const threadComposer = screen.getByTestId("workspace-thread-composer");

    expect((threadView as HTMLElement).style.display).toBe("flex");
    expect((threadView as HTMLElement).style.flexDirection).toBe("column");
    expect((threadView as HTMLElement).style.height).toBe("100%");
    expect((threadStream as HTMLElement).style.flex).toBe("1 1 auto");
    expect((threadStream as HTMLElement).style.overflowY).toBe("auto");
    expect((threadComposer as HTMLElement).style.position).toBe("sticky");
    expect((threadComposer as HTMLElement).style.bottom).toBe("0px");
  });

  it("treats the context panel collapse as a distinct layout state", async () => {
    renderWorkspaceShell();

    const body = await screen.findByTestId("workspace-shell-body");
    expect((body as HTMLElement).style.gridTemplateColumns).toBe("280px minmax(0, 1fr) 340px");

    fireEvent.click(screen.getByTestId("workspace-context-toggle"));

    expect((body as HTMLElement).style.gridTemplateColumns).toBe("280px minmax(0, 1fr) 56px");
    expect(screen.getByTestId("workspace-context-collapsed")).toBeTruthy();
    expect(screen.queryByTestId("workspace-context-default-state")).toBeNull();
  });

  it("treats the left sidebar collapse as a distinct layout state with icon-only rail", async () => {
    renderWorkspaceShell();

    const body = await screen.findByTestId("workspace-shell-body");
    expect((body as HTMLElement).style.gridTemplateColumns).toBe("280px minmax(0, 1fr) 340px");

    fireEvent.click(screen.getByTestId("workspace-nav-toggle"));

    expect((body as HTMLElement).style.gridTemplateColumns).toBe("72px minmax(0, 1fr) 340px");
    expect(screen.getByTestId("workspace-shell-nav").getAttribute("data-collapsed")).toBe("true");
    expect(screen.queryByTestId("workspace-nav-projects-section")).toBeNull();
  });

  it("does not create a session implicitly when landing on Home outside onboarding", async () => {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (init?.method === "POST" && input.endsWith("/v1/sessions")) {
        throw new Error("Session must not be auto-created on Home landing.");
      }

      if (input.endsWith("/v1/agents/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/agents/sa_analyst/mcps")) {
        return jsonResponse({
          mcpServers: {
            backend: {
              transport: "http",
              url: "http://127.0.0.1:3000/v1/mcp/sa_analyst",
            },
          },
        });
      }

      if (input.includes("/v1/capabilities")) {
        return jsonResponse({ items: [] });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    renderWorkspaceShell({
      globalSessions: [],
      globalAssistantMessages: [],
    });

    expect(await screen.findByTestId("workspace-home-view")).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/sessions$/),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("restores the last selected workspace mode after app restart", async () => {
    currentState = {
      language: "en",
      isAuthenticated: true,
      selectedAgentKey: "sa_analyst",
      workspaceMode: "files",
      apiBaseUrl: null,
      devModeEnabled: true,
    };

    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/me/bootstrap")) {
        return jsonResponse({
          viewer_profile: buildProfile({ onboarding_completed: true }),
          assistant_thread: buildAssistantThread(),
          assistant_messages: [],
          workspaces: [buildWorkspace()],
          selected_project: buildProject({ id: "p-1", agent_key: "sa_analyst" }),
        });
      }

      if (input.endsWith("/v1/agent-profiles")) {
        return jsonResponse({
          items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }],
        });
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [buildProject({ id: "p-1", agent_key: "sa_analyst" })] });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/projects/p-1/agents")) {
        return jsonResponse({
          items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }],
        });
      }

      if (input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp")) {
        return jsonResponse({
          mcpServers: {
            backend: {
              transport: "http",
              url: "http://127.0.0.1:3000/v1/project-agents/project-agent-1/mcp",
            },
          },
        });
      }

      if (input.includes("/v1/capabilities?project_id=p-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/documents")) {
        return jsonResponse({ items: [] });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByTestId("workspace-files-view")).toBeTruthy();
  });

  it("separates logical artifacts from physical workspace files in Files mode", async () => {
    renderWorkspaceShell({
      project: buildProject({ id: "p-1", agent_key: "sa_analyst" }),
      projectSessions: [],
    });

    fireEvent.click(await screen.findByTestId("workspace-nav-files"));

    expect(await screen.findByTestId("workspace-files-view")).toBeTruthy();
    expect(screen.getByTestId("workspace-files-artifacts-section")).toBeTruthy();
    expect(screen.getByTestId("workspace-files-physical-section")).toBeTruthy();
  });

  it("persists user and assistant messages for the personal assistant and runs the reply locally", async () => {
    const workspace = buildWorkspace();
    const globalSession = buildSession({ id: "session-1", title: "Global chat" });
    let transcript: SessionMessage[] = [];
    const persistedBodies: Array<Record<string, unknown>> = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/llm/responses") && init?.method === "POST") {
        return jsonResponse({
          output_text: "Я могу помочь обновить профиль, создать проект или записать проектный контекст через MCP-инструменты. Опишите, что нужно сделать.",
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst/mcp")) {
        return jsonResponse({ mcpServers: {} });
      }

      if (input.includes("/v1/capabilities")) {
        return jsonResponse({
          items: [],
        });
      }

      if (input.endsWith("/v1/me/assistant-thread")) {
        return jsonResponse({
          thread: buildAssistantThread({ id: "session-1", title: "Global chat" }),
          messages: transcript,
        });
      }

      if (input.endsWith("/v1/me/assistant-thread/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        persistedBodies.push(payload);
        const role = payload.role === "assistant" ? "assistant" : "user";
        const content = String(payload.content_markdown ?? "");
        const savedMessage = buildMessage({
          id: `${role}-${persistedBodies.length}`,
          role,
          content_markdown: content,
        });
        transcript = [...transcript, savedMessage];

        return jsonResponse({
          thread: buildAssistantThread({ id: "session-1", title: "Global chat" }),
          messages: [savedMessage],
        });
      }

      if (input.endsWith("/v1/me/mcp") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as { method?: string };
        if (payload.method === "tools/list") {
          return jsonResponse({
            jsonrpc: "2.0",
            id: "tools-list-1",
            result: {
              tools: [],
            },
          });
        }

        throw new Error(`Unexpected MCP request: ${JSON.stringify(payload)}`);
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="en"
        workspace={workspace}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: true })}
        project={null}
        projects={[]}
        globalSessions={[globalSession]}
        globalAssistantMessages={transcript}
        projectSessions={[]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("workspace-nav-thread"));

    const textbox = await screen.findByPlaceholderText("Ask the workspace agent anything...");
    fireEvent.change(textbox, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Hello")).toBeTruthy();
    expect(await screen.findByText("Я могу помочь обновить профиль, создать проект или записать проектный контекст через MCP-инструменты. Опишите, что нужно сделать.")).toBeTruthy();
    expect(persistedBodies).toHaveLength(2);
    expect(persistedBodies[0]).toMatchObject({
      role: "user",
      content_markdown: "Hello",
    });
    expect(persistedBodies[1]).toMatchObject({
      role: "assistant",
      actor_id: "sa_analyst",
    });
  });

  it("renders fetched messages even if MCP tool discovery for the runtime hangs", async () => {
    const transcript = [
      buildMessage({ id: "assistant-1", role: "assistant", content_markdown: "История уже загружена." }),
    ];

    window.saAgent = {
      storage,
      devtools,
      files,
      mcp: {
        listTools: vi.fn(async () => await new Promise(() => undefined)),
        callTool: vi.fn(async () => ({ content: [], isError: false })),
        closeRuntime: vi.fn(async () => undefined),
      },
    };

    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst/mcp")) {
        return jsonResponse({
          mcpServers: {
            filesystem: {
              command: "node",
              args: ["server.js"],
            },
          },
        });
      }

      if (input.includes("/v1/capabilities")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/me/assistant-thread")) {
        return jsonResponse({
          thread: buildAssistantThread({ id: "session-1", title: "Assistant" }),
          messages: transcript,
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    renderWorkspaceShell({
      globalSessions: [buildSession({ id: "session-1", title: "Assistant" })],
      globalAssistantMessages: transcript,
    });

    fireEvent.click(await screen.findByTestId("workspace-nav-thread"));
    expect(await screen.findByText("История уже загружена.")).toBeTruthy();
    expect(screen.queryByText("Loading messages.")).toBeNull();
  });

  it("scrolls the thread stream to the latest message", async () => {
    const scrollIntoView = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    const transcript = [
      buildMessage({ id: "assistant-1", role: "assistant", content_markdown: "История уже загружена." }),
    ];

    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst/mcp")) {
        return jsonResponse({ mcpServers: {} });
      }

      if (input.includes("/v1/capabilities")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/me/assistant-thread")) {
        return jsonResponse({
          thread: buildAssistantThread({ id: "session-1", title: "Assistant" }),
          messages: transcript,
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    renderWorkspaceShell({
      globalSessions: [buildSession({ id: "session-1", title: "Assistant" })],
      globalAssistantMessages: transcript,
    });

    fireEvent.click(await screen.findByTestId("workspace-nav-thread"));
    expect(await screen.findByText("История уже загружена.")).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("starts user onboarding through interactive capability and finishes on execution.completed", async () => {
    const workspace = buildWorkspace();
    const onboardingSession = buildSession({
      id: "session-onboard",
      active_capability_key: "user_onboarding",
      execution_id: "exec-1",
      execution_status: "running",
    });
    let transcript: SessionMessage[] = [];
    const mcpCalls: Array<{ method?: string; params?: Record<string, unknown> }> = [];
    const llmBodies: Array<Record<string, unknown>> = [];
    const onComplete = vi.fn();

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/llm/responses") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        llmBodies.push(payload);

        if (llmBodies.length === 1) {
          return jsonResponse({
            output_text: "Привет. Давай начнем знакомство: как мне к вам обращаться и как вы хотите называть меня?",
          });
        }

        return jsonResponse({
          output_text: JSON.stringify({
            tool_call: {
              name: "profile.complete_onboarding",
              arguments: {
                idempotency_key: "profile-complete-1",
                payload: {
                  profile_saved: true,
                  user_name: "Вахтанг",
                  agent_name: "Фрунзик",
                  role: "системный аналитик",
                  communication_style: "коротко и по делу",
                },
              },
            },
          }),
        });
      }

      if (input.endsWith("/v1/agent-profiles")) {
        return jsonResponse({
          items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }],
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst/mcp")) {
        return jsonResponse({
          mcpServers: {
            backend: {
              transport: "http",
              url: "http://127.0.0.1:3000/v1/mcp/sa_analyst",
            },
          },
        });
      }

      if (input.includes("/v1/capabilities")) {
        return jsonResponse({
          items: [
            {
              capability_key: "user_onboarding",
              display_name: "User onboarding",
              mode: "interactive",
            },
          ],
        });
      }

      if (input.endsWith("/v1/me/assistant-thread")) {
        return jsonResponse({
          thread: buildAssistantThread({ id: "session-onboard" }),
          messages: transcript,
        });
      }

      if (input.endsWith("/v1/me/assistant-thread/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        const savedMessage = buildMessage({
          id: `${payload.role === "assistant" ? "assistant" : "user"}-${transcript.length + 1}`,
          role: payload.role === "assistant" ? "assistant" : "user",
          content_markdown: String(payload.content_markdown ?? ""),
          is_hidden: payload.role !== "assistant",
        });
        transcript = [...transcript, savedMessage];

        return jsonResponse({
          thread: buildAssistantThread({ id: "session-onboard" }),
          messages: [savedMessage],
        });
      }

      if (input.endsWith("/v1/me/mcp") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as { method?: string; params?: Record<string, unknown> };
        mcpCalls.push(payload);
        if (payload.method === "tools/list") {
          return jsonResponse({
            jsonrpc: "2.0",
            id: "tools-list-1",
            result: {
              tools: [
                {
                  name: "profile.complete_onboarding",
                  description: "Complete user onboarding",
                  inputSchema: { type: "object" },
                },
              ],
            },
          });
        }

        if (payload.method === "tools/call") {
          expect(payload.params?.name).toBe("profile.complete_onboarding");
          return jsonResponse({
            jsonrpc: "2.0",
            id: "tool-call-1",
            result: {
              content: [{ type: "text", text: "ok" }],
              structuredContent: {
                profile_saved: true,
                user_name: "Вахтанг",
                agent_name: "Фрунзик",
                role: "системный аналитик",
                communication_style: "коротко и по делу",
              },
              isError: false,
            },
          });
        }

        throw new Error(`Unexpected MCP request: ${JSON.stringify(payload)}`);
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="en"
        workspace={workspace}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: false })}
        project={null}
        projects={[]}
        globalSessions={[onboardingSession]}
        globalAssistantMessages={transcript}
        projectSessions={[]}
        onboarding={{ kind: "user", workspaceId: workspace.id, onComplete }}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(await screen.findByText("Привет. Давай начнем знакомство: как мне к вам обращаться и как вы хотите называть меня?")).toBeTruthy();
    const textbox = await screen.findByPlaceholderText("Reply to the agent...");
    fireEvent.change(textbox, {
      target: {
        value: "Меня зовут Вахтанг, тебя я хочу называть Фрунзик. Я системный аналитик, общайся коротко и по делу.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    expect(llmBodies.length).toBeGreaterThanOrEqual(2);
    expect(mcpCalls.some((call) => call.method === "tools/call")).toBe(true);
  });

  it("sends the hidden user-onboarding bootstrap prompt only once for the assistant thread", async () => {
    const workspace = buildWorkspace();
    const assistantSession = buildSession({ id: "assistant-thread-1", title: "Assistant" });
    let hiddenPromptPosts = 0;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/llm/responses") && init?.method === "POST") {
        return jsonResponse({
          output_text: "Я могу помочь обновить профиль, создать проект или записать проектный контекст через MCP-инструменты. Опишите, что нужно сделать.",
        });
      }

      if (input.endsWith("/v1/agent-profiles")) {
        return jsonResponse({ items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }] });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst/mcp")) {
        return jsonResponse({ mcpServers: {} });
      }

      if (input.includes("/v1/capabilities")) {
        return jsonResponse({ items: [{ capability_key: "user_onboarding", display_name: "User onboarding", mode: "interactive" }] });
      }

      if (input.endsWith("/v1/me/assistant-thread")) {
        return jsonResponse({
          thread: buildAssistantThread({ id: "assistant-thread-1" }),
          messages: [],
        });
      }

      if (input.endsWith("/v1/me/assistant-thread/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (payload.role !== "assistant" && payload.content_markdown === "Начни онбординг на русском языке, задай первый вопрос и веди диалог до завершения.") {
          hiddenPromptPosts += 1;
        }
        const savedMessage = buildMessage({
          id: `${payload.role === "assistant" ? "assistant" : "user"}-${hiddenPromptPosts}`,
          role: payload.role === "assistant" ? "assistant" : "user",
          content_markdown: String(payload.content_markdown ?? ""),
          is_hidden: payload.role !== "assistant",
        });

        return jsonResponse({
          thread: buildAssistantThread({ id: "assistant-thread-1" }),
          messages: [savedMessage],
        });
      }

      if (input.endsWith("/v1/me/mcp") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as { method?: string };
        if (payload.method === "tools/list") {
          return jsonResponse({
            jsonrpc: "2.0",
            id: "tools-list-1",
            result: {
              tools: [],
            },
          });
        }

        throw new Error(`Unexpected MCP request: ${JSON.stringify(payload)}`);
      }

      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: false }));
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="ru"
        workspace={workspace}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: false })}
        project={null}
        projects={[]}
        globalSessions={[assistantSession]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={{ kind: "user", workspaceId: workspace.id, onComplete: vi.fn() }}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(hiddenPromptPosts).toBe(1);
    });
  });

  it("attempts project onboarding session bootstrap only once after a session creation error", async () => {
    const workspace = buildWorkspace();
    const project = buildProject({ id: "p-1", workspace_id: workspace.id, agent_key: "sa-agent", onboarding_completed: false });
    let createSessionAttempts = 0;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/agent-profiles/sa-agent")) {
        return jsonResponse({
          agent_key: "sa-agent",
          display_name: "SA Agent",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/projects/p-1/agents")) {
        return jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa-agent", display_name: "SA Agent" }] });
      }

      if (input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp")) {
        return jsonResponse({ mcpServers: {} });
      }

      if (input.includes("/v1/capabilities?project_id=p-1")) {
        return jsonResponse({
          items: [{ capability_key: "project_onboarding", display_name: "Project onboarding", mode: "interactive" }],
        });
      }

      if (input.endsWith("/v1/projects/p-1/documents")) return jsonResponse({ items: [] });
      if (input.endsWith("/v1/projects/p-1/threads")) return jsonResponse({ items: [] });
      if (input.endsWith("/v1/projects/p-1/commitments")) return jsonResponse({ items: [] });

      if (input.endsWith("/v1/sessions") && init?.method === "POST") {
        createSessionAttempts += 1;
        return jsonResponse(
          {
            error: {
              code: "internal_error",
              message: "GitHub catalog request failed with 403: API rate limit exceeded",
              status: 500,
            },
          },
          { status: 500 },
        );
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="ru"
        workspace={workspace}
        agents={[{ agent_key: "sa-agent", display_name: "SA Agent", is_active: true }]}
        selectedAgentKey="sa-agent"
        profile={buildProfile({ onboarding_completed: true })}
        project={project}
        projects={[project]}
        globalSessions={[]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={{ kind: "project", projectId: project.id, onComplete: vi.fn() }}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(createSessionAttempts).toBe(1);
    });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 150);
    });

    expect(createSessionAttempts).toBe(1);
  });

  it("does not expose the legacy capability runner in the thread composer", async () => {
    const workspace = buildWorkspace();
    const globalSession = buildSession({ id: "session-1", title: "Global chat" });

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/agent-profiles")) {
        return jsonResponse({
          items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }],
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst/mcp")) {
        return jsonResponse({
          mcpServers: {
            backend: {
              transport: "http",
              url: "http://127.0.0.1:3000/v1/mcp/sa_analyst",
            },
          },
        });
      }

      if (input.endsWith("/v1/me/assistant-thread")) {
        return jsonResponse({
          thread: buildAssistantThread({ id: "session-1", title: "Global chat" }),
          messages: [],
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="en"
        workspace={workspace}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: true })}
        project={null}
        projects={[]}
        globalSessions={[globalSession]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("workspace-nav-thread"));

    expect(await screen.findByTestId("workspace-thread-composer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run capability" })).toBeNull();
    expect(screen.queryByText("Generate BRD")).toBeNull();
  });

  it("opens the shared agent files folder from the sidebar", async () => {
    const workspace = buildWorkspace();
    const globalSession = buildSession({ id: "session-1", title: "Global chat" });

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/agent-profiles")) {
        return jsonResponse({
          items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }],
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst/mcp")) {
        return jsonResponse({
          mcpServers: {
            backend: {
              transport: "http",
              url: "http://127.0.0.1:3000/v1/mcp/sa_analyst",
            },
          },
        });
      }

      if (input.includes("/v1/capabilities")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/me/assistant-thread")) {
        return jsonResponse({
          thread: buildAssistantThread({ id: "session-1", title: "Global chat" }),
          messages: [],
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="en"
        workspace={workspace}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: true })}
        project={null}
        projects={[]}
        globalSessions={[globalSession]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("workspace-nav-files"));
    fireEvent.click(await screen.findByRole("button", { name: "Open folder" }));

    await waitFor(() => {
      expect(files.openFolder).toHaveBeenCalledTimes(1);
    });
  });

  it("routes project creation into the global assistant thread instead of opening a form popup", async () => {
    renderWorkspaceShell({
      projects: [buildProject({ id: "p-1", name: "Alpha" }), buildProject({ id: "p-2", name: "Beta" })],
    });

    fireEvent.click(await screen.findByTestId("workspace-project-create"));

    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    const textbox = screen.getByPlaceholderText("Ask the workspace agent anything...") as HTMLTextAreaElement;
    expect(textbox.value).toContain("create a new project");
  });

  it("renders profile details from onboarding payload and hides project context block", async () => {
    const workspace = buildWorkspace();
    const globalSession = buildSession({ id: "session-1", title: "Global chat" });

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/agent-profiles")) {
        return jsonResponse({
          items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }],
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst/mcp")) {
        return jsonResponse({
          mcpServers: {
            backend: {
              transport: "http",
              url: "http://127.0.0.1:3000/v1/mcp/sa_analyst",
            },
          },
        });
      }

      if (input.includes("/v1/capabilities")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/me/assistant-thread")) {
        return jsonResponse({
          thread: buildAssistantThread({ id: "session-1", title: "Global chat" }),
          messages: [],
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="ru"
        workspace={workspace}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({
          onboarding_completed: true,
          preferred_user_name: null,
          preferred_agent_name: "Фрунзик",
          activity_domain: null,
          onboarding_payload: {
            profile_saved: true,
            user_name: "Вахтанг",
            agent_name: "Фрунзик",
            role: "системный аналитик",
            tech_stack: ["Python", "JavaScript", "PostgreSQL"],
            communication_style: "текстовое общение",
          },
        })}
        project={null}
        projects={[]}
        globalSessions={[globalSession]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(await screen.findByText("Вахтанг")).toBeTruthy();
    expect(screen.getByText("Фрунзик")).toBeTruthy();
    expect(screen.getByText("системный аналитик")).toBeTruthy();
    expect(screen.queryByText("Контекст проекта")).toBeNull();
  });

  it("does not show a global utility error when templates are unavailable outside project mode", async () => {
    const workspace = buildWorkspace();
    const globalSession = buildSession({ id: "session-1", title: "Global chat" });

    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({
          agent_key: "sa_analyst",
          display_name: "SA Analyst",
          domain: "system analysis",
          visibility: "public",
          is_active: true,
        });
      }

      if (input.endsWith("/v1/agent-profiles/sa_analyst/mcp")) {
        return jsonResponse({
          mcpServers: {
            backend: {
              transport: "http",
              url: "http://127.0.0.1:3000/v1/mcp/sa_analyst",
            },
          },
        });
      }

      if (input.includes("/v1/capabilities")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/me/assistant-thread")) {
        return jsonResponse({
          thread: buildAssistantThread({ id: "session-1", title: "Global chat" }),
          messages: [],
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="en"
        workspace={workspace}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: true })}
        project={null}
        projects={[]}
        globalSessions={[globalSession]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("workspace-home-view")).toBeTruthy();
    expect(screen.queryByText("Failed to load utility data.")).toBeNull();
  });

  it("explains why non-thread workspace modes are unavailable during onboarding and localizes assistant actions", async () => {
    render(
      <WorkspaceShell
        language="ru"
        workspace={buildWorkspace()}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: false })}
        project={null}
        projects={[]}
        globalSessions={[
          buildSession({
            id: "session-onboard",
            active_capability_key: "user_onboarding",
            execution_id: "exec-1",
            execution_status: "running",
          }),
        ]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={{ kind: "user", workspaceId: "ws-1", onComplete: vi.fn() }}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("assistant-trigger-ask")).toBeTruthy();
    expect(screen.getByTestId("assistant-trigger-command")).toBeTruthy();

    fireEvent.click(screen.getByTestId("workspace-nav-home"));
    expect(await screen.findByTestId("workspace-onboarding-locked-popup")).toBeTruthy();
    expect(screen.getByText("Завершите онбординг, чтобы открыть остальные режимы рабочего пространства.")).toBeTruthy();
  });

  it("stays in the thread workspace after onboarding completes", async () => {
    const view = render(
      <WorkspaceShell
        language="ru"
        workspace={buildWorkspace()}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: false })}
        project={null}
        projects={[]}
        globalSessions={[
          buildSession({
            id: "session-onboard",
            active_capability_key: "user_onboarding",
            execution_id: "exec-1",
            execution_status: "running",
          }),
        ]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={{ kind: "user", workspaceId: "ws-1", onComplete: vi.fn() }}
        initialWorkspaceMode="home"
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
        onWorkspaceModeChange={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();

    view.rerender(
      <WorkspaceShell
        language="ru"
        workspace={buildWorkspace()}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: true })}
        project={null}
        projects={[]}
        globalSessions={[buildSession({ id: "session-onboard" })]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={null}
        initialWorkspaceMode="home"
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
        onWorkspaceModeChange={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    expect(screen.queryByTestId("workspace-home-view")).toBeNull();
  });

  it("persists project thread messages locally and uses project-agent MCP for interactive work", async () => {
    const persistedBodies: Array<Record<string, unknown>> = [];
    const mcpBodies: Array<Record<string, unknown>> = [];
    const llmBodies: Array<Record<string, unknown>> = [];
    let transcript: SessionMessage[] = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true });
      }

      if (input.endsWith("/v1/projects/p-1/agents")) {
        return jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }] });
      }

      if (input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp")) {
        return jsonResponse({ mcpServers: {} });
      }

      if (input.includes("/v1/capabilities?project_id=p-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/documents")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/threads")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/commitments")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/sessions/session-p1/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        persistedBodies.push(payload);
        const role = payload.role === "assistant" ? "assistant" : "user";
        transcript = [
          ...transcript,
          buildMessage({
            id: `${role}-${persistedBodies.length}`,
            session_id: "session-p1",
            role,
            content_markdown: String(payload.content_markdown ?? ""),
          }),
        ];
        return jsonResponse({ session_id: "session-p1", items: [transcript[transcript.length - 1]] });
      }

      if (input.endsWith("/v1/sessions/session-p1/messages")) {
        return jsonResponse({ items: transcript });
      }

      if (input.endsWith("/v1/sessions/session-p1")) {
        return jsonResponse(buildSession({ id: "session-p1", project_id: "p-1" }));
      }

      if (input.endsWith("/v1/project-agents/project-agent-1/mcp") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        mcpBodies.push(payload);
        return jsonResponse({ jsonrpc: "2.0", id: "tool-call-1", result: { content: [{ type: "text", text: "ok" }], isError: false } });
      }

      if (input.endsWith("/v1/llm/responses") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        llmBodies.push(payload);

        if (llmBodies.length === 1) {
          return jsonResponse({
            output_text: JSON.stringify({
              tool_call: {
                name: "project.context.upsert",
                arguments: {
                  key: "thread-note-1",
                  title: "Thread context",
                  content_markdown: "Сохрани контекст проекта: мы строим платформу для аналитиков.",
                },
              },
            }),
          });
        }

        return jsonResponse({
          output_text: "Контекст проекта обновлён через MCP. Можете продолжать.",
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="ru"
        workspace={buildWorkspace()}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: true })}
        project={buildProject({ id: "p-1", agent_key: "sa_analyst" })}
        projects={[buildProject({ id: "p-1", agent_key: "sa_analyst" })]}
        globalSessions={[]}
        globalAssistantMessages={[]}
        projectSessions={[buildSession({ id: "session-p1", project_id: "p-1" })]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("workspace-nav-thread"));

    const textbox = await screen.findByRole("textbox");
    fireEvent.change(textbox, { target: { value: "Сохрани контекст проекта: мы строим платформу для аналитиков." } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByText("Контекст проекта обновлён через MCP. Можете продолжать.")).toBeTruthy();
    await waitFor(() => {
      expect(persistedBodies).toHaveLength(2);
    });
    expect(llmBodies).toHaveLength(2);
    expect(persistedBodies[0]).toMatchObject({ role: "user" });
    expect(persistedBodies[1]).toMatchObject({ role: "assistant" });
    expect(mcpBodies.some((payload) => payload.method === "tools/call")).toBe(true);
  });

  it("does not show raw mixed prose plus tool-call json in project chat", async () => {
    const persistedBodies: Array<Record<string, unknown>> = [];
    let transcript: SessionMessage[] = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true });
      }

      if (input.endsWith("/v1/projects/p-1/agents")) {
        return jsonResponse({ items: [{ id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" }] });
      }

      if (input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp")) {
        return jsonResponse({ mcpServers: {} });
      }

      if (input.includes("/v1/capabilities?project_id=p-1")) return jsonResponse({ items: [] });
      if (input.endsWith("/v1/projects/p-1/documents")) return jsonResponse({ items: [] });
      if (input.endsWith("/v1/projects/p-1/threads")) return jsonResponse({ items: [] });
      if (input.endsWith("/v1/projects/p-1/commitments")) return jsonResponse({ items: [] });

      if (input.endsWith("/v1/sessions/session-p1/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        persistedBodies.push(payload);
        const role = payload.role === "assistant" ? "assistant" : "user";
        transcript = [
          ...transcript,
          buildMessage({
            id: `${role}-${persistedBodies.length}`,
            session_id: "session-p1",
            role,
            content_markdown: String(payload.content_markdown ?? ""),
          }),
        ];
        return jsonResponse({ session_id: "session-p1", items: [transcript[transcript.length - 1]] });
      }

      if (input.endsWith("/v1/sessions/session-p1/messages")) return jsonResponse({ items: transcript });
      if (input.endsWith("/v1/sessions/session-p1")) return jsonResponse(buildSession({ id: "session-p1", project_id: "p-1" }));

      if (input.endsWith("/v1/project-agents/project-agent-1/mcp") && init?.method === "POST") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tool-call-1",
          result: {
            content: [{ type: "text", text: "ok" }],
            structuredContent: { item_id: "ctx-1" },
            isError: false,
          },
        });
      }

      if (input.endsWith("/v1/llm/responses") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const hasToolResult = messages.some((message) =>
          typeof message === "object"
          && message !== null
          && String((message as { content?: unknown }).content ?? "").includes("TOOL_RESULT"),
        );

        if (!hasToolResult) {
          return jsonResponse({
            output_text: [
              "Фиксирую контекст проекта.",
              JSON.stringify({
                tool_call: {
                  name: "project.context.upsert",
                  arguments: {
                    key: "ctx-1",
                    title: "Project context",
                    content_markdown: "Платформа AI-агентов для IT.",
                  },
                },
              }),
            ].join("\n\n"),
          });
        }

        return jsonResponse({ output_text: "Контекст проекта обновлён." });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="ru"
        workspace={buildWorkspace()}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: true })}
        project={buildProject({ id: "p-1", agent_key: "sa_analyst" })}
        projects={[buildProject({ id: "p-1", agent_key: "sa_analyst" })]}
        globalSessions={[]}
        globalAssistantMessages={[]}
        projectSessions={[buildSession({ id: "session-p1", project_id: "p-1" })]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("workspace-nav-thread"));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Зафиксируй контекст проекта." } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByText("Контекст проекта обновлён.")).toBeTruthy();
    expect(screen.queryByText(/\"tool_call\"/)).toBeNull();
    await waitFor(() => {
      expect(persistedBodies).toHaveLength(2);
    });
    expect(persistedBodies[1]).toMatchObject({ role: "assistant", content_markdown: "Контекст проекта обновлён." });
  });

  it("switches the active project agent explicitly and rebuilds the project runtime bindings", async () => {
    const persistedBodies: Array<Record<string, unknown>> = [];
    const mcpBodies: Array<Record<string, unknown>> = [];
    const llmBodies: Array<Record<string, unknown>> = [];
    let transcript: SessionMessage[] = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/agent-profiles/sa_analyst")) {
        return jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true });
      }

      if (input.endsWith("/v1/agent-profiles/research_agent")) {
        return jsonResponse({ agent_key: "research_agent", display_name: "Research Agent", is_active: true });
      }

      if (input.endsWith("/v1/projects/p-1/agents")) {
        return jsonResponse({
          items: [
            { id: "project-agent-1", agent_key: "sa_analyst", display_name: "SA Analyst" },
            { id: "project-agent-2", agent_key: "research_agent", display_name: "Research Agent" },
          ],
        });
      }

      if (input.endsWith("/v1/projects/p-1/agents/project-agent-1/mcp")) {
        return jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/project-agents/project-agent-1/mcp" } } });
      }

      if (input.endsWith("/v1/projects/p-1/agents/project-agent-2/mcp")) {
        return jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/project-agents/project-agent-2/mcp" } } });
      }

      if (input.includes("/v1/capabilities?project_id=p-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/documents")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/threads")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/commitments")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/sessions/session-p1/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        persistedBodies.push(payload);
        const role = payload.role === "assistant" ? "assistant" : "user";
        transcript = [
          ...transcript,
          buildMessage({
            id: `${role}-${persistedBodies.length}`,
            session_id: "session-p1",
            role,
            content_markdown: String(payload.content_markdown ?? ""),
          }),
        ];
        return jsonResponse({ session_id: "session-p1", items: [transcript[transcript.length - 1]] });
      }

      if (input.endsWith("/v1/sessions/session-p1/messages")) {
        return jsonResponse({ items: transcript });
      }

      if (input.endsWith("/v1/sessions/session-p1")) {
        return jsonResponse(buildSession({ id: "session-p1", project_id: "p-1" }));
      }

      if (input.endsWith("/v1/project-agents/project-agent-2/mcp") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        mcpBodies.push(payload);
        return jsonResponse({ jsonrpc: "2.0", id: "tool-call-1", result: { content: [{ type: "text", text: "ok" }], isError: false } });
      }

      if (input.endsWith("/v1/llm/responses") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        llmBodies.push(payload);

        if (llmBodies.length === 1) {
          return jsonResponse({
            output_text: JSON.stringify({
              tool_call: {
                name: "project.context.upsert",
                arguments: {
                  key: "thread-note-2",
                  title: "Research context",
                  content_markdown: "Зафиксируй исследовательский контекст проекта.",
                },
              },
            }),
          });
        }

        return jsonResponse({
          output_text: "Исследовательский агент обновил контекст проекта.",
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(
      <WorkspaceShell
        language="ru"
        workspace={buildWorkspace()}
        agents={[
          { agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true },
          { agent_key: "research_agent", display_name: "Research Agent", is_active: true },
        ]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: true })}
        project={buildProject({ id: "p-1", agent_key: "sa_analyst" })}
        projects={[buildProject({ id: "p-1", agent_key: "sa_analyst" })]}
        globalSessions={[]}
        globalAssistantMessages={[]}
        projectSessions={[buildSession({ id: "session-p1", project_id: "p-1" })]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    const projectAgentSelect = await screen.findByTestId("workspace-project-agent-select");
    fireEvent.change(projectAgentSelect, { target: { value: "project-agent-2" } });

    fireEvent.click(screen.getByTestId("workspace-nav-thread"));
    const textbox = await screen.findByRole("textbox");
    fireEvent.change(textbox, { target: { value: "Зафиксируй исследовательский контекст проекта." } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByText("Исследовательский агент обновил контекст проекта.")).toBeTruthy();
    expect(llmBodies.some((payload) => payload.project_agent_id === "project-agent-2")).toBe(true);
    expect(mcpBodies.some((payload) => payload.method === "tools/call")).toBe(true);
  });
});

function buildWorkspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    id: "ws-1",
    name: "Personal Workspace",
    slug: "personal",
    created_by_user_id: "user-1",
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

function renderWorkspaceShell(overrides: Partial<ComponentProps<typeof WorkspaceShell>> = {}) {
  const workspace = overrides.workspace ?? buildWorkspace();
  const globalSession = overrides.globalSessions?.[0] ?? buildSession({ id: "session-1", title: "Global chat" });
  const globalAssistantMessages = overrides.globalAssistantMessages ?? [];

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
      globalAssistantMessages={globalAssistantMessages}
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

function buildProfile(overrides: Partial<ViewerProfile> = {}): ViewerProfile {
  return {
    user_id: "user-1",
    email: "demo@sa-agent.local",
    display_name: "Demo User",
    onboarding_skill_id: null,
    onboarding_payload: null,
    preferred_user_name: null,
    preferred_agent_name: null,
    activity_domain: null,
    onboarding_completed: false,
    onboarding_completed_at: null,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

function buildProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "p-1",
    workspace_id: "ws-1",
    key: "PRJ",
    name: "Project",
    description: null,
    onboarding_skill_id: null,
    onboarding_payload: null,
    preferred_user_name: null,
    preferred_agent_name: null,
    activity_domain: null,
    onboarding_completed: true,
    onboarding_completed_at: null,
    lifecycle_state: "active",
    created_by_user_id: "user-1",
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

function buildSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "session-1",
    workspace_id: "ws-1",
    project_id: null,
    active_capability_key: null,
    active_skill_id: null,
    execution_id: null,
    execution_status: null,
    channel_kind: "desktop",
    session_state: "active",
    title: "Conversation",
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

function buildAssistantThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "assistant-thread-1",
    title: "Assistant",
    summary: null,
    status: "active",
    lifecycle_state: "active",
    active_execution_id: null,
    execution_status: null,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

function buildMessage(overrides: Partial<SessionMessage> & Pick<SessionMessage, "id" | "role" | "content_markdown">): SessionMessage {
  return {
    id: overrides.id,
    session_id: overrides.session_id ?? "session-1",
    parent_message_id: overrides.parent_message_id ?? null,
    role: overrides.role,
    message_kind: overrides.message_kind ?? "chat",
    content_markdown: overrides.content_markdown,
    token_estimate: overrides.token_estimate ?? 0,
    is_hidden: overrides.is_hidden ?? false,
    attachments: overrides.attachments ?? [],
    created_at: overrides.created_at ?? "2026-05-07T00:00:00.000Z",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
    },
  );
}
