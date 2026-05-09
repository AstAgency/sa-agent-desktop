import { translate } from "../../lib/i18n";
import type { AppLanguage, SessionSummary, ViewerProfile } from "../../lib/types";

export function createSessionFlowDebugId() {
  return `session-flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function matchesSessionCapability(session: SessionSummary | null | undefined, capabilityKey: string | null | undefined) {
  return Boolean(session && capabilityKey && session.active_capability_key === capabilityKey);
}

export function isHiddenPromptMessage(contentMarkdown: string, prompts: Record<string, string>) {
  return Object.values(prompts).includes(contentMarkdown);
}

export function mapAssistantThreadToSessionSummary(
  thread: {
    id: string;
    title?: string | null;
    summary?: string | null;
    status?: string | null;
    lifecycle_state?: string | null;
    active_execution_id?: string | null;
    execution_status?: SessionSummary["execution_status"];
    created_at?: string | null;
    updated_at?: string | null;
  },
  workspaceId: string,
): SessionSummary {
  return {
    id: thread.id,
    workspace_id: workspaceId,
    project_id: null,
    title: thread.title ?? thread.summary ?? null,
    summary: thread.summary ?? null,
    status: thread.status ?? null,
    lifecycle_state: thread.lifecycle_state ?? null,
    execution_id: thread.active_execution_id ?? null,
    execution_status: thread.execution_status ?? null,
    created_at: thread.created_at ?? undefined,
    updated_at: thread.updated_at ?? undefined,
  };
}

export function readProfilePreferredUserName(profile: ViewerProfile) {
  return readStringFromRecord(profile.onboarding_payload, ["preferred_user_name", "user_name", "name"]) ?? profile.preferred_user_name;
}

export function readProfilePreferredAgentName(profile: ViewerProfile) {
  return readStringFromRecord(profile.onboarding_payload, ["preferred_agent_name", "agent_name"]) ?? profile.preferred_agent_name;
}

export function readProfileActivityDomain(profile: ViewerProfile) {
  return readStringFromRecord(profile.onboarding_payload, ["activity_domain", "domain", "role"]) ?? profile.activity_domain;
}

export function readExecutionStatusLabel(language: AppLanguage, status: string) {
  const key = `workspace.execution.${status}` as const;
  const translated = translate(language, key as never);
  return translated === key ? status : translated;
}

function readStringFromRecord(value: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!value) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}
