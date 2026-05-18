import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAssistantReasoningContent,
  hydrateAgentMessages,
} from "./converters.js";
import type { Message } from "../../lib/types.js";

test("hydrateAgentMessages preserves persisted assistant reasoning_content", () => {
  const messages: Message[] = [
    {
      id: "assistant-1",
      session_id: "session-1",
      role: "assistant",
      content: "Answer",
      reasoning_content: "Hidden chain",
      created_at: "2026-05-18T10:00:00.000Z",
    },
  ];

  const hydrated = hydrateAgentMessages(messages);
  assert.equal(hydrated.length, 1);
  assert.equal(
    (hydrated[0] as { reasoning_content?: string | null }).reasoning_content,
    "Hidden chain",
  );
});

test("extractAssistantReasoningContent returns assistant reasoning_content when present", () => {
  const reasoning = extractAssistantReasoningContent({
    role: "assistant",
    content: [],
    reasoning_content: "Model reasoning",
  } as unknown as Parameters<typeof extractAssistantReasoningContent>[0]);

  assert.equal(reasoning, "Model reasoning");
});
