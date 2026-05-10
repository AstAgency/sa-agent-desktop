import { describe, expect, it, vi } from "vitest";
import { completeWithStructuredTools } from "../../src/renderer/agent/model-adapter/llm-response-model";
import { mapLlmResponseToAssistantContent } from "../../src/renderer/agent/model-adapter/tool-call-mapping";

describe("mapLlmResponseToAssistantContent", () => {
  it("maps backend tool_calls into pi-ai assistant toolCall blocks", () => {
    const content = mapLlmResponseToAssistantContent({
      output_text: null,
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          name: "backend.projects.create",
          arguments: { payload: { name: "AST Systems" } },
        },
      ],
    });

    expect(content).toEqual([
      {
        type: "toolCall",
        id: "call-1",
        name: "backend.projects.create",
        arguments: { payload: { name: "AST Systems" } },
      },
    ]);
  });
});

describe("completeWithStructuredTools", () => {
  it("sends tools and tool_choice to llm responses and returns mapped assistant content", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: null,
          finish_reason: "stop",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              name: "backend.projects.create",
              arguments: { payload: { name: "AST Systems" } },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        },
      ),
    );

    const result = await completeWithStructuredTools({
      workspaceId: "ws-1",
      threadId: "thread-1",
      messages: [{ role: "user", content: "Create project AST Systems" }],
      tools: [
        {
          name: "backend.projects.create",
          description: "Create project",
          inputSchema: { type: "object" },
          plane: "backend",
          backendName: "projects.create",
        },
      ],
      fetcher: fetchMock,
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    expect(payload.tools).toEqual([
      {
        type: "function",
        function: {
          name: "backend.projects.create",
          description: "Create project",
          parameters: { type: "object" },
        },
      },
    ]);
    expect(payload.tool_choice).toBe("auto");
    expect(result.finishReason).toBe("toolUse");
    expect(result.content).toEqual([
      {
        type: "toolCall",
        id: "call-1",
        name: "backend.projects.create",
        arguments: { payload: { name: "AST Systems" } },
      },
    ]);
  });
});
