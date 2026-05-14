import test from "node:test";
import assert from "node:assert/strict";
import { transcriptToChatMessages, type EphemeralToolResult } from "./transcript.js";
import type { Message } from "../lib/types.js";

test("transcriptToChatMessages appends ephemeral tool results after persisted history", () => {
  const messages: Message[] = [
    {
      id: "user-1",
      session_id: "session-1",
      role: "user",
      content: "Read the file",
      created_at: "2026-05-14T10:00:00.000Z",
    },
    {
      id: "assistant-1",
      session_id: "session-1",
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "read_file", arguments: "{\"path\":\"ast-net-clash (1).yaml\"}" },
        },
      ],
      created_at: "2026-05-14T10:00:01.000Z",
    },
    {
      id: "tool-1",
      session_id: "session-1",
      role: "tool",
      content: "Read file ast-net-clash (1).yaml (2075 bytes). Content omitted from history.",
      tool_call_id: "call-1",
      created_at: "2026-05-14T10:00:02.000Z",
    },
  ];
  const ephemeralToolResults: EphemeralToolResult[] = [
    {
      toolCallId: "call-1",
      toolName: "read_file",
      content: "port: 7890\nmode: rule\n",
    },
  ];

  const transcript = transcriptToChatMessages(messages, ephemeralToolResults);

  assert.equal(transcript.length, 3);
  assert.deepEqual(transcript[0], { role: "user", content: "Read the file" });
  assert.equal(transcript[1]?.role, "user");
  assert.match(
    transcript[1]?.content ?? "",
    /Content omitted from history\./,
  );
  assert.equal(transcript[2]?.role, "user");
  assert.match(
    transcript[2]?.content ?? "",
    /port: 7890\nmode: rule/,
  );
});
