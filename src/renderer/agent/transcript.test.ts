import test from "node:test";
import assert from "node:assert/strict";
import { transcriptToChatMessages, type EphemeralToolResult } from "./transcript.js";
import type { Message } from "../lib/types.js";

function msg(overrides: Partial<Message> & Pick<Message, "id" | "role" | "content">): Message {
  return {
    session_id: "session-1",
    created_at: "2026-05-14T10:00:00.000Z",
    ...overrides,
  };
}

test("transcriptToChatMessages reconstructs a proper OpenAI tool exchange", () => {
  const messages: Message[] = [
    msg({ id: "user-1", role: "user", content: "Read the file" }),
    msg({
      id: "assistant-1",
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "read_file", arguments: '{"path":"a.yaml"}' },
        },
      ],
    }),
    msg({
      id: "tool-1",
      role: "tool",
      content: "Read file a.yaml (2075 bytes). Content omitted from history.",
      tool_call_id: "call-1",
    }),
  ];
  const ephemeral: EphemeralToolResult[] = [
    { toolCallId: "call-1", toolName: "read_file", content: "port: 7890\nmode: rule\n" },
  ];

  const transcript = transcriptToChatMessages(messages, ephemeral);

  assert.equal(transcript.length, 3);
  assert.deepEqual(transcript[0], { role: "user", content: "Read the file" });
  // The pure tool-call assistant turn is preserved (previously dropped).
  assert.equal(transcript[1]?.role, "assistant");
  assert.equal(transcript[1]?.content, null);
  assert.deepEqual(
    (transcript[1] as { tool_calls?: unknown }).tool_calls,
    messages[1]!.tool_calls,
  );
  // The tool output is a real tool-role message, and the ephemeral full
  // content overrides the summarized persisted version for this turn.
  assert.equal(transcript[2]?.role, "tool");
  assert.equal((transcript[2] as { tool_call_id?: string }).tool_call_id, "call-1");
  assert.match(transcript[2]?.content ?? "", /port: 7890\nmode: rule/);
});

test("transcriptToChatMessages keeps assistant text alongside tool calls", () => {
  const transcript = transcriptToChatMessages([
    msg({ id: "u", role: "user", content: "hi" }),
    msg({
      id: "a",
      role: "assistant",
      content: "Let me check.",
      tool_calls: [
        { id: "c1", type: "function", function: { name: "list_files", arguments: "{}" } },
      ],
    }),
    msg({ id: "t", role: "tool", content: "a\nb", tool_call_id: "c1" }),
  ]);

  assert.deepEqual(transcript[1], {
    role: "assistant",
    content: "Let me check.",
    tool_calls: [
      { id: "c1", type: "function", function: { name: "list_files", arguments: "{}" } },
    ],
  });
  assert.equal(transcript[2]?.role, "tool");
});

test("transcriptToChatMessages passes assistant reasoning_content back to the API", () => {
  const transcript = transcriptToChatMessages([
    msg({
      id: "a",
      role: "assistant",
      content: "Visible answer",
      reasoning_content: "Hidden reasoning",
    }),
  ]);

  assert.deepEqual(transcript[0], {
    role: "assistant",
    content: "Visible answer",
    reasoning_content: "Hidden reasoning",
  });
});

test("transcriptToChatMessages drops orphan tool results with no matching call", () => {
  const transcript = transcriptToChatMessages([
    msg({ id: "u", role: "user", content: "hi" }),
    msg({ id: "t", role: "tool", content: "stray output", tool_call_id: "missing" }),
  ]);

  assert.deepEqual(transcript, [{ role: "user", content: "hi" }]);
});

test("transcriptToChatMessages does not duplicate a result already persisted", () => {
  const transcript = transcriptToChatMessages(
    [
      msg({
        id: "a",
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "c1", type: "function", function: { name: "read_file", arguments: "{}" } },
        ],
      }),
      msg({ id: "t", role: "tool", content: "summarized", tool_call_id: "c1" }),
    ],
    [{ toolCallId: "c1", toolName: "read_file", content: "full output" }],
  );

  const toolMessages = transcript.filter((m) => m.role === "tool");
  assert.equal(toolMessages.length, 1);
  assert.equal(toolMessages[0]?.content, "full output");
});

test("transcriptToChatMessages appends an in-flight result before its tool message is persisted", () => {
  const transcript = transcriptToChatMessages(
    [
      msg({
        id: "a",
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "c1", type: "function", function: { name: "fetch_url", arguments: "{}" } },
        ],
      }),
    ],
    [{ toolCallId: "c1", toolName: "fetch_url", content: "page body" }],
  );

  assert.equal(transcript.length, 2);
  assert.equal(transcript[0]?.role, "assistant");
  assert.deepEqual(transcript[1], {
    role: "tool",
    content: "page body",
    tool_call_id: "c1",
  });
});
