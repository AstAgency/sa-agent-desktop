import type { McpToolCallResult, ViewerProfile } from "../lib/types";

const PROFILE_MUTATION_TOOLS = new Set(["profile.update", "profile.complete_onboarding"]);

export function preparePersonalBackendToolCall(input: {
  toolName: string;
  args: Record<string, unknown>;
  currentProfile: ViewerProfile;
  appliedMutationKeys: Set<string>;
}) {
  if (!PROFILE_MUTATION_TOOLS.has(input.toolName)) {
    return { args: input.args, dedupeKey: null, skip: false };
  }

  const payload = readPayload(input.args);
  const dedupeKey = `${input.toolName}:${stableJson(payload ?? {})}`;
  const args = { ...input.args, idempotency_key: createClientIdempotencyKey(input.toolName, payload ?? {}) };
  const skip = !payload || input.appliedMutationKeys.has(dedupeKey) || isProfileMutationAlreadyApplied(input.currentProfile, payload);
  return { args, dedupeKey, skip };
}

export function buildSkippedProfileMutationResult(toolName: string, currentProfile: ViewerProfile): McpToolCallResult {
  return {
    serverName: "user",
    toolName,
    isError: false,
    content: [{ type: "text", text: "Profile mutation already applied." }],
    structuredContent: {
      ok: true,
      skipped: true,
      reason: "already_applied",
      result: currentProfile,
    },
  };
}

export function isSkippedMutationResult(details: unknown) {
  return Boolean(details && typeof details === "object" && (details as { skipped?: unknown }).skipped === true);
}

function isProfileMutationAlreadyApplied(profile: ViewerProfile, payload: Record<string, unknown>) {
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return true;
  }

  let matchedFields = 0;
  const alreadyApplied = entries.every(([key, value]) => {
    if (key === "onboarding_payload") {
      matchedFields += 1;
      return stableJson(profile.onboarding_payload ?? null) === stableJson(value ?? null);
    }
    if (key === "onboarding_completed") {
      matchedFields += 1;
      return profile.onboarding_completed === value;
    }
    if (key in profile) {
      matchedFields += 1;
      return stableJson((profile as Record<string, unknown>)[key]) === stableJson(value);
    }
    return false;
  });

  return alreadyApplied && matchedFields > 0;
}

function readPayload(args: Record<string, unknown>) {
  const payload = args.payload;
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
}

function createClientIdempotencyKey(toolName: string, payload: Record<string, unknown>) {
  return `client-${toolName.replace(/\./g, "-")}-${hashString(stableJson(payload))}`;
}

function hashString(value: string) {
  let hash = 5381;
  for (const char of value) hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
  return Math.abs(hash >>> 0).toString(36);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
