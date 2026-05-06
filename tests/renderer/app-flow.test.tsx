import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/renderer/App";

type StorageSnapshot = {
  language: "ru" | "en" | null;
  isAuthenticated: boolean;
  themeMode?: "dark" | "light" | null;
  apiBaseUrl?: string | null;
  devModeEnabled?: boolean;
};

const storage = {
  getAppState: vi.fn<() => Promise<StorageSnapshot | null>>(),
  setAppState: vi.fn<(value: Partial<StorageSnapshot>) => Promise<StorageSnapshot>>(),
  clearAppState: vi.fn<() => Promise<void>>(),
};

const devtools = {
  open: vi.fn<() => Promise<{ ok: boolean; error?: string | null }>>(),
};

declare global {
  interface Window {
    saAgent?: {
      storage: typeof storage;
      devtools?: typeof devtools;
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
    storage.clearAppState.mockImplementation(async () => {
      currentState = { language: null, isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    });
    devtools.open.mockResolvedValue({ ok: true });
    window.saAgent = { storage, devtools };
    document.documentElement.lang = "en";
    window.localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
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

  it("falls back to default state when bootstrap storage fails", async () => {
    storage.getAppState.mockRejectedValueOnce(new Error("bridge failed"));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Choose your language" })).toBeTruthy();
  });

  it("stays usable when persisting language fails", async () => {
    storage.setAppState.mockRejectedValueOnce(new Error("write failed"));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Choose your language" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Русский" }));

    expect(await screen.findByRole("heading", { name: "Войти в SA-Agent" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("ru");
  });

  it("shows create-project empty state after auth when bootstrap workspace has no projects", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: true }));
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [], next_cursor: null });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(storage.setAppState).toHaveBeenCalledWith({ isAuthenticated: true });
    });

    expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create project" })).toBeTruthy();
    expect(screen.getByText("Projects own sessions, runtime context, and onboarding context.")).toBeTruthy();
  });

  it("creates the first project from the empty state and moves into project onboarding", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let projectListCallCount = 0;
    let projectMessages = [
      buildMessage({
        id: "project-assistant-1",
        session_id: "project-onboard-session",
        content_markdown: "What is this project about?",
      }),
    ];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: true }));
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects") && !init?.method) {
        projectListCallCount += 1;

        return jsonResponse({
          items: projectListCallCount === 1 ? [] : [buildProject({ onboarding_completed: false })],
          next_cursor: null,
        });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects") && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({
            key: "atlas",
            name: "Atlas",
            description: null,
          }),
        );

        return jsonResponse(
          buildProject({
            key: "atlas",
            name: "Atlas",
            description: null,
            onboarding_completed: false,
          }),
          201,
        );
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse(
          buildProjectRuntimeContext({
            project: buildProject({ onboarding_completed: false }),
          }),
        );
      }

      if (input.endsWith("/v1/sessions") && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({
            workspace_id: "ws-1",
            project_id: "p-1",
            skill_id: "project-onboard",
            skill_input: { locale: "en" },
            channel_kind: "desktop",
            resume_strategy: "new",
          }),
        );

        return jsonResponse(
          buildSession({
            id: "project-onboard-session",
            project_id: "p-1",
            active_skill_id: "project-onboard",
          }),
          201,
        );
      }

      if (input.endsWith("/v1/sessions/project-onboard-session/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as { content_markdown: string };
        expect(payload.content_markdown).toBe(
          "Start onboarding in English, ask the first question, and continue the dialog until completion.",
        );

        return sseResponse([
          {
            event: "message.accepted",
            data: {
              job_id: "job-project-onboard-start",
              session_id: "project-onboard-session",
              user_message_id: "hidden-project-start",
              assistant_message_id: "project-assistant-1",
            },
          },
          {
            event: "message.delta",
            data: {
              job_id: "job-project-onboard-start",
              session_id: "project-onboard-session",
              assistant_message_id: "project-assistant-1",
              delta: "What is this project about?",
            },
          },
          {
            event: "message.completed",
            data: {
              job_id: "job-project-onboard-start",
              session_id: "project-onboard-session",
              assistant_message_id: "project-assistant-1",
              content_markdown: "What is this project about?",
            },
          },
        ]);
      }

      if (input.endsWith("/v1/sessions/project-onboard-session/messages")) {
        return jsonResponse({
          items: [
            buildMessage({
              id: "hidden-project-start",
              session_id: "project-onboard-session",
              role: "user",
              is_hidden: true,
              content_markdown:
                "Start onboarding in English, ask the first question, and continue the dialog until completion.",
            }),
            ...projectMessages,
          ],
        });
      }

      if (input.endsWith("/v1/sessions/project-onboard-session")) {
        return jsonResponse(
          buildSession({
            id: "project-onboard-session",
            project_id: "p-1",
            active_skill_id: "project-onboard",
          }),
        );
      }

      if (input.endsWith("/v1/sessions/project-onboard-session/summaries")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/onboarding")) {
        return jsonResponse(buildProject({ onboarding_completed: true }));
      }

      if (input.endsWith("/v1/jobs")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/skills")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/context-items")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/documents")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/wiki-pages")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-1/memory/chunks")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/memory/search")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/templates")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/embedding-policy")) {
        return jsonResponse({});
      }

      if (input.endsWith("/v1/skill-runs")) {
        return jsonResponse({ job_id: "unused" }, 202);
      }

      if (input.includes("/v1/jobs/")) {
        return jsonResponse({ id: "unused", status: "completed" });
      }

      if (input.endsWith("/v1/projects/p-1/runtime-context")) {
        return jsonResponse(buildProjectRuntimeContext({ project: buildProject({ onboarding_completed: false }) }));
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Atlas" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and continue" }));

    expect(await screen.findByRole("heading", { name: "Atlas" })).toBeTruthy();
    expect(await screen.findByText("What is this project about?")).toBeTruthy();
    expect(screen.getAllByText("Atlas").length).toBeGreaterThan(0);
  });

  it("stops at user onboarding when the profile is incomplete", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    const onboardingQuestion = "What should I call you and which domain do you work in?";
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: false }));
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [], next_cursor: null });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      if (input.endsWith("/v1/sessions") && init?.method === "POST") {
        return jsonResponse(
          buildSession({
            id: "user-onboard-session",
            project_id: null,
            active_skill_id: "onboard",
          }),
          201,
        );
      }

      if (input.endsWith("/v1/sessions/user-onboard-session/messages") && init?.method === "POST") {
        return sseResponse([
          {
            event: "message.accepted",
            data: {
              job_id: "job-user-onboard-start",
              session_id: "user-onboard-session",
              user_message_id: "hidden-user-start",
              assistant_message_id: "user-assistant-1",
            },
          },
          {
            event: "message.completed",
            data: {
              job_id: "job-user-onboard-start",
              session_id: "user-onboard-session",
              assistant_message_id: "user-assistant-1",
              content_markdown: onboardingQuestion,
            },
          },
        ]);
      }

      if (input.endsWith("/v1/sessions/user-onboard-session")) {
        return jsonResponse(
          buildSession({
            id: "user-onboard-session",
            project_id: null,
            active_skill_id: "onboard",
          }),
        );
      }

      if (input.endsWith("/v1/sessions/user-onboard-session/messages")) {
        return jsonResponse({
          items: [
            buildMessage({
              id: "hidden-user-start",
              session_id: "user-onboard-session",
              role: "user",
              is_hidden: true,
              content_markdown:
                "Start onboarding in English, ask the first question, and continue the dialog until completion.",
            }),
            buildMessage({
              id: "user-assistant-1",
              session_id: "user-onboard-session",
              content_markdown: onboardingQuestion,
            }),
          ],
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(storage.setAppState).toHaveBeenCalledWith({ isAuthenticated: true });
    });

    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Reply to the agent...")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/sessions$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("stops retrying user onboarding when backend exposes onboard as one-shot", async () => {
    currentState = { language: "ru", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let createSessionCalls = 0;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: false }));
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [], next_cursor: null });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      if (input.endsWith("/v1/skills")) {
        return jsonResponse({
          items: [
            {
              skill_id: "onboard",
              display_name: "Onboarding Wizard",
              interaction_mode: "one_shot",
            },
          ],
        });
      }

      if (input.endsWith("/v1/templates")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/sessions") && init?.method === "POST") {
        createSessionCalls += 1;
        return jsonResponse(
          {
            error: {
              code: "skill_not_interactive",
              message: "Skill onboard does not support interactive sessions.",
              status: 400,
            },
          },
          400,
        );
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Войти в SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText(/Backend сейчас публикует onboard как one-shot skill/)).toBeTruthy();
    await waitFor(() => {
      expect(createSessionCalls).toBeLessThanOrEqual(1);
    });
  });

  it("starts a dedicated onboarding skill session even when a regular global session already exists", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let onboardingPromptStarted = false;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: false }));
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [], next_cursor: null });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({
          items: [buildSession({ id: "regular-global-session", project_id: null, title: "General workspace chat" })],
        });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(
          buildGlobalRuntimeContext({
            active_session: buildSession({ id: "regular-global-session", project_id: null, title: "General workspace chat" }),
          }),
        );
      }

      if (input.endsWith("/v1/sessions") && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({
            workspace_id: "ws-1",
            skill_id: "onboard",
            skill_input: { locale: "en" },
            channel_kind: "desktop",
            resume_strategy: "new",
          }),
        );

        return jsonResponse(
          buildSession({
            id: "user-onboard-session",
            project_id: null,
            active_skill_id: "onboard",
          }),
          201,
        );
      }

      if (input.endsWith("/v1/sessions/user-onboard-session/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as { content_markdown: string };

        if (!onboardingPromptStarted) {
          onboardingPromptStarted = true;
          expect(payload.content_markdown).toBe(
            "Start onboarding in English, ask the first question, and continue the dialog until completion.",
          );

          return sseResponse([
            {
              event: "message.accepted",
              data: {
                job_id: "job-user-onboard-start",
                session_id: "user-onboard-session",
                user_message_id: "hidden-user-start",
                assistant_message_id: "user-assistant-1",
              },
            },
            {
              event: "message.completed",
              data: {
                job_id: "job-user-onboard-start",
                session_id: "user-onboard-session",
                assistant_message_id: "user-assistant-1",
                content_markdown: "What should I call you and which domain do you work in?",
              },
            },
          ]);
        }

        expect(payload.content_markdown).toBe("Call me Vakhtang.");
        return sseResponse([
          {
            event: "message.accepted",
            data: {
              job_id: "job-user-onboard-reply",
              session_id: "user-onboard-session",
              user_message_id: "user-message-2",
              assistant_message_id: "user-assistant-2",
            },
          },
          {
            event: "message.completed",
            data: {
              job_id: "job-user-onboard-reply",
              session_id: "user-onboard-session",
              assistant_message_id: "user-assistant-2",
              content_markdown: "Got it.",
            },
          },
        ]);
      }

      if (input.endsWith("/v1/sessions/user-onboard-session")) {
        return jsonResponse(
          buildSession({
            id: "user-onboard-session",
            project_id: null,
            active_skill_id: "onboard",
          }),
        );
      }

      if (input.endsWith("/v1/sessions/user-onboard-session/messages")) {
        return jsonResponse({
          items: [
            buildMessage({
              id: "hidden-user-start",
              session_id: "user-onboard-session",
              role: "user",
              is_hidden: true,
              content_markdown:
                "Start onboarding in English, ask the first question, and continue the dialog until completion.",
            }),
            buildMessage({
              id: "user-assistant-1",
              session_id: "user-onboard-session",
              content_markdown: "What should I call you and which domain do you work in?",
            }),
          ],
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("What should I call you and which domain do you work in?")).toBeTruthy();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/sessions$/),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            workspace_id: "ws-1",
            skill_id: "onboard",
            skill_input: { locale: "en" },
            channel_kind: "desktop",
            resume_strategy: "new",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/sessions\/user-onboard-session\/messages$/),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            content_markdown: "Start onboarding in English, ask the first question, and continue the dialog until completion.",
          }),
        }),
      );
    });
  });

  it("completes user onboarding and continues bootstrap with a refreshed profile", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let meCallCount = 0;
    let userOnboardingCommitted = false;
    let messages = [
      buildMessage({
        id: "user-assistant-1",
        session_id: "user-onboard-session",
        content_markdown: "What should I call you and which domain do you work in?",
      }),
    ];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        meCallCount += 1;
        return jsonResponse(
          buildProfile({
            preferred_user_name: userOnboardingCommitted ? "Emil" : null,
            preferred_agent_name: userOnboardingCommitted ? "Orbit" : null,
            activity_domain: userOnboardingCommitted ? "Product strategy" : null,
            onboarding_completed: userOnboardingCommitted,
            onboarding_completed_at: userOnboardingCommitted ? "2026-05-06T12:10:00.000Z" : null,
          }),
        );
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [], next_cursor: null });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      if (input.endsWith("/v1/sessions") && init?.method === "POST") {
        return jsonResponse(
          buildSession({
            id: "user-onboard-session",
            project_id: null,
            active_skill_id: "onboard",
          }),
          201,
        );
      }

      if (input.endsWith("/v1/sessions/user-onboard-session/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as { content_markdown: string };

        if (payload.content_markdown === "Start onboarding in English, ask the first question, and continue the dialog until completion.") {
          return sseResponse([
            {
              event: "message.accepted",
              data: {
                job_id: "job-user-onboard-start",
                session_id: "user-onboard-session",
                user_message_id: "hidden-user-start",
                assistant_message_id: "user-assistant-1",
              },
            },
            {
              event: "message.completed",
              data: {
                job_id: "job-user-onboard-start",
                session_id: "user-onboard-session",
                assistant_message_id: "user-assistant-1",
                content_markdown: "What should I call you and which domain do you work in?",
              },
            },
            {
              event: "skill.completed",
              data: {
                session_id: "user-onboard-session",
                skill_id: "onboard",
                completion_payload: {
                  name: "Emil",
                  agent_name: "Orbit",
                  domain: "Product strategy",
                  tone: "delivery",
                },
              },
            },
          ]);
        }
      }

      if (input.endsWith("/v1/sessions/user-onboard-session/messages")) {
        return jsonResponse({
          items: [
            buildMessage({
              id: "hidden-user-start",
              session_id: "user-onboard-session",
              role: "user",
              is_hidden: true,
              content_markdown:
                "Start onboarding in English, ask the first question, and continue the dialog until completion.",
            }),
            ...messages,
          ],
        });
      }

      if (input.endsWith("/v1/sessions/user-onboard-session")) {
        return jsonResponse(
          buildSession({
            id: "user-onboard-session",
            project_id: null,
            active_skill_id: "onboard",
            skill_state: userOnboardingCommitted
              ? {
                  status: "completed",
                  completion_payload: {
                    name: "Emil",
                    agent_name: "Orbit",
                    domain: "Product strategy",
                    tone: "delivery",
                  },
                }
              : {
                  status: "active",
                },
          }),
        );
      }

      if (input.endsWith("/v1/me/onboarding")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(
          JSON.stringify({
            skill_id: "onboard",
            payload: {
              name: "Emil",
              agent_name: "Orbit",
              domain: "Product strategy",
              tone: "delivery",
            },
          }),
        );

        userOnboardingCommitted = true;
        return jsonResponse(
          buildProfile({
            onboarding_skill_id: "onboard",
            onboarding_payload: {
              name: "Emil",
              agent_name: "Orbit",
              domain: "Product strategy",
              tone: "delivery",
            },
            preferred_user_name: "Emil",
            preferred_agent_name: "Orbit",
            activity_domain: "Product strategy",
            onboarding_completed: true,
            onboarding_completed_at: "2026-05-06T12:10:00.000Z",
          }),
        );
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeTruthy();
    expect(await screen.findByText("What should I call you and which domain do you work in?")).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/me\/onboarding$/),
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(meCallCount).toBeGreaterThanOrEqual(2);
    });
  });

  it("completes onboarding from JSON message fallback without waiting for SSE skill.completed", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let userOnboardingCommitted = false;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(
          buildProfile({
            onboarding_completed: userOnboardingCommitted,
            onboarding_completed_at: userOnboardingCommitted ? "2026-05-06T12:10:00.000Z" : null,
            preferred_user_name: userOnboardingCommitted ? "Emil" : null,
            preferred_agent_name: userOnboardingCommitted ? "Orbit" : null,
            activity_domain: userOnboardingCommitted ? "Product strategy" : null,
          }),
        );
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [], next_cursor: null });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      if (input.endsWith("/v1/sessions") && init?.method === "POST") {
        return jsonResponse(
          buildSession({
            id: "user-onboard-session",
            project_id: null,
            active_skill_id: "onboard",
          }),
          201,
        );
      }

      if (input.endsWith("/v1/sessions/user-onboard-session/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as { content_markdown: string };

        if (payload.content_markdown === "Start onboarding in English, ask the first question, and continue the dialog until completion.") {
          return jsonResponse({
            job_id: "job-user-onboard-start",
            status: "accepted",
            session_id: "user-onboard-session",
            assistant_message_id: "assistant-1",
            assistant_content_markdown: "What should I call you and which domain do you work in?",
            skill_id: "onboard",
            skill_status: "completed",
            skill_completion_payload: {
              name: "Emil",
              agent_name: "Orbit",
              domain: "Product strategy",
              tone: "delivery",
            },
          });
        }
      }

      if (input.endsWith("/v1/sessions/user-onboard-session/messages")) {
        return jsonResponse({
          items: [
            buildMessage({
              id: "assistant-1",
              session_id: "user-onboard-session",
              role: "assistant",
              content_markdown: "What should I call you and which domain do you work in?",
            }),
          ],
        });
      }

      if (input.endsWith("/v1/sessions/user-onboard-session")) {
        return jsonResponse(
          buildSession({
            id: "user-onboard-session",
            project_id: null,
            active_skill_id: "onboard",
            skill_state: userOnboardingCommitted
              ? {
                  status: "completed",
                  completion_payload: {
                    name: "Emil",
                    agent_name: "Orbit",
                    domain: "Product strategy",
                    tone: "delivery",
                  },
                }
              : { status: "active" },
          }),
        );
      }

      if (input.endsWith("/v1/me/onboarding")) {
        expect(init?.body).toBe(
          JSON.stringify({
            skill_id: "onboard",
            payload: {
              name: "Emil",
              agent_name: "Orbit",
              domain: "Product strategy",
              tone: "delivery",
            },
          }),
        );
        userOnboardingCommitted = true;
        return jsonResponse(
          buildProfile({
            onboarding_skill_id: "onboard",
            onboarding_payload: {
              name: "Emil",
              agent_name: "Orbit",
              domain: "Product strategy",
              tone: "delivery",
            },
            onboarding_completed: true,
            onboarding_completed_at: "2026-05-06T12:10:00.000Z",
            preferred_user_name: "Emil",
            preferred_agent_name: "Orbit",
            activity_domain: "Product strategy",
          }),
        );
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/me\/onboarding$/),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("recovers completed onboarding from session skill_state after restart", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let userOnboardingCommitted = false;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(
          buildProfile({
            onboarding_completed: userOnboardingCommitted,
            onboarding_completed_at: userOnboardingCommitted ? "2026-05-06T12:10:00.000Z" : null,
          }),
        );
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [], next_cursor: null });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({
          items: [
            buildSession({
              id: "user-onboard-session",
              project_id: null,
              active_skill_id: "onboard",
              skill_state: {
                status: "completed",
                completion_payload: {
                  name: "Emil",
                  agent_name: "Orbit",
                  domain: "Product strategy",
                },
              },
            }),
          ],
        });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      if (input.endsWith("/v1/me/onboarding")) {
        userOnboardingCommitted = true;
        return jsonResponse(
          buildProfile({
            onboarding_skill_id: "onboard",
            onboarding_payload: {
              name: "Emil",
              agent_name: "Orbit",
              domain: "Product strategy",
            },
            onboarding_completed: true,
            onboarding_completed_at: "2026-05-06T12:10:00.000Z",
            preferred_user_name: "Emil",
            preferred_agent_name: "Orbit",
            activity_domain: "Product strategy",
          }),
        );
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/me\/onboarding$/),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows a no-accessible-workspaces message when bootstrap returns an empty workspace list", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/me")) {
        return new Response(
          JSON.stringify({
            user_id: "demo-user-1",
            email: "demo@example.com",
            display_name: "Demo User",
            preferred_user_name: null,
            preferred_agent_name: null,
            activity_domain: null,
            onboarding_completed: true,
            onboarding_completed_at: null,
            created_at: "2026-05-06T12:00:00.000Z",
            updated_at: "2026-05-06T12:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      if (input.endsWith("/v1/workspaces")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "No accessible workspaces" })).toBeTruthy();
    expect(screen.getByText("This account does not currently have a workspace available in SA-Agent.")).toBeTruthy();
  });

  it("recovers from an empty cached workspace list after retry", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let releaseFirstWorkspaceFetch: (() => void) | null = null;
    const firstWorkspaceFetch = new Promise<Response>((resolve) => {
      releaseFirstWorkspaceFetch = () => {
        resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "ws-1",
                  name: "AST Product Team",
                  slug: "ast-product-team",
                  created_by_user_id: "demo-user-1",
                  created_at: "2026-05-06T12:00:00.000Z",
                  updated_at: "2026-05-06T12:00:00.000Z",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      };
    });
    let workspaceFetchCount = 0;

    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/me")) {
        return new Response(
          JSON.stringify({
            user_id: "demo-user-1",
            email: "demo@example.com",
            display_name: "Demo User",
            preferred_user_name: null,
            preferred_agent_name: null,
            activity_domain: null,
            onboarding_completed: true,
            onboarding_completed_at: null,
            created_at: "2026-05-06T12:00:00.000Z",
            updated_at: "2026-05-06T12:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      if (input.endsWith("/v1/workspaces")) {
        workspaceFetchCount += 1;

        if (workspaceFetchCount === 1) {
          return firstWorkspaceFetch;
        }

        return new Response(
          JSON.stringify({
            items: [
              {
                id: "ws-1",
                name: "AST Product Team",
                slug: "ast-product-team",
                created_by_user_id: "demo-user-1",
                created_at: "2026-05-06T12:00:00.000Z",
                updated_at: "2026-05-06T12:00:00.000Z",
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200 });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    window.localStorage.setItem(
      "sa-agent.cache.workspaces",
      JSON.stringify({
        data: [],
        fetchedAt: new Date().toISOString(),
      }),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "No accessible workspaces" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry bootstrap" }));

    releaseFirstWorkspaceFetch?.();

    expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeTruthy();
    expect(workspaceFetchCount).toBeGreaterThanOrEqual(2);
    expect(readWorkspaceCache()).toEqual({
      data: [
        {
          id: "ws-1",
          name: "AST Product Team",
          slug: "ast-product-team",
          created_by_user_id: "demo-user-1",
          created_at: "2026-05-06T12:00:00.000Z",
          updated_at: "2026-05-06T12:00:00.000Z",
        },
      ],
      fetchedAt: expect.any(String),
    });
  });

  it("shows a real bootstrap failure when retry force refresh fails against cached empty workspaces", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/me")) {
        return new Response(
          JSON.stringify({
            user_id: "demo-user-1",
            email: "demo@example.com",
            display_name: "Demo User",
            preferred_user_name: null,
            preferred_agent_name: null,
            activity_domain: null,
            onboarding_completed: true,
            onboarding_completed_at: null,
            created_at: "2026-05-06T12:00:00.000Z",
            updated_at: "2026-05-06T12:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      if (input.endsWith("/v1/workspaces")) {
        throw new Error("backend down");
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    window.localStorage.setItem(
      "sa-agent.cache.workspaces",
      JSON.stringify({
        data: [],
        fetchedAt: new Date().toISOString(),
      }),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "No accessible workspaces" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry bootstrap" }));

    expect(await screen.findByRole("heading", { name: "Workspace bootstrap failed" })).toBeTruthy();
    expect(
      screen.getByText("The desktop app could not reach bootstrap data from the backend."),
    ).toBeTruthy();
  });

  it("treats stale cached empty workspaces plus backend failure as a request failure", async () => {
    currentState = { language: "en", isAuthenticated: false };
    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/me")) {
        return new Response(
          JSON.stringify({
            user_id: "demo-user-1",
            email: "demo@example.com",
            display_name: "Demo User",
            preferred_user_name: null,
            preferred_agent_name: null,
            activity_domain: null,
            onboarding_completed: true,
            onboarding_completed_at: null,
            created_at: "2026-05-06T12:00:00.000Z",
            updated_at: "2026-05-06T12:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      if (input.endsWith("/v1/workspaces")) {
        throw new Error("backend down");
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    window.localStorage.setItem(
      "sa-agent.cache.workspaces",
      JSON.stringify({
        data: [],
        fetchedAt: new Date(Date.now() - 300_000).toISOString(),
      }),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Workspace bootstrap failed" })).toBeTruthy();
    expect(
      screen.getByText("The desktop app could not reach bootstrap data from the backend."),
    ).toBeTruthy();
  });

  it("keeps the user in project onboarding when canonical project onboarding save fails", async () => {
    currentState = { language: "en", isAuthenticated: false };
    let messages = [
      buildMessage({
        id: "project-assistant-1",
        session_id: "project-onboard-session",
        content_markdown: "Tell me the domain and main focus for this project.",
      }),
    ];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: true }));
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({ items: [buildProject({ onboarding_completed: false })] });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse(
          buildProjectRuntimeContext({
            project: buildProject({ onboarding_completed: false }),
          }),
        );
      }

      if (input.endsWith("/v1/sessions") && init?.method === "POST") {
        return jsonResponse(
          buildSession({
            id: "project-onboard-session",
            project_id: "p-1",
            active_skill_id: "project-onboard",
          }),
          201,
        );
      }

      if (input.endsWith("/v1/sessions/project-onboard-session/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as { content_markdown: string };

        if (payload.content_markdown === "Start onboarding in English, ask the first question, and continue the dialog until completion.") {
          return sseResponse([
            {
              event: "message.accepted",
              data: {
                job_id: "project-onboard-start",
                session_id: "project-onboard-session",
                user_message_id: "hidden-project-start",
                assistant_message_id: "project-assistant-1",
              },
            },
            {
              event: "message.completed",
              data: {
                job_id: "project-onboard-start",
                session_id: "project-onboard-session",
                assistant_message_id: "project-assistant-1",
                content_markdown: "Tell me the domain and main focus for this project.",
              },
            },
            {
              event: "skill.completed",
              data: {
                session_id: "project-onboard-session",
                skill_id: "project-onboard",
                completion_payload: {
                  name: "Emil",
                  agent_name: "Orbit",
                  domain: "Fintech",
                },
              },
            },
          ]);
        }
      }

      if (input.endsWith("/v1/sessions/project-onboard-session/messages")) {
        return jsonResponse({
          items: [
            buildMessage({
              id: "hidden-project-start",
              session_id: "project-onboard-session",
              role: "user",
              is_hidden: true,
              content_markdown:
                "Start onboarding in English, ask the first question, and continue the dialog until completion.",
            }),
            ...messages,
          ],
        });
      }

      if (input.endsWith("/v1/sessions/project-onboard-session")) {
        return jsonResponse({
          ...buildSession({
            id: "project-onboard-session",
            project_id: "p-1",
            active_skill_id: "project-onboard",
          }),
        });
      }

      if (input.endsWith("/v1/projects/p-1/onboarding")) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Project onboarding save failed.",
            },
          }),
          { status: 500 },
        );
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Atlas" })).toBeTruthy();
    expect(await screen.findByText("Tell me the domain and main focus for this project.")).toBeTruthy();

    expect(await screen.findByText("Project onboarding save failed.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Atlas" })).toBeTruthy();
  });

  it("renders the workspace shell after both onboarding flows are complete", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };

    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: true }));
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({
          items: [
            buildProject({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
          ],
        });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({
          items: [buildSession({ id: "global-session-1", project_id: null, title: "Workspace onboarding recap" })],
        });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(
          buildGlobalRuntimeContext({
            viewer_profile: buildProfile({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
          }),
        );
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse({
          items: [
            buildSession({ id: "session-1", title: "Daily sync", lifecycle_state: "active" }),
            buildSession({ id: "session-2", title: "Backlog review", lifecycle_state: "idle" }),
          ],
        });
      }

      if (input.endsWith("/v1/sessions/session-1/messages")) {
        return jsonResponse({
          items: [
            buildMessage({
              session_id: "session-1",
              content_markdown: "## Summary\n- First point\n- Second point",
            }),
          ],
        });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse(
          buildProjectRuntimeContext({
            project: buildProject({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
            viewer_profile: buildProfile({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
          }),
        );
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findAllByRole("heading", { name: "Atlas" })).length).toBeGreaterThan(0);
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText("Sessions")).toBeTruthy();
    expect(screen.getByText("Daily sync")).toBeTruthy();
    expect(screen.getByText("Runtime context")).toBeTruthy();
    expect(screen.getByText("Emil")).toBeTruthy();
    expect(screen.getByText("Orbit")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New project" })).toBeTruthy();
    expect(screen.getByLabelText("Select skill")).toBeTruthy();
    expect(screen.getByLabelText("Select template")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeTruthy();
    expect(screen.getByText("First point")).toBeTruthy();
  });

  it("creates a new project from the workspace shell and switches bootstrap into it", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let projectListCallCount = 0;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: true }));
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects") && !init?.method) {
        projectListCallCount += 1;

        return jsonResponse({
          items:
            projectListCallCount === 1
              ? [
                  buildProject({
                    id: "p-1",
                    key: "atlas",
                    name: "Atlas",
                    onboarding_completed: true,
                    preferred_user_name: "Emil",
                    preferred_agent_name: "Orbit",
                    activity_domain: "Product strategy",
                  }),
                ]
              : [
                  buildProject({
                    id: "p-1",
                    key: "atlas",
                    name: "Atlas",
                    onboarding_completed: true,
                    preferred_user_name: "Emil",
                    preferred_agent_name: "Orbit",
                    activity_domain: "Product strategy",
                  }),
                  buildProject({
                    id: "p-2",
                    key: "beta",
                    name: "Beta",
                    onboarding_completed: false,
                  }),
                ],
        });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects") && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({
            key: "beta",
            name: "Beta",
            description: null,
          }),
        );

        return jsonResponse(
          buildProject({
            id: "p-2",
            key: "beta",
            name: "Beta",
            description: null,
            onboarding_completed: false,
          }),
          201,
        );
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(
          buildGlobalRuntimeContext({
            viewer_profile: buildProfile({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
          }),
        );
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse({ items: [buildSession({ id: "session-1", title: "Daily sync", project_id: "p-1" })] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse(
          buildProjectRuntimeContext({
            project: buildProject({
              id: "p-1",
              key: "atlas",
              name: "Atlas",
              onboarding_completed: true,
            }),
            viewer_profile: buildProfile({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
          }),
        );
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-2")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1&project_id=p-2")) {
        return jsonResponse(
          buildProjectRuntimeContext({
            project: buildProject({
              id: "p-2",
              key: "beta",
              name: "Beta",
              onboarding_completed: false,
            }),
            viewer_profile: buildProfile({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
          }),
        );
      }

      if (input.endsWith("/v1/skills")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/templates")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/embedding-policy")) {
        return jsonResponse({
          model_id: "intfloat/multilingual-e5-large",
          dimensions: 1024,
          embedding_version: "mvp-v1",
          chunking_version: "mvp-chunk-v1",
          normalization: true,
          prefix_policy: "e5",
        });
      }

      if (input.endsWith("/v1/projects/p-1/documents")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/projects/p-2/documents")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/sessions") && init?.method === "POST") {
        return jsonResponse(
          buildSession({
            id: "project-onboard-session",
            project_id: "p-2",
            active_skill_id: "project-onboard",
          }),
          201,
        );
      }

      if (input.endsWith("/v1/sessions/project-onboard-session/messages") && init?.method === "POST") {
        return sseResponse([
          {
            event: "message.accepted",
            data: {
              job_id: "job-project-onboard-start",
              session_id: "project-onboard-session",
              user_message_id: "hidden-project-start",
              assistant_message_id: "project-assistant-1",
            },
          },
          {
            event: "message.completed",
            data: {
              job_id: "job-project-onboard-start",
              session_id: "project-onboard-session",
              assistant_message_id: "project-assistant-1",
              content_markdown: "What is this project about?",
            },
          },
        ]);
      }

      if (input.endsWith("/v1/sessions/project-onboard-session/messages")) {
        return jsonResponse({
          items: [
            buildMessage({
              id: "hidden-project-start",
              session_id: "project-onboard-session",
              role: "user",
              is_hidden: true,
              content_markdown:
                "Start onboarding in English, ask the first question, and continue the dialog until completion.",
            }),
            buildMessage({
              id: "project-assistant-1",
              session_id: "project-onboard-session",
              content_markdown: "What is this project about?",
            }),
          ],
        });
      }

      if (input.endsWith("/v1/sessions/project-onboard-session")) {
        return jsonResponse(
          buildSession({
            id: "project-onboard-session",
            project_id: "p-2",
            active_skill_id: "project-onboard",
          }),
        );
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findAllByRole("heading", { name: "Atlas" })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Beta" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and continue" }));

    expect(await screen.findByRole("heading", { name: "Beta" })).toBeTruthy();
    expect(await screen.findByText("What is this project about?")).toBeTruthy();
  });

  it("applies a selected one-shot skill from the chat composer", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return jsonResponse(buildProfile({ onboarding_completed: true }));
      }

      if (input.endsWith("/v1/workspaces")) {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return jsonResponse({
          items: [
            buildProject({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
          ],
        });
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1&project_id=p-1")) {
        return jsonResponse(
          buildProjectRuntimeContext({
            project: buildProject({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
            viewer_profile: buildProfile({
              onboarding_completed: true,
              preferred_user_name: "Emil",
              preferred_agent_name: "Orbit",
              activity_domain: "Product strategy",
            }),
          }),
        );
      }

      if (input.endsWith("/v1/skills")) {
        return jsonResponse({
          items: [
            {
              skill_id: "brd",
              display_name: "BRD",
              interaction_mode: "one_shot",
            },
          ],
        });
      }

      if (input.endsWith("/v1/skill-runs")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(
          JSON.stringify({
            workspace_id: "ws-1",
            project_id: "p-1",
            skill_id: "brd",
            input_payload: {
              message: "Generate BRD outline",
              brief: "Generate BRD outline",
              prompt: "Generate BRD outline",
              text: "Generate BRD outline",
            },
          }),
        );

        return jsonResponse({ job_id: "skill-job-1" }, 202);
      }

      if (input.endsWith("/v1/jobs/skill-job-1")) {
        return jsonResponse({
          id: "skill-job-1",
          status: "completed",
          result_resource_kind: "document",
          result_resource_id: "doc-1",
        });
      }

      if (input.endsWith("/v1/templates")) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith("/v1/embedding-policy")) {
        return jsonResponse({
          model_id: "intfloat/multilingual-e5-large",
          dimensions: 1024,
          embedding_version: "mvp-v1",
          chunking_version: "mvp-chunk-v1",
          normalization: true,
          prefix_policy: "e5",
        });
      }

      if (input.endsWith("/v1/projects/p-1/documents")) {
        return jsonResponse({ items: [] });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findAllByRole("heading", { name: "Atlas" })).length).toBeGreaterThan(0);
    expect(await screen.findByRole("option", { name: "BRD" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Select skill"), { target: { value: "brd" } });
    fireEvent.change(screen.getByPlaceholderText("Continue the project conversation..."), {
      target: { value: "Generate BRD outline" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send|Apply skill/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/skill-runs$/),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows the user message immediately and disables send while waiting for the assistant", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let resolveMessageResponse: ((response: Response) => void) | null = null;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return Promise.resolve(jsonResponse(buildProfile({ onboarding_completed: true })));
      }

      if (input.endsWith("/v1/workspaces")) {
        return Promise.resolve(jsonResponse({ items: [buildWorkspace()] }));
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              buildProject({
                onboarding_completed: true,
                preferred_user_name: "Emil",
                preferred_agent_name: "Orbit",
                activity_domain: "Product strategy",
              }),
            ],
          }),
        );
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return Promise.resolve(jsonResponse(buildGlobalRuntimeContext()));
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1")) {
        return Promise.resolve(jsonResponse({ items: [buildSession({ id: "session-1", project_id: "p-1", title: "Daily sync" })] }));
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1&project_id=p-1")) {
        return Promise.resolve(
          jsonResponse(
            buildProjectRuntimeContext({
              project: buildProject({ onboarding_completed: true }),
            }),
          ),
        );
      }

      if (input.endsWith("/v1/skills")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/templates")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/projects/p-1/documents")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/sessions/session-1/messages") && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveMessageResponse = resolve;
        });
      }

      if (input.endsWith("/v1/sessions/session-1/messages")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              buildMessage({
                session_id: "session-1",
                role: "user",
                content_markdown: "Need a short summary.",
              }),
              buildMessage({
                id: "assistant-1",
                session_id: "session-1",
                role: "assistant",
                content_markdown: "Here is a short summary.",
              }),
            ],
          }),
        );
      }

      if (input.endsWith("/v1/sessions/session-1")) {
        return Promise.resolve(jsonResponse(buildSession({ id: "session-1", project_id: "p-1", title: "Daily sync" })));
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findAllByRole("heading", { name: "Atlas" })).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Continue the project conversation..."), {
      target: { value: "Need a short summary." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getAllByText("Need a short summary.").length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);

    resolveMessageResponse?.(
      sseResponse([
        {
          event: "message.accepted",
          data: {
            job_id: "job-1",
            session_id: "session-1",
            user_message_id: "user-1",
            assistant_message_id: "assistant-1",
          },
        },
        {
          event: "message.completed",
          data: {
            job_id: "job-1",
            session_id: "session-1",
            assistant_message_id: "assistant-1",
            content_markdown: "Here is a short summary.",
          },
        },
      ]),
    );

    expect(await screen.findByText("Here is a short summary.")).toBeTruthy();
  });

  it("shows a loader before the first stream chunk and renders assistant deltas incrementally", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let enqueueChunk: ((value: Uint8Array) => void) | null = null;
    let closeStream: (() => void) | null = null;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return Promise.resolve(jsonResponse(buildProfile({ onboarding_completed: true })));
      }

      if (input.endsWith("/v1/workspaces")) {
        return Promise.resolve(jsonResponse({ items: [buildWorkspace()] }));
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return Promise.resolve(
          jsonResponse({ items: [buildProject({ onboarding_completed: true, name: "Atlas" })], next_cursor: null }),
        );
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return Promise.resolve(jsonResponse(buildGlobalRuntimeContext()));
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1")) {
        return Promise.resolve(
          jsonResponse({ items: [buildSession({ id: "session-1", project_id: "p-1", title: "Daily sync" })] }),
        );
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1&project_id=p-1")) {
        return Promise.resolve(
          jsonResponse(
            buildProjectRuntimeContext({
              project: buildProject({ onboarding_completed: true }),
              active_session: buildSession({ id: "session-1", project_id: "p-1", title: "Daily sync" }),
            }),
          ),
        );
      }

      if (input.endsWith("/v1/skills")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/templates")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/projects/p-1/documents")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/sessions/session-1/messages") && init?.method === "POST") {
        const body = new ReadableStream({
          start(controller) {
            enqueueChunk = (value) => controller.enqueue(value);
            closeStream = () => controller.close();
          },
        });

        return Promise.resolve(
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        );
      }

      if (input.endsWith("/v1/sessions/session-1/messages")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              buildMessage({
                session_id: "session-1",
                role: "user",
                content_markdown: "Need a short summary.",
              }),
              buildMessage({
                id: "assistant-1",
                session_id: "session-1",
                role: "assistant",
                content_markdown: "Here is a short summary.",
              }),
            ],
          }),
        );
      }

      if (input.endsWith("/v1/sessions/session-1")) {
        return Promise.resolve(jsonResponse(buildSession({ id: "session-1", project_id: "p-1", title: "Daily sync" })));
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findAllByRole("heading", { name: "Atlas" })).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Continue the project conversation..."), {
      target: { value: "Need a short summary." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByLabelText("Assistant is streaming")).toBeTruthy();

    const encoder = new TextEncoder();
    enqueueChunk?.(
      encoder.encode(
        `event: message.accepted\ndata: ${JSON.stringify({
          job_id: "job-1",
          session_id: "session-1",
          user_message_id: "user-1",
          assistant_message_id: "assistant-1",
        })}\n\n`,
      ),
    );
    enqueueChunk?.(
      encoder.encode(
        `event: message.delta\ndata: ${JSON.stringify({
          job_id: "job-1",
          session_id: "session-1",
          assistant_message_id: "assistant-1",
          delta: "Here is",
        })}\n\n`,
      ),
    );

    expect(await screen.findByText("Here is")).toBeTruthy();

    enqueueChunk?.(
      encoder.encode(
        `event: message.delta\ndata: ${JSON.stringify({
          job_id: "job-1",
          session_id: "session-1",
          assistant_message_id: "assistant-1",
          delta: " a short summary.",
        })}\n\n`,
      ),
    );
    enqueueChunk?.(
      encoder.encode(
        `event: message.completed\ndata: ${JSON.stringify({
          job_id: "job-1",
          session_id: "session-1",
          assistant_message_id: "assistant-1",
          content_markdown: "Here is a short summary.",
        })}\n\n`,
      ),
    );
    closeStream?.();

    expect(await screen.findByText("Here is a short summary.")).toBeTruthy();
  });

  it("reveals the assistant reply progressively when backend sends only message.completed", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    let resolveMessageResponse: ((response: Response) => void) | null = null;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/v1/me")) {
        return Promise.resolve(jsonResponse(buildProfile({ onboarding_completed: true })));
      }

      if (input.endsWith("/v1/workspaces")) {
        return Promise.resolve(jsonResponse({ items: [buildWorkspace()] }));
      }

      if (input.endsWith("/v1/workspaces/ws-1/projects")) {
        return Promise.resolve(
          jsonResponse({ items: [buildProject({ onboarding_completed: true, name: "Atlas" })], next_cursor: null }),
        );
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1")) {
        return Promise.resolve(jsonResponse(buildGlobalRuntimeContext()));
      }

      if (input.endsWith("/v1/sessions?workspace_id=ws-1&project_id=p-1")) {
        return Promise.resolve(
          jsonResponse({ items: [buildSession({ id: "session-1", project_id: "p-1", title: "Daily sync" })] }),
        );
      }

      if (input.endsWith("/v1/runtime-context?workspace_id=ws-1&project_id=p-1")) {
        return Promise.resolve(
          jsonResponse(
            buildProjectRuntimeContext({
              project: buildProject({ onboarding_completed: true }),
              active_session: buildSession({ id: "session-1", project_id: "p-1", title: "Daily sync" }),
            }),
          ),
        );
      }

      if (input.endsWith("/v1/skills")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/templates")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/projects/p-1/documents")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (input.endsWith("/v1/sessions/session-1/messages") && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveMessageResponse = resolve;
        });
      }

      if (input.endsWith("/v1/sessions/session-1/messages")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              buildMessage({
                session_id: "session-1",
                role: "user",
                content_markdown: "Need a short summary.",
              }),
              buildMessage({
                id: "assistant-1",
                session_id: "session-1",
                role: "assistant",
                content_markdown: "Here is a short summary.",
              }),
            ],
          }),
        );
      }

      if (input.endsWith("/v1/sessions/session-1")) {
        return Promise.resolve(jsonResponse(buildSession({ id: "session-1", project_id: "p-1", title: "Daily sync" })));
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findAllByRole("heading", { name: "Atlas" })).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Continue the project conversation..."), {
      target: { value: "Need a short summary." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByLabelText("Assistant is streaming")).toBeTruthy();

    resolveMessageResponse?.(
      sseResponse([
        {
          event: "message.accepted",
          data: {
            job_id: "job-1",
            session_id: "session-1",
            user_message_id: "user-1",
            assistant_message_id: "assistant-1",
          },
        },
        {
          event: "message.completed",
          data: {
            job_id: "job-1",
            session_id: "session-1",
            assistant_message_id: "assistant-1",
            content_markdown: "Here is a short summary.",
          },
        },
      ]),
    );

    expect(await screen.findByText("Here is a short summary.")).toBeTruthy();
  }, 10000);

  it("opens settings from bootstrap error, saves API base URL, and retries bootstrap", async () => {
    currentState = { language: "en", isAuthenticated: true, apiBaseUrl: null, devModeEnabled: true };
    let meRequestCount = 0;

    fetchMock.mockImplementation(async (input: string) => {
      if (input === "http://127.0.0.1:3000/v1/me") {
        throw new Error("connect ECONNREFUSED 127.0.0.1:3000");
      }

      if (input === "http://127.0.0.1:3001/v1/me") {
        meRequestCount += 1;
        return jsonResponse(buildProfile({ onboarding_completed: true }));
      }

      if (input === "http://127.0.0.1:3001/v1/workspaces") {
        return jsonResponse({ items: [buildWorkspace()] });
      }

      if (input === "http://127.0.0.1:3001/v1/workspaces/ws-1/projects") {
        return jsonResponse({ items: [], next_cursor: null });
      }

      if (input === "http://127.0.0.1:3001/v1/sessions?workspace_id=ws-1") {
        return jsonResponse({ items: [] });
      }

      if (input === "http://127.0.0.1:3001/v1/runtime-context?workspace_id=ws-1") {
        return jsonResponse(buildGlobalRuntimeContext());
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Workspace bootstrap failed" })).toBeTruthy();
    expect(screen.getByText(/API: http:\/\/127\.0\.0\.1:3000/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.change(screen.getByLabelText("API base URL"), { target: { value: "http://127.0.0.1:3001" } });
    fireEvent.click(screen.getByRole("button", { name: "Save API URL" }));

    expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeTruthy();
    expect(storage.setAppState).toHaveBeenCalledWith({ apiBaseUrl: "http://127.0.0.1:3001" });
    expect(meRequestCount).toBe(1);
  });

  it("resets local state from settings and returns to language setup", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: "http://127.0.0.1:3001", devModeEnabled: true };
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === "http://127.0.0.1:3000/v1/dev/reset" || input === "http://127.0.0.1:3001/v1/dev/reset") {
        expect(init?.method).toBe("POST");
        return jsonResponse({ ok: true });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset local state" }));

    await waitFor(() => {
      expect(storage.clearAppState).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByRole("heading", { name: "Choose your language" })).toBeTruthy();
  });

  it("changes theme mode from settings and updates root theme variables", async () => {
    currentState = {
      language: "en",
      isAuthenticated: false,
      themeMode: "dark",
      apiBaseUrl: "http://127.0.0.1:3001",
      devModeEnabled: true,
    };

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    const root = document.querySelector("main");
    expect(root?.style.getPropertyValue("--theme-color-panel-start")).toBe("#0e1117");

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Light" }));

    await waitFor(() => {
      expect(storage.setAppState).toHaveBeenCalledWith({ themeMode: "light" });
    });

    await waitFor(() => {
      expect(root?.style.getPropertyValue("--theme-color-panel-start")).toBe("#ffffff");
      expect(document.documentElement.style.colorScheme).toBe("light");
    });
  });

  it("caches embedding policy across settings reopen within the same app session", async () => {
    currentState = {
      language: "en",
      isAuthenticated: false,
      themeMode: "dark",
      apiBaseUrl: "http://127.0.0.1:3001",
      devModeEnabled: true,
    };

    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/v1/embedding-policy")) {
        return jsonResponse({
          model_id: "intfloat/multilingual-e5-large",
          dimensions: 1024,
          embedding_version: "mvp-v1",
          chunking_version: "mvp-chunk-v1",
          normalization: true,
          prefix_policy: "e5",
        });
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(await screen.findByText("intfloat/multilingual-e5-large · 1024d")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("shows devtools open status in settings", async () => {
    currentState = { language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    devtools.open.mockResolvedValueOnce({ ok: true });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Open DevTools" }));

    await waitFor(() => {
      expect(devtools.open).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("DevTools opened.")).toBeTruthy();
  });
});

function readWorkspaceCache() {
  const rawValue = window.localStorage.getItem("sa-agent.cache.workspaces");
  const parsed = rawValue ? (JSON.parse(rawValue) as { data: unknown; fetchedAt: string }) : null;

  if (!parsed) {
    return null;
  }

  return {
    data: parsed.data,
    fetchedAt: parsed.fetchedAt,
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

function buildProfile(overrides?: Partial<Record<string, unknown>>) {
  return {
    user_id: "demo-user-1",
    email: "demo@example.com",
    display_name: "Demo User",
    preferred_user_name: null,
    preferred_agent_name: null,
    activity_domain: null,
    onboarding_completed: false,
    onboarding_completed_at: null,
    created_at: "2026-05-06T12:00:00.000Z",
    updated_at: "2026-05-06T12:00:00.000Z",
    ...overrides,
  };
}

function buildWorkspace(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "ws-1",
    name: "AST Product Team",
    slug: "ast-product-team",
    created_by_user_id: "demo-user-1",
    created_at: "2026-05-06T12:00:00.000Z",
    updated_at: "2026-05-06T12:00:00.000Z",
    ...overrides,
  };
}

function buildProject(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "p-1",
    workspace_id: "ws-1",
    key: "atlas",
    name: "Atlas",
    description: "First project",
    preferred_user_name: null,
    preferred_agent_name: null,
    activity_domain: null,
    onboarding_completed: false,
    onboarding_completed_at: null,
    lifecycle_state: "active",
    created_by_user_id: "demo-user-1",
    created_at: "2026-05-06T12:00:00.000Z",
    updated_at: "2026-05-06T12:00:00.000Z",
    ...overrides,
  };
}

function buildSession(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "session-1",
    workspace_id: "ws-1",
    project_id: "p-1",
    active_skill_id: null,
    skill_state: null,
    session_state: "active",
    title: "Untitled session",
    lifecycle_state: "idle",
    created_at: "2026-05-06T12:00:00.000Z",
    updated_at: "2026-05-06T12:00:00.000Z",
    ...overrides,
  };
}

function buildGlobalRuntimeContext(overrides?: Partial<Record<string, unknown>>) {
  return {
    workspace_id: "ws-1",
    viewer_profile: null,
    active_session: null,
    memory_highlights: [],
    ...overrides,
  };
}

function buildProjectRuntimeContext(overrides?: Partial<Record<string, unknown>>) {
  return {
    project: buildProject(),
    viewer_profile: null,
    active_session: null,
    context_items: [],
    memory_highlights: [],
    wiki_pages: [],
    ...overrides,
  };
}

function buildMessage(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "message-1",
    session_id: "session-1",
    parent_message_id: null,
    role: "assistant",
    message_kind: "chat",
    content_markdown: "Hello from SA-Agent.",
    token_estimate: 12,
    is_hidden: false,
    attachments: [],
    created_at: "2026-05-06T12:00:00.000Z",
    ...overrides,
  };
}

function sseResponse(events: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`),
        );
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
    },
  });
}
