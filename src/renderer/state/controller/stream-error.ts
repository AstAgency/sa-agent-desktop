import { ChatCompletionError } from "../../lib/api.js";
import { translate, type AppLanguage } from "../../lib/i18n.js";
import type { Billing } from "../../lib/types.js";

type StreamErrorKind = "rate_limit" | "timeout" | "generic";

function isHourlyTokenLimitError(error: ChatCompletionError): boolean {
  return (
    error.code === "rate_limited" &&
    /hourly token limit exceeded/i.test(error.message)
  );
}

function getLanguageLocale(language: AppLanguage): string {
  return language === "ru" ? "ru-RU" : "en-US";
}

export function formatResetAtForUser(
  resetAt: string,
  language: AppLanguage,
  timeZone?: string,
): string {
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return resetAt;

  return new Intl.DateTimeFormat(getLanguageLocale(language), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function describeStreamError(
  error: unknown,
  language: AppLanguage,
  billing: Billing | null,
): { kind: StreamErrorKind; message: string } {
  const kind: StreamErrorKind =
    error instanceof ChatCompletionError ? error.kind : "generic";
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (kind === "rate_limit") {
    if (
      error instanceof ChatCompletionError &&
      isHourlyTokenLimitError(error) &&
      billing?.hourly_reset_at
    ) {
      return {
        kind,
        message: translate(language, "chat.error.rateLimit.hourly", {
          resetAt: formatResetAtForUser(billing.hourly_reset_at, language),
        }),
      };
    }
    return { kind, message: translate(language, "chat.error.rateLimit") };
  }

  if (kind === "timeout") {
    return { kind, message: translate(language, "chat.error.timeout") };
  }

  return {
    kind,
    message: translate(language, "chat.error.generic", { message: rawMessage }),
  };
}
