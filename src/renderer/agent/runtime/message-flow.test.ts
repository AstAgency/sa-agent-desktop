import assert from "node:assert/strict";
import test from "node:test";
import { ChatCompletionError } from "../../lib/api.js";
import { sendUserMessage } from "./message-flow.js";
import type { RuntimeInternals } from "./types.js";
import type { Message, Summary } from "../../lib/types.js";

test("sendUserMessage removes the optimistic user message on a 429 stream error", async () => {
  const streamError = new ChatCompletionError(
    429,
    "hourly token limit exceeded",
    "rate_limited",
  );
  let continueCalled = 0;
  let notified = 0;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        id: "message-1",
        session_id: "session-1",
        role: "user",
        content: "hello",
        created_at: "2026-05-18T10:00:00.000Z",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  const rt: RuntimeInternals = {
    input: {
      sessionId: "session-1",
      scope: { kind: "global", sessionId: "session-1", displayName: "Session" },
      profile: {
        id: "profile-1",
        name: "Test",
        global_memory: "",
        created_at: "2026-05-18T10:00:00.000Z",
        updated_at: "2026-05-18T10:00:00.000Z",
      },
      project: null,
      agent: null,
      messages: [],
      summaries: [],
      toolActions: {
        updateGlobalMemory: async () => undefined,
        updateProjectMemory: async () => undefined,
      },
    },
    tools: [],
    agent: {
      state: { messages: [] },
      continue: async () => {
        continueCalled += 1;
        rt.lastRunError = streamError;
      },
    } as unknown as RuntimeInternals["agent"],
    persistedMessageIds: new Set<string>(),
    state: {
      messages: [] as Message[],
      summaries: [] as Summary[],
      streamingFinalText: "",
      trace: [],
      isStreaming: false,
    },
    model: "deepseek-v4-pro",
    inflightAbort: null,
    lastRunError: null,
    currentTurnLocalUserMessageId: null,
    currentTurnUserTimestamp: 0,
    currentTurnUserText: "",
    currentTurnId: "",
    persistenceChain: Promise.resolve(),
    activeRound: null,
    roundIndex: 0,
    currentTurnToolResults: [],
    notify: () => {
      notified += 1;
    },
  };

  try {
    await assert.rejects(() => sendUserMessage(rt, "hello"), streamError);
    assert.equal(continueCalled, 1);
    assert.equal(fetchCalls, 0);
    assert.equal(rt.lastRunError, null);
    assert.equal(rt.state.isStreaming, false);
    assert.equal(rt.state.streamingFinalText, "");
    assert.deepEqual(rt.state.messages, []);
    assert.deepEqual(rt.agent.state.messages, []);
    assert.ok(notified > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
