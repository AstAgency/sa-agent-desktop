import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalAssistantRuntime } from "../../src/renderer/agent/personal-assistant-runtime";
import type { SessionMessage, ViewerProfile } from "../../src/renderer/lib/types";

describe("PersonalAssistantRuntime loop guards", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates profile context and omits profile tool-result noise from the next llm step", async () => {
    let llmRequestCount = 0;
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        llmRequestCount += 1;
        const payload = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
        if (llmRequestCount === 2) {
          expect(payload.messages?.[0]?.content).toContain('"display_name":"Вахтанг"');
          expect(JSON.stringify(payload.messages ?? [])).not.toContain("TOOL_RESULT backend.profile.update");
          return jsonResponse({ output_text: "Профиль сохранён. Продолжаем." });
        }
        return jsonResponse({ output_text: null, tool_calls: [{ id: "call-1", type: "function", name: "backend.profile.update", arguments: { payload: { display_name: "Вахтанг", preferred_agent_name: "Фрунзик" } } }] });
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (payload.method === "tools/list") return jsonResponse({ jsonrpc: "2.0", id: "tools-list-1", result: { tools: [{ name: "profile.update", description: "Update profile", inputSchema: { type: "object" } }] } });
      return jsonResponse({ jsonrpc: "2.0", id: "tool-call-1", result: { isError: false, content: [{ type: "text", text: "updated" }], structuredContent: { ok: true, result: { ...buildProfile(), display_name: "Вахтанг", preferred_agent_name: "Фрунзик" } } } });
    });

    const runtime = await PersonalAssistantRuntime.create({ workspaceId: "ws-1", threadId: "session-1", initialMessages: [buildMessage("user", "Сохрани моё имя и имя ассистента.")], profile: buildProfile() });
    const result = await runtime.continueFromTranscript();

    expect(llmRequestCount).toBe(2);
    expect(result.assistantText).toBe("Профиль сохранён. Продолжаем.");
  });

  it("uses client-owned idempotency and skips duplicate identical profile updates", async () => {
    const toolArguments: Array<Record<string, unknown>> = [];
    let llmRequestCount = 0;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        llmRequestCount += 1;
        if (llmRequestCount === 1) {
          return jsonResponse({ output_text: null, tool_calls: [{ id: "call-1", type: "function", name: "backend.profile.update", arguments: { idempotency_key: "model-key-1", payload: { display_name: "Вахтанг" } } }] });
        }
        return jsonResponse({ output_text: "Данные уже сохранены.", tool_calls: [{ id: "call-2", type: "function", name: "backend.profile.update", arguments: { idempotency_key: "model-key-2", payload: { display_name: "Вахтанг" } } }] });
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string; params?: { arguments?: Record<string, unknown> } };
      if (payload.method === "tools/list") return jsonResponse({ jsonrpc: "2.0", id: "tools-list-1", result: { tools: [{ name: "profile.update", description: "Update profile", inputSchema: { type: "object" } }] } });
      toolArguments.push(payload.params?.arguments ?? {});
      return jsonResponse({ jsonrpc: "2.0", id: "tool-call-1", result: { isError: false, content: [{ type: "text", text: "updated" }], structuredContent: { ok: true, result: { ...buildProfile(), display_name: "Вахтанг" } } } });
    });

    const runtime = await PersonalAssistantRuntime.create({ workspaceId: "ws-1", threadId: "session-1", initialMessages: [buildMessage("user", "Меня зовут Вахтанг.")], profile: buildProfile() });
    const result = await runtime.continueFromTranscript();

    expect(toolArguments).toHaveLength(1);
    expect(toolArguments[0]?.idempotency_key).not.toBe("model-key-1");
    expect(result.assistantText).toBe("Данные уже сохранены.");
  });

  it("injects workspace_id for snake_case projects_create and exposes workspace context to the model", async () => {
    const llmBodies: Array<Record<string, unknown>> = [];
    const toolArguments: Array<Record<string, unknown>> = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        llmBodies.push(payload);
        if (llmBodies.length === 1) {
          const messages = Array.isArray(payload.messages) ? payload.messages as Array<{ role?: string; content?: string }> : [];
          expect(messages[0]?.role).toBe("system");
          expect(messages[0]?.content).toContain('"workspace_id":"ws-1"');
          return jsonResponse({ output_text: null, tool_calls: [{ id: "call-1", type: "function", name: "backend.projects_create", arguments: { payload: { name: "AST Systems", key: "ast-systems" } } }] });
        }
        return jsonResponse({ output_text: "Проект создан." });
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string; params?: { arguments?: Record<string, unknown> } };
      if (payload.method === "tools/list") return jsonResponse({ jsonrpc: "2.0", id: "tools-list-1", result: { tools: [{ name: "projects_create", description: "Create project", inputSchema: { type: "object" } }] } });
      toolArguments.push(payload.params?.arguments ?? {});
      return jsonResponse({ jsonrpc: "2.0", id: "tool-call-1", result: { isError: false, content: [{ type: "text", text: "created" }], structuredContent: { ok: true, result: { project_id: "project-1" } } } });
    });

    const runtime = await PersonalAssistantRuntime.create({ workspaceId: "ws-1", threadId: "session-1", initialMessages: [buildMessage("user", "Создай проект AST Systems.")], profile: buildProfile({ onboarding_completed: true }) });
    const result = await runtime.continueFromTranscript();

    expect(toolArguments).toHaveLength(1);
    expect(toolArguments[0]).toMatchObject({ payload: { workspace_id: "ws-1", name: "AST Systems", key: "ast-systems" } });
    expect(result.assistantText).toBe("Проект создан.");
  });
});

function buildMessage(role: SessionMessage["role"], content: string): SessionMessage {
  return { id: `${role}-1`, session_id: "session-1", parent_message_id: null, role, message_kind: "chat", content_markdown: content, token_estimate: 0, is_hidden: false, attachments: [], created_at: "2026-05-10T00:00:00.000Z" };
}

function buildProfile(overrides: Partial<ViewerProfile> = {}): ViewerProfile {
  return { user_id: "user-1", email: "demo@sa-agent.local", display_name: "Demo User", onboarding_skill_id: null, onboarding_payload: null, preferred_user_name: null, preferred_agent_name: null, activity_domain: null, onboarding_completed: false, onboarding_completed_at: null, created_at: "2026-05-10T00:00:00.000Z", updated_at: "2026-05-10T00:00:00.000Z", ...overrides };
}

function jsonResponse(payload: unknown) {
  return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }));
}
