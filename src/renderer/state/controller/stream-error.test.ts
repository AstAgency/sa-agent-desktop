import assert from "node:assert/strict";
import test from "node:test";
import { ChatCompletionError } from "../../lib/api.js";
import type { Billing } from "../../lib/types.js";
import { describeStreamError, formatResetAtForUser } from "./stream-error.js";

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
  const formattedResetAt = formatResetAtForUser(
    "2026-05-18T15:00:00.000Z",
    "ru",
    "Europe/Moscow",
  );

  const originalIntl = Intl.DateTimeFormat;
  Intl.DateTimeFormat = class extends Intl.DateTimeFormat {
    constructor(locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
      super(locales, { ...options, timeZone: "Europe/Moscow" });
    }
  } as typeof Intl.DateTimeFormat;

  try {
    assert.deepEqual(describeStreamError(error, "ru", billing()), {
      kind: "rate_limit",
      message: `Часовой лимит токенов исчерпан. Он сбросится после ${formattedResetAt}.`,
    });
  } finally {
    Intl.DateTimeFormat = originalIntl;
  }
});

test("formats reset time in the user's locale and timezone", () => {
  assert.equal(
    formatResetAtForUser("2026-05-18T15:00:00.000Z", "ru", "Europe/Moscow"),
    "18 мая 2026 г., 18:00",
  );

  assert.equal(
    formatResetAtForUser("2026-05-18T15:00:00.000Z", "en", "America/New_York"),
    "May 18, 2026, 11:00 AM",
  );
});

test("falls back to raw reset timestamp for invalid values", () => {
  assert.equal(
    formatResetAtForUser("not-a-date", "ru", "Europe/Moscow"),
    "not-a-date",
  );
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
