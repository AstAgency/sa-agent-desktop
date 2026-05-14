import assert from "node:assert/strict";
import test from "node:test";
import { summarizeToolResultForHistory } from "./tool-result-summary.js";

test("summarizeToolResultForHistory omits read_file payload from persisted history", () => {
  const text = summarizeToolResultForHistory({
    role: "toolResult",
    toolName: "read_file",
    isError: false,
    content: [{ type: "text", text: "%PDF-1.5\u0000binary" }],
    details: { path: "Квитанция.pdf", bytes: 61294 },
  });

  assert.equal(
    text,
    "Read file Квитанция.pdf (61294 bytes). Content omitted from history.",
  );
});

test("summarizeToolResultForHistory strips invalid null bytes from generic tool output", () => {
  const text = summarizeToolResultForHistory({
    role: "toolResult",
    toolName: "run_python",
    isError: false,
    content: [{ type: "text", text: "ok\u0000done" }],
    details: {},
  });

  assert.equal(text, "okdone");
});
