import type { Billing } from "./types.js";

export type VisionBillingSnapshot =
  | {
      available: true;
      hourlyUsage: number;
      dailyUsage: number;
      weeklyUsage: number;
      maxHourly: number;
      maxDaily: number;
      maxWeekly: number;
    }
  | { available: false };

export function getVisionBillingSnapshot(billing: Billing | null): VisionBillingSnapshot {
  if (!billing) return { available: false };
  const {
    vision_hourly_usage,
    vision_daily_usage,
    vision_weekly_usage,
    vision_max_hourly,
    vision_max_daily,
    vision_max_weekly,
  } = billing;
  if (
    typeof vision_hourly_usage !== "number" ||
    typeof vision_daily_usage !== "number" ||
    typeof vision_weekly_usage !== "number" ||
    typeof vision_max_hourly !== "number" ||
    typeof vision_max_daily !== "number" ||
    typeof vision_max_weekly !== "number"
  ) {
    return { available: false };
  }
  return {
    available: true,
    hourlyUsage: vision_hourly_usage,
    dailyUsage: vision_daily_usage,
    weeklyUsage: vision_weekly_usage,
    maxHourly: vision_max_hourly,
    maxDaily: vision_max_daily,
    maxWeekly: vision_max_weekly,
  };
}
