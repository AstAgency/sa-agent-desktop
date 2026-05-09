import { describe, expect, it, vi } from "vitest";
import type { SessionMessage, SessionMessageInput, StreamSessionMessageResult, SessionMessageStreamEvent } from "../../src/renderer/lib/types";
import { BackendSessionAgentRuntime, sessionMessagesToAgentMessages } from "../../src/renderer/agent/runtime";

describe("BackendSessionAgentRuntime", () => {
  it("hydrates pi-agent transcript from backend session messages", () => {
    const transcript = sessionMessagesToAgentMessages([
      buildSessionMessage({
        id: "user-1",
        role: "user",
        content_markdown: "Hello",
      }),
      buildSessionMessage({
        id: "assistant-1",
        role: "assistant",
        content_markdown: "Hi there",
      }),
    ]);

    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toMatchObject({ role: "user", content: "Hello" });
    expect(transcript[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
    });
  });

  it("streams an interactive turn through pi-agent-core and returns completion payload from execution.completed", async () => {
    const streamMessage = vi.fn(
      async (
        sessionId: string,
        payload: SessionMessageInput,
        input?: { onEvent?: (event: SessionMessageStreamEvent) => void; signal?: AbortSignal },
      ): Promise<StreamSessionMessageResult> => {
        expect(sessionId).toBe("session-1");
        expect(payload).toEqual({ content_markdown: "Hello" });
        input?.onEvent?.({
          event: "message.delta",
          data: {
            job_id: "job-1",
            session_id: "session-1",
            assistant_message_id: "assistant-1",
            delta: "Hi",
          },
        });
        input?.onEvent?.({
          event: "message.completed",
          data: {
            job_id: "job-1",
            session_id: "session-1",
            assistant_message_id: "assistant-1",
            content_markdown: "Hi there",
          },
        });
        input?.onEvent?.({
          event: "execution.completed",
          data: {
            session_id: "session-1",
            execution_id: "execution-1",
            capability_key: "user_onboarding",
            completion_payload: {
              name: "Emil",
              agent_name: "Orbit",
            },
            execution_applied_effects: {
              onboarding_completed: true,
            },
          },
        });

        return {
          mode: "sse",
          completionPayload: {
            name: "Emil",
            agent_name: "Orbit",
          },
        };
      },
    );

    const runtime = await BackendSessionAgentRuntime.create({
      sessionId: "session-1",
      initialMessages: [],
      streamMessage,
    });

    const result = await runtime.sendUserMessage("Hello");

    expect(result.completionPayload).toEqual({
      name: "Emil",
      agent_name: "Orbit",
    });
    expect(runtime.getTranscript()).toHaveLength(2);
    expect(runtime.getTranscript()[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    });
    expect(runtime.getTranscript()[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
    });
  });

  it("supports non-stream JSON fallback responses from backend execution_status terminal state", async () => {
    const streamMessage = vi.fn(
      async (): Promise<StreamSessionMessageResult> => ({
        mode: "json",
        accepted: {
          job_id: "job-1",
          job_kind: "message",
          status: "accepted",
          poll_url: "/v1/executions/execution-1",
          session_id: "session-1",
          assistant_message_id: "assistant-1",
          assistant_content_markdown: "Hello from JSON fallback",
          execution_id: "execution-1",
          capability_key: "user_onboarding",
          execution_status: "applied",
          completion_payload: {
            name: "Emil",
            domain: "Product strategy",
          },
        },
        completionPayload: {
          name: "Emil",
          domain: "Product strategy",
        },
        executionCompleted: true,
      }),
    );

    const runtime = await BackendSessionAgentRuntime.create({
      sessionId: "session-1",
      initialMessages: [],
      streamMessage,
    });

    const result = await runtime.sendUserMessage("Hello");

    expect(result.completionPayload).toEqual({
      name: "Emil",
      domain: "Product strategy",
    });
    expect(runtime.getTranscript()[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Hello from JSON fallback" }],
    });
  });

  it("exposes partial assistant text before the backend stream completes", async () => {
    let releaseCompletion: (() => void) | null = null;
    const completionGate = new Promise<void>((resolve) => {
      releaseCompletion = resolve;
    });
    const snapshots: string[] = [];
    let emittedDelta = false;

    const streamMessage = vi.fn(
      async (
        _sessionId: string,
        _payload: SessionMessageInput,
        input?: { onEvent?: (event: SessionMessageStreamEvent) => void; signal?: AbortSignal },
      ): Promise<StreamSessionMessageResult> => {
        input?.onEvent?.({
          event: "message.delta",
          data: {
            job_id: "job-1",
            session_id: "session-1",
            assistant_message_id: "assistant-1",
            delta: "Hello",
          },
        });
        emittedDelta = true;

        await completionGate;

        input?.onEvent?.({
          event: "message.completed",
          data: {
            job_id: "job-1",
            session_id: "session-1",
            assistant_message_id: "assistant-1",
            content_markdown: "Hello there",
          },
        });

        return {
          mode: "sse",
          completionPayload: null,
          executionCompleted: false,
        };
      },
    );

    const runtime = await BackendSessionAgentRuntime.create({
      sessionId: "session-1",
      initialMessages: [],
      streamMessage,
    });

    runtime.subscribe(() => {
      snapshots.push(runtime.getStreamingAssistantText());
    });

    const pending = runtime.sendUserMessage("Hello");
    await vi.waitFor(() => {
      expect(emittedDelta).toBe(true);
    });

    expect(runtime.getStreamingAssistantText()).toBe("Hello");
    expect(snapshots).toContain("Hello");

    releaseCompletion?.();
    await pending;
  });

  it("loads MCP tools through the bridge during runtime creation", async () => {
    const runtime = await BackendSessionAgentRuntime.create({
      sessionId: "session-1",
      initialMessages: [],
      mcpLandscape: {
        mcpServers: {
          filesystem: {
            command: "node",
            args: ["server.js"],
          },
        },
      },
      mcpBridge: {
        listTools: vi.fn(async () => [
          {
            serverName: "filesystem",
            name: "write_file",
            title: "write_file",
            description: "Write a file to disk",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string" },
              },
            },
          },
        ]),
        callTool: vi.fn(async () => ({
          content: [{ type: "text", text: "Saved profile_vahtang.md" }],
          isError: false,
        })),
        closeRuntime: vi.fn(async () => undefined),
      },
    });

    expect(runtime.getToolCount()).toBe(1);
  });

  it("falls back to no MCP tools when tool discovery does not resolve in time", async () => {
    vi.useFakeTimers();

    const runtimePromise = BackendSessionAgentRuntime.create({
      sessionId: "session-1",
      initialMessages: [],
      mcpLandscape: {
        mcpServers: {
          filesystem: {
            command: "node",
            args: ["server.js"],
          },
        },
      },
      mcpBridge: {
        listTools: vi.fn(async () => await new Promise(() => undefined)),
        callTool: vi.fn(async () => ({
          content: [{ type: "text", text: "unused" }],
          isError: false,
        })),
        closeRuntime: vi.fn(async () => undefined),
      },
    });

    await vi.advanceTimersByTimeAsync(4_000);
    const runtime = await runtimePromise;

    expect(runtime.getToolCount()).toBe(0);
    vi.useRealTimers();
  });
});

function buildSessionMessage(input: Partial<SessionMessage> & Pick<SessionMessage, "id" | "role" | "content_markdown">): SessionMessage {
  return {
    id: input.id,
    session_id: input.session_id ?? "session-1",
    parent_message_id: input.parent_message_id ?? null,
    role: input.role,
    message_kind: input.message_kind ?? "chat",
    content_markdown: input.content_markdown,
    token_estimate: input.token_estimate ?? 0,
    is_hidden: input.is_hidden ?? false,
    attachments: input.attachments ?? [],
    created_at: input.created_at ?? "2026-05-07T10:00:00.000Z",
  };
}
