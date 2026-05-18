import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComposerMessage,
  extractRenderedUserMessageParts,
  formatAttachmentsBlock,
  getVisibleTurns,
  groupTurns,
  isAtBottom,
  nextAvailableAttachmentPath,
  parseAllowedAttachmentExtensions,
  insertTextAtSelection,
  type PersistedAttachment,
  validateAttachmentSizes,
  validateAttachmentTypes,
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

test("groupTurns surfaces the last agent text when a turn ends on a tool call", () => {
  const turns = groupTurns([
    message({ id: "u1", role: "user", content: "do it" }),
    message({
      id: "a1",
      role: "assistant",
      content: "I will read the file now.",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "read_file", arguments: "{\"path\":\"x\"}" },
        },
      ],
    }),
    message({ id: "t1", role: "tool", content: "contents", tool_call_id: "call-1" }),
  ]);

  assert.equal(turns.length, 1);
  // No plain closing message, but the agent's words are still shown as the
  // answer instead of an empty dialog.
  assert.equal(turns[0]?.finalAssistant?.content, "I will read the file now.");
  assert.equal(turns[0]?.finalAssistant?.tool_calls, undefined);
  // Not duplicated as a reasoning bubble.
  assert.equal(turns[0]?.reasoningMessages.length, 0);
  // The tool call is still in the trace.
  assert.equal(turns[0]?.traceMessages.length, 2);
});

test("groupTurns keeps an earlier plain answer visible when another follows", () => {
  const turns = groupTurns([
    message({ id: "u1", role: "user", content: "q" }),
    message({ id: "a1", role: "assistant", content: "First part." }),
    message({ id: "a2", role: "assistant", content: "Second part." }),
  ]);

  assert.equal(turns.length, 1);
  assert.equal(turns[0]?.finalAssistant?.content, "Second part.");
  // The earlier answer stays in the main flow rather than being buried.
  assert.equal(turns[0]?.reasoningMessages.length, 1);
  assert.equal(turns[0]?.reasoningMessages[0]?.content, "First part.");
  assert.equal(turns[0]?.traceMessages.length, 0);
});

test("groupTurns leaves a silent tool-only turn without a fabricated answer", () => {
  const turns = groupTurns([
    message({ id: "u1", role: "user", content: "go" }),
    message({
      id: "a1",
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "list_files", arguments: "{}" },
        },
      ],
    }),
    message({ id: "t1", role: "tool", content: "a\nb", tool_call_id: "call-1" }),
  ]);

  assert.equal(turns.length, 1);
  assert.equal(turns[0]?.finalAssistant, null);
  assert.equal(turns[0]?.reasoningMessages.length, 0);
  assert.equal(turns[0]?.traceMessages.length, 2);
});

test("isAtBottom respects threshold and treats short content as pinned", () => {
  assert.equal(isAtBottom(0, 400, 400), true);
  assert.equal(isAtBottom(537, 400, 1000), true);
  assert.equal(isAtBottom(400, 400, 1000), false);
});

test("getVisibleTurns hides the trailing in-flight turn while live trace is rendering", () => {
  const turns = groupTurns([
    message({ id: "u1", role: "user", content: "read file" }),
    message({
      id: "a1",
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "read_file", arguments: "{\"path\":\"a.txt\"}" },
        },
      ],
    }),
    message({
      id: "t1",
      role: "tool",
      content: "Read file a.txt (10 bytes). Content omitted from history.",
      tool_call_id: "call-1",
    }),
  ]);

  assert.equal(turns.length, 1);
  assert.equal(getVisibleTurns(turns, true).length, 0);
  assert.equal(getVisibleTurns(turns, false).length, 1);
});

