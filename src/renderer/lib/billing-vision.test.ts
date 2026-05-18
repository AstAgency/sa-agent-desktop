import test from "node:test";
import assert from "node:assert/strict";
import { getVisionBillingSnapshot } from "./billing-vision.js";
import type { Billing } from "./types.js";

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
    hourly_reset_at: "2026-05-18T10:00:00.000Z",
    daily_reset_at: "2026-05-18T10:00:00.000Z",
    weekly_reset_at: "2026-05-18T10:00:00.000Z",
    updated_at: "2026-05-18T10:00:00.000Z",
    ...overrides,
  };
}

test("returns available snapshot when all vision billing fields are present", () => {
  assert.deepEqual(
    getVisionBillingSnapshot(
      billing({
        vision_hourly_usage: 4,
        vision_daily_usage: 5,
        vision_weekly_usage: 6,
        vision_max_hourly: 40,
        vision_max_daily: 50,
        vision_max_weekly: 60,
      }),
    ),
    {
      available: true,
      hourlyUsage: 4,
      dailyUsage: 5,
      weeklyUsage: 6,
      maxHourly: 40,
      maxDaily: 50,
      maxWeekly: 60,
    },
  );
});

test("returns unavailable snapshot when any vision billing field is missing", () => {
  assert.deepEqual(
    getVisionBillingSnapshot(
      billing({
        vision_hourly_usage: 4,
        vision_daily_usage: 5,
        vision_weekly_usage: 6,
        vision_max_hourly: 40,
        vision_max_daily: 50,
      }),
    ),
    { available: false },
  );
});

test("returns unavailable snapshot for null billing", () => {
  assert.deepEqual(getVisionBillingSnapshot(null), { available: false });
});
