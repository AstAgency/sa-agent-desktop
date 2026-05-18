import assert from "node:assert/strict";
import test from "node:test";
import { ChatCompletionError, streamChatCompletion } from "./api.js";

test("streamChatCompletion preserves structured rate-limit code from API errors", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "rate_limited",
          message: "hourly token limit exceeded",
          status: 429,
        },
      }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      },
    )) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        streamChatCompletion(
          {
            model: "deepseek-v4-pro",
            messages: [{ role: "user", content: "hello" }],
          },
          {},
        ),
      (error: unknown) =>
        error instanceof ChatCompletionError &&
        error.status === 429 &&
        error.kind === "rate_limit" &&
        error.code === "rate_limited" &&
        error.message === "hourly token limit exceeded",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streamChatCompletion does not call onAccepted when the API returns 429", async () => {
  const originalFetch = globalThis.fetch;
  let acceptedCalls = 0;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "rate_limited",
          message: "hourly token limit exceeded",
          status: 429,
        },
      }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      },
    )) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        streamChatCompletion(
          {
            model: "deepseek-v4-pro",
            messages: [{ role: "user", content: "hello" }],
          },
          {
            onAccepted: () => {
              acceptedCalls += 1;
            },
          },
        ),
      ChatCompletionError,
    );
    assert.equal(acceptedCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
