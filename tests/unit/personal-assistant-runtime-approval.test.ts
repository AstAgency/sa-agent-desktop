import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalAssistantRuntime } from "../../src/renderer/agent/personal-assistant-runtime";
import type { SessionMessage, ViewerProfile } from "../../src/renderer/lib/types";

describe("PersonalAssistantRuntime local file policy", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writeFilesMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeFilesMock.mockReset();
    window.saAgent = {
      ...(window.saAgent ?? {}),
      files: { ...(window.saAgent?.files ?? {}), writeFiles: writeFilesMock },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("omits the local file tool when the user did not explicitly ask to save a file", async () => {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as { tools?: Array<{ function?: { name?: string } }> };
        expect(payload.tools?.some((tool) => tool.function?.name === "local.files.write_file")).toBe(false);
        return jsonResponse({ output_text: "Сначала явно попроси меня сохранить файл и укажи путь." });
      }

      return jsonResponse({ jsonrpc: "2.0", id: "tools-list-1", result: { tools: [] } });
    });

    const runtime = await PersonalAssistantRuntime.create({
      workspaceId: "ws-1",
      threadId: "thread-1",
      initialMessages: [buildMessage("user", "Нам потом, возможно, понадобится экспорт этих данных.")],
      profile: buildProfile(),
    });

    const result = await runtime.continueFromTranscript();

    expect(writeFilesMock).not.toHaveBeenCalled();
    expect(result.assistantText).toContain("явно попроси");
  });
});

function buildMessage(role: "user" | "assistant", content: string): SessionMessage {
  return { id: `${role}-1`, thread_id: "thread-1", actor_type: role, actor_id: `${role}-1`, role, message_kind: "chat", content_markdown: content, token_estimate: content.length, is_hidden: false, created_at: "2026-05-09T00:00:00.000Z" };
}

function buildProfile(): ViewerProfile {
  return { id: "viewer-1", email: "demo@example.com", display_name: "Demo User", preferred_user_name: null, preferred_agent_name: "Фрунзик", activity_domain: "IT", onboarding_completed: true, onboarding_payload: null, created_at: "2026-05-09T00:00:00.000Z", updated_at: "2026-05-09T00:00:00.000Z" };
}

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
}
