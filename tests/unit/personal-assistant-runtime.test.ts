import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalAssistantRuntime } from "../../src/renderer/agent/personal-assistant-runtime";
import type { SessionMessage, ViewerProfile } from "../../src/renderer/lib/types";

describe("PersonalAssistantRuntime", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes onboarding through llm generation, MCP tool call, and a final llm answer", async () => {
    const mcpMethods: string[] = [];
    const llmBodies: Array<Record<string, unknown>> = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        llmBodies.push(payload);

        if (llmBodies.length === 1) {
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
                  },
                },
              },
            }),
          });
        }

        return jsonResponse({
          output_text: "Онбординг завершен. Профиль сохранен, и можно продолжать работу в рабочем пространстве.",
        });
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string; params?: Record<string, unknown> };
      mcpMethods.push(payload.method ?? "unknown");

      if (payload.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tools-list-1",
          result: {
            tools: [
              {
                name: "profile.complete_onboarding",
                description: "Complete onboarding",
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
            },
            isError: false,
          },
        });
      }

      throw new Error(`Unexpected MCP request: ${JSON.stringify(payload)}`);
    });

    const runtime = await PersonalAssistantRuntime.create({
      workspaceId: "ws-1",
      threadId: "assistant-thread-1",
      initialMessages: [
        buildMessage(
          "user",
          "Меня зовут Вахтанг, тебя буду звать Фрунзик. Я системный аналитик и предпочитаю общение коротко и по делу. Работаю с Python и PostgreSQL.",
        ),
      ],
      profile: buildProfile({ onboarding_completed: false }),
    });

    const result = await runtime.continueFromTranscript();

    expect(llmBodies).toHaveLength(2);
    expect(mcpMethods).toContain("tools/list");
    expect(mcpMethods).toContain("tools/call");
    expect(result.onboardingCompleted).toBe(true);
    expect(result.assistantText).toContain("Онбординг завершен");
  });

  it("creates a project through projects.create and injects active workspace_id into the tool payload", async () => {
    const calledToolNames: string[] = [];
    const llmBodies: Array<Record<string, unknown>> = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        llmBodies.push(payload);

        if (llmBodies.length === 1) {
          return jsonResponse({
            output_text: JSON.stringify({
              tool_call: {
                name: "projects.create",
                arguments: {
                  idempotency_key: "project-create-1",
                  payload: {
                    name: "Alpha Platform",
                    key: "AP",
                    description: "Создай новый проект \"Alpha Platform\" для координации работы аналитиков.",
                  },
                },
              },
            }),
          });
        }

        return jsonResponse({
          output_text: "Создал проект «Alpha Platform». Теперь могу помочь заполнить цели и контекст.",
        });
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string; params?: Record<string, unknown> };

      if (payload.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tools-list-1",
          result: {
            tools: [
              {
                name: "projects.create",
                description: "Create project",
                inputSchema: { type: "object" },
              },
            ],
          },
        });
      }

      if (payload.method === "tools/call") {
        calledToolNames.push(String(payload.params?.name ?? ""));
        expect(payload.params?.name).toBe("projects.create");
        expect(payload.params?.arguments).toMatchObject({
          payload: {
            workspace_id: "ws-1",
          },
        });
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tool-call-1",
          result: {
            content: [{ type: "text", text: "created" }],
            structuredContent: {
              project_id: "project-1",
            },
            isError: false,
          },
        });
      }

      throw new Error(`Unexpected MCP request: ${JSON.stringify(payload)}`);
    });

    const runtime = await PersonalAssistantRuntime.create({
      workspaceId: "ws-1",
      threadId: "assistant-thread-1",
      initialMessages: [
        buildMessage("user", "Создай новый проект \"Alpha Platform\" для координации работы аналитиков."),
      ],
      profile: buildProfile({ onboarding_completed: true }),
    });

    const result = await runtime.continueFromTranscript();

    expect(llmBodies).toHaveLength(2);
    expect(calledToolNames).toEqual(["projects.create"]);
    expect(result.projectCreated).toBe(true);
    expect(result.assistantText).toContain("Создал проект");
  });

  it("extracts tool_call from mixed prose plus json and hides raw tool payload from the final assistant answer", async () => {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const hasToolResult = messages.some((message) =>
          typeof message === "object"
          && message !== null
          && String((message as { content?: unknown }).content ?? "").includes("TOOL_RESULT"),
        );

        if (!hasToolResult) {
          return jsonResponse({
            output_text: [
              "Отлично, создаём проект.",
              JSON.stringify({
                tool_call: {
                  name: "projects.create",
                  arguments: {
                    idempotency_key: "project-create-2",
                    payload: {
                      name: "Agent Platform MVP",
                      key: "agent-platform-mvp",
                      description: "Коммерческая платформа для AI-агентов.",
                    },
                  },
                },
              }),
            ].join("\n\n"),
          });
        }

        return jsonResponse({
          output_text: "Проект создан. Теперь можно продолжать настройку контекста.",
        });
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string; params?: Record<string, unknown> };

      if (payload.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tools-list-1",
          result: {
            tools: [{ name: "projects.create", description: "Create project", inputSchema: { type: "object" } }],
          },
        });
      }

      if (payload.method === "tools/call") {
        expect(payload.params?.name).toBe("projects.create");
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tool-call-2",
          result: {
            content: [{ type: "text", text: "created" }],
            structuredContent: { project_id: "project-2" },
            isError: false,
          },
        });
      }

      throw new Error(`Unexpected request: ${JSON.stringify(payload)}`);
    });

    const runtime = await PersonalAssistantRuntime.create({
      workspaceId: "ws-1",
      threadId: "assistant-thread-1",
      initialMessages: [buildMessage("user", "Создай проект для платформы AI-агентов.")],
      profile: buildProfile({ onboarding_completed: true }),
    });

    const result = await runtime.continueFromTranscript();

    expect(result.assistantText).toBe("Проект создан. Теперь можно продолжать настройку контекста.");
    expect(result.assistantText).not.toContain('"tool_call"');
  });
});

function buildMessage(role: SessionMessage["role"], content: string): SessionMessage {
  return {
    id: `${role}-1`,
    session_id: "assistant-thread-1",
    parent_message_id: null,
    role,
    message_kind: "chat",
    content_markdown: content,
    token_estimate: 0,
    is_hidden: false,
    attachments: [],
    created_at: "2026-05-09T00:00:00.000Z",
  };
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
    created_at: "2026-05-09T00:00:00.000Z",
    updated_at: "2026-05-09T00:00:00.000Z",
    ...overrides,
  };
}

function jsonResponse(payload: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
  );
}
