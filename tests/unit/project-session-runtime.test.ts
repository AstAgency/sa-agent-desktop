import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSessionRuntime } from "../../src/renderer/agent/project-session-runtime";
import type { SessionMessage } from "../../src/renderer/lib/types";

describe("ProjectSessionRuntime", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writeFilesMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeFilesMock.mockReset();
    window.saAgent = {
      ...(window.saAgent ?? {}),
      files: {
        ...(window.saAgent?.files ?? {}),
        writeFiles: writeFilesMock,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes structured project tool calls without parsing assistant text", async () => {
    const llmBodies: Array<Record<string, unknown>> = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        llmBodies.push(payload);

        if (llmBodies.length === 1) {
          return jsonResponse({
            output_text: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                name: "backend.project.context.upsert",
                arguments: { key: "ctx-1", title: "Context", content_markdown: "Save context" },
              },
            ],
          });
        }

        return jsonResponse({ output_text: "Контекст проекта обновлён." });
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string };

      if (payload.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tools-list-1",
          result: {
            tools: [{ name: "project.context.upsert", description: "Update project context", inputSchema: { type: "object" } }],
          },
        });
      }

      return jsonResponse({
        jsonrpc: "2.0",
        id: "tool-call-1",
        result: {
          isError: false,
          structuredContent: { item_id: "ctx-1" },
          content: [{ type: "text", text: "ok" }],
        },
      });
    });

    const runtime = await ProjectSessionRuntime.create({
      workspaceId: "ws-1",
      projectId: "p-1",
      sessionId: "session-p1",
      initialMessages: [buildMessage("user", "Сохрани контекст")],
      projectAgentId: "project-agent-1",
    });

    const result = await runtime.continueFromTranscript();

    expect(result.assistantText).toBe("Контекст проекта обновлён.");
    expect(llmBodies).toHaveLength(2);
    expect(llmBodies[0]?.tool_choice).toBe("auto");
  });

  it("loads project tools via tools/list and uses tool_call for project context updates", async () => {
    const mcpMethods: string[] = [];
    const llmBodies: Array<Record<string, unknown>> = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        llmBodies.push(payload);

        if (llmBodies.length === 1) {
          return jsonResponse({
            output_text: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                name: "backend.project.context.upsert",
                arguments: { key: "ctx-1", title: "Context", content_markdown: "Сохрани контекст проекта." },
              },
            ],
          });
        }

        return jsonResponse({ output_text: "Контекст проекта обновлён." });
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      mcpMethods.push(payload.method ?? "unknown");

      if (payload.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tools-list-1",
          result: {
            tools: [{ name: "project.context.upsert", description: "Update project context", inputSchema: { type: "object" } }],
          },
        });
      }

      if (payload.method === "tools/call") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tool-call-1",
          result: { content: [{ type: "text", text: "ok" }], structuredContent: { item_id: "ctx-1" }, isError: false },
        });
      }

      throw new Error(`Unexpected request: ${JSON.stringify(payload)}`);
    });

    const runtime = await ProjectSessionRuntime.create({
      workspaceId: "ws-1",
      projectId: "p-1",
      sessionId: "session-p1",
      initialMessages: [buildMessage("user", "Сохрани контекст проекта.")],
      projectAgentId: "project-agent-1",
      projectName: "Project",
    });

    const result = await runtime.continueFromTranscript();
    expect(mcpMethods).toContain("tools/list");
    expect(mcpMethods).toContain("tools/call");
    expect(llmBodies[0]?.tool_choice).toBe("auto");
    expect(result.assistantText).toBe("Контекст проекта обновлён.");
  });

  it("sends structured project tool results back through the llm adapter", async () => {
    const llmBodies: Array<Record<string, unknown>> = [];
    const mcpMethods: string[] = [];

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        llmBodies.push(payload);

        if (llmBodies.length === 1) {
          return jsonResponse({
            output_text: null,
            tool_calls: [
              {
                id: "call-2",
                type: "function",
                name: "backend.project.context.upsert",
                arguments: { key: "ctx-2", title: "Context", content_markdown: "Зафиксируй контекст проекта." },
              },
            ],
          });
        }

        if (llmBodies.length === 2) {
          expect(JSON.stringify(payload.messages)).toContain("project.context.upsert");
          expect(JSON.stringify(payload.messages)).toContain("Инструмент backend.project.context.upsert выполнен успешно.");
          return jsonResponse({ output_text: "Контекст проекта обновлён." });
        }

        throw new Error(`Unexpected LLM request count: ${llmBodies.length}`);
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      mcpMethods.push(payload.method ?? "unknown");

      if (payload.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tools-list-1",
          result: {
            tools: [{ name: "project.context.upsert", description: "Update project context", inputSchema: { type: "object" } }],
          },
        });
      }

      if (payload.method === "tools/call") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tool-call-1",
          result: { content: [{ type: "text", text: "ok" }], structuredContent: { item_id: "ctx-2" }, isError: false },
        });
      }

      throw new Error(`Unexpected request: ${JSON.stringify(payload)}`);
    });

    const runtime = await ProjectSessionRuntime.create({
      workspaceId: "ws-1",
      projectId: "p-1",
      sessionId: "session-p1",
      initialMessages: [buildMessage("user", "Сохрани контекст проекта через project.context.upsert.")],
      projectAgentId: "project-agent-1",
      projectName: "Project",
    });

    const result = await runtime.continueFromTranscript();

    expect(llmBodies).toHaveLength(2);
    expect(mcpMethods).toContain("tools/call");
    expect(result.assistantText).toBe("Контекст проекта обновлён.");
  });

  it("executes local file tools when the user explicitly asks to save a file", async () => {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/v1/llm/responses")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const hasToolResult = messages.some((message) =>
          typeof message === "object"
          && message !== null
          && String((message as { content?: unknown }).content ?? "").includes("Инструмент local.files.write_file")
        );

        if (!hasToolResult) {
          return jsonResponse({
            output_text: null,
            tool_calls: [
              {
                id: "call-local-1",
                type: "function",
                name: "local.files.write_file",
                arguments: { path: "README.md", content: "# Project Notes" },
              },
            ],
          });
        }

        return jsonResponse({ output_text: "Локальный файл проекта сохранён." });
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (payload.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: "tools-list-1",
          result: {
            tools: [{ name: "project.context.upsert", description: "Update project context", inputSchema: { type: "object" } }],
          },
        });
      }

      return jsonResponse({
        jsonrpc: "2.0",
        id: "tool-call-local-1",
        result: { content: [{ type: "text", text: "saved" }], structuredContent: { path: "README.md" }, isError: false },
      });
    });

    const runtime = await ProjectSessionRuntime.create({
      workspaceId: "ws-1",
      projectId: "p-1",
      sessionId: "session-p1",
      initialMessages: [buildMessage("user", "Сохрани локальный README.md с заметками по проекту.")],
      projectAgentId: "project-agent-1",
      projectName: "Project",
    });

    const result = await runtime.continueFromTranscript();

    expect(writeFilesMock).toHaveBeenCalledWith([{ relativePath: "README.md", content: "# Project Notes" }]);
    expect(result.assistantText).toBe("Локальный файл проекта сохранён.");
  });
});

function buildMessage(role: SessionMessage["role"], content: string): SessionMessage {
  return {
    id: `${role}-1`,
    session_id: "session-p1",
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

function jsonResponse(payload: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
  );
}
