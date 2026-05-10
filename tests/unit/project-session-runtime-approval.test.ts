import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSessionRuntime } from "../../src/renderer/agent/project-session-runtime";
import type { SessionMessage } from "../../src/renderer/lib/types";

describe("ProjectSessionRuntime local file policy", () => {
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

    const runtime = await ProjectSessionRuntime.create({
      workspaceId: "ws-1",
      projectId: "project-1",
      sessionId: "session-1",
      initialMessages: [buildMessage("Позже нам может понадобиться экспорт этих данных.")],
      projectAgentId: "agent-1",
    });

    const result = await runtime.continueFromTranscript();

    expect(writeFilesMock).not.toHaveBeenCalled();
    expect(result.assistantText).toContain("явно попроси");
  });
});

function buildMessage(content: string): SessionMessage {
  return { id: "user-1", thread_id: "session-1", actor_type: "user", actor_id: "user-1", role: "user", message_kind: "chat", content_markdown: content, token_estimate: content.length, is_hidden: false, created_at: "2026-05-09T00:00:00.000Z" };
}

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
}