test("formatAttachmentsBlock serializes attachments into the inline envelope", () => {
  const attachments: PersistedAttachment[] = [
    {
      name: "notes.txt",
      size: 11,
      mime: "text/plain",
      kind: "text",
      workspacePath: "notes.txt",
    },
    {
      name: "image.pdf",
      size: 4,
      mime: "application/pdf",
      kind: "binary",
      workspacePath: "image (2).pdf",
    },
  ];

  const block = formatAttachmentsBlock(attachments);
  assert.match(block, /^<attachments>/);
  assert.match(block, /=== notes\.txt \(11 bytes, text\/plain\) :: workspace_path="notes\.txt" ===/);
  assert.match(block, /=== image\.pdf \(4 bytes, application\/pdf\) :: workspace_path="image \(2\)\.pdf" ===/);
  assert.match(block, /<\/attachments>$/);
  assert.equal(buildComposerMessage("please inspect", attachments).startsWith(block), true);
});

test("validateAttachmentTypes enforces env-configured extension allowlist", () => {
  const allowed = parseAllowedAttachmentExtensions(".pdf, docx, txt, md");
  assert.equal(
    validateAttachmentTypes(
      [
        {
          name: "brief.pdf",
          size: 10,
          mime: "application/pdf",
          kind: "binary",
          content: "AA==",
        },
      ],
      allowed,
    ),
    null,
  );
  assert.match(
    validateAttachmentTypes(
      [
        {
          name: "archive.zip",
          size: 10,
          mime: "application/zip",
          kind: "binary",
          content: "AA==",
        },
      ],
      allowed,
    ) ?? "",
    /archive\.zip has unsupported file type/,
  );
});

test("default attachment allowlist includes common image formats", () => {
  const allowed = parseAllowedAttachmentExtensions(undefined);
  assert.equal(allowed.has(".png"), true);
  assert.equal(allowed.has(".jpg"), true);
  assert.equal(allowed.has(".webp"), true);
});

test("validateAttachmentTypes accepts pasted images with the default allowlist", () => {
  const allowed = parseAllowedAttachmentExtensions(undefined);
  assert.equal(
    validateAttachmentTypes(
      [
        {
          name: "screenshot.png",
          size: 10,
          mime: "image/png",
          kind: "binary",
          content: "AA==",
        },
      ],
      allowed,
    ),
    null,
  );
});

test("validateAttachmentSizes ignores persisted workspace attachments", () => {
  assert.equal(
    validateAttachmentSizes([
      {
        name: "agents_arch.png",
        size: 5 * 1024 * 1024,
        mime: "image/png",
        kind: "binary",
        workspacePath: "agents_arch.png",
      },
    ]),
    null,
  );
});

test("extractRenderedUserMessageParts hides attachment control text and keeps user text", () => {
  const content = buildComposerMessage("Проверь квитанцию", [
    {
      name: "Квитанция.pdf",
      size: 61294,
      mime: "application/pdf",
      kind: "binary",
      workspacePath: "Квитанция (2).pdf",
    },
  ]);

  const rendered = extractRenderedUserMessageParts(content);
  assert.equal(rendered.text, "Проверь квитанцию");
  assert.equal(rendered.attachments.length, 1);
  assert.equal(rendered.attachments[0]?.workspacePath, "Квитанция (2).pdf");
  assert.equal(rendered.attachments[0]?.name, "Квитанция.pdf");
});

test("nextAvailableAttachmentPath appends numeric suffix for collisions", () => {
  const next = nextAvailableAttachmentPath("Квитанция.pdf", new Set(["Квитанция.pdf", "Квитанция (2).pdf"]));
  assert.equal(next, "Квитанция (3).pdf");
});

test("insertTextAtSelection replaces the active selection and returns next caret", () => {
  assert.deepEqual(insertTextAtSelection("hello world", "beautiful ", 6, 6), {
    nextValue: "hello beautiful world",
    nextCaret: 16,
  });
  assert.deepEqual(insertTextAtSelection("hello world", "planet", 6, 11), {
    nextValue: "hello planet",
    nextCaret: 12,
  });
});
