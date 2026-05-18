import test from "node:test";
import assert from "node:assert/strict";
import { base64ToArrayBuffer, extractVisionDescription } from "./vision.js";
import { VISION_ANALYSIS_PROMPT } from "../agent/prompts/vision-prompt.js";

test("extractVisionDescription reads OpenAI-style choices[].message.content", () => {
  const text = extractVisionDescription({
    choices: [{ message: { content: "  A red bicycle near a wall  " } }],
  });
  assert.equal(text, "A red bicycle near a wall");
});

test("extractVisionDescription falls back to description/text fields", () => {
  assert.equal(extractVisionDescription({ description: "scan of an invoice" }), "scan of an invoice");
  assert.equal(extractVisionDescription({ text: "a photo" }), "a photo");
});

test("extractVisionDescription handles plain string and unknown shapes", () => {
  assert.equal(extractVisionDescription("  raw text  "), "raw text");
  assert.equal(extractVisionDescription({ unexpected: 1 }), JSON.stringify({ unexpected: 1 }));
});

test("base64ToArrayBuffer round-trips bytes", () => {
  const base64 = Buffer.from([0, 1, 2, 250, 255]).toString("base64");
  assert.deepEqual([...new Uint8Array(base64ToArrayBuffer(base64))], [0, 1, 2, 250, 255]);
});

test("vision prompt asks for a description and verbatim text transcription", () => {
  assert.match(VISION_ANALYSIS_PROMPT, /что изображено/i);
  assert.match(VISION_ANALYSIS_PROMPT, /Текст на изображении/);
  assert.match(VISION_ANALYSIS_PROMPT, /дословно/);
});
