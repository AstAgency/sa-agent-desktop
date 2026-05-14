import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComposerMessage,
  formatAttachmentsBlock,
  groupTurns,
  isAtBottom,
  type ComposerAttachment,
} from "./chat-view-helpers.js";
import type { Message } from "../lib/types.js";

function message(overrides: Partial<Message> & Pick<Message, "id" | "role" | "content">): Message {
  return {
    session_id: "session-1",
    created_at: "2026-05-14T10:00:00.000Z",
    ...overrides,
  };
}

test("groupTurns keeps assistant reasoning in the main flow when tool calls exist", () => {
  const turns = groupTurns([
    message({ id: "u1", role: "user", content: "hi" }),
    message({
      id: "a1",
      role: "assistant",
      content: "Let me inspect that.",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "read_file", arguments: "{\"path\":\"README.md\"}" },
        },
      ],
    }),
    message({ id: "t1", role: "tool", content: "README", tool_call_id: "call-1" }),
    message({ id: "a2", role: "assistant", content: "Done." }),
  ]);

  assert.equal(turns.length, 1);
  assert.equal(turns[0]?.reasoningMessages.length, 1);
  assert.equal(turns[0]?.traceMessages.length, 2);
  assert.equal(turns[0]?.finalAssistant?.content, "Done.");
  assert.equal(turns[0]?.reasoningMessages[0]?.tool_calls, undefined);
});

test("isAtBottom respects threshold and treats short content as pinned", () => {
  assert.equal(isAtBottom(0, 400, 400), true);
  assert.equal(isAtBottom(537, 400, 1000), true);
  assert.equal(isAtBottom(400, 400, 1000), false);
});

test("formatAttachmentsBlock serializes attachments into the inline envelope", () => {
  const attachments: ComposerAttachment[] = [
    {
      name: "notes.txt",
      size: 11,
      mime: "text/plain",
      kind: "text",
      content: "hello world",
    },
    {
      name: "image.bin",
      size: 4,
      mime: "application/octet-stream",
      kind: "binary",
      content: "AQIDBA==",
    },
  ];

  const block = formatAttachmentsBlock(attachments);
  assert.match(block, /^<attachments>/);
  assert.match(block, /=== notes\.txt \(11 bytes, text\/plain\) ===/);
  assert.match(block, /=== image\.bin \(4 bytes, binary base64\) ===/);
  assert.match(block, /<\/attachments>$/);
  assert.equal(buildComposerMessage("please inspect", attachments).startsWith(block), true);
});
