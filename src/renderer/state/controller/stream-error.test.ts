import assert from "node:assert/strict";
import test from "node:test";
import { ChatCompletionError } from "../../lib/api.js";
import type { Billing } from "../../lib/types.js";
import { describeStreamError } from "./stream-error.js";

function billing(overrides: Partial<Billing> = {}): Billing {
  return {
    id: "billing-1",
    profile_id: "profile-1",
    hourly_usage: 1,
    daily_usage: 2,
    weekly_usage: 3,
    max_hourly: 10,
    max_daily: 20,
    max_weekly: 30,
    hourly_reset_at: "2026-05-18T15:00:00.000Z",
    daily_reset_at: "2026-05-19T00:00:00.000Z",
    weekly_reset_at: "2026-05-25T00:00:00.000Z",
    updated_at: "2026-05-18T10:00:00.000Z",
    ...overrides,
  };
}

test("shows hourly reset time for hourly token limit errors", () => {
  const error = new ChatCompletionError(
    429,
    "hourly token limit exceeded",
    "rate_limited",
  );

  assert.deepEqual(describeStreamError(error, "ru", billing()), {
    kind: "rate_limit",
    message:
      "Часовой лимит токенов исчерпан. Он сбросится после 2026-05-18T15:00:00.000Z.",
  });
});

test("falls back to generic rate-limit message for other 429 errors", () => {
  const error = new ChatCompletionError(429, "daily limit exceeded", "rate_limited");

  assert.deepEqual(describeStreamError(error, "ru", billing()), {
    kind: "rate_limit",
    message: "Достигнут лимит запросов. Попробуйте позже.",
  });
});

test("uses generic error message for non-chat errors", () => {
  assert.deepEqual(describeStreamError(new Error("boom"), "ru", billing()), {
    kind: "generic",
    message: "Ошибка стрима: boom",
  });
});
