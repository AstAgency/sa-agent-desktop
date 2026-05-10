import type { ProjectSummary, SessionMessage, SessionSummary, ViewerProfile, WorkspaceSummary } from "../../../src/renderer/lib/types";

export function buildWorkspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return { id: "ws-1", name: "Personal Workspace", slug: "personal", created_by_user_id: "user-1", created_at: "2026-05-07T00:00:00.000Z", updated_at: "2026-05-07T00:00:00.000Z", ...overrides };
}

export function buildProfile(overrides: Partial<ViewerProfile> = {}): ViewerProfile {
  return {
    user_id: "user-1",
    email: "demo@sa-agent.local",
    display_name: "Demo User",
    onboarding_skill_id: null,
    onboarding_payload: null,
    preferred_user_name: null,
    preferred_agent_name: null,
    activity_domain: null,
    onboarding_completed: false,
    onboarding_completed_at: null,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

export function buildProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "p-1", workspace_id: "ws-1", key: "PRJ", name: "Project", description: null, onboarding_skill_id: null, onboarding_payload: null,
    preferred_user_name: null, preferred_agent_name: null, activity_domain: null, onboarding_completed: true, onboarding_completed_at: null,
    lifecycle_state: "active", created_by_user_id: "user-1", created_at: "2026-05-07T00:00:00.000Z", updated_at: "2026-05-07T00:00:00.000Z", ...overrides,
  };
}

export function buildSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "session-1", workspace_id: "ws-1", project_id: null, active_capability_key: null, active_skill_id: null, execution_id: null,
    execution_status: null, channel_kind: "desktop", session_state: "active", title: "Conversation",
    created_at: "2026-05-07T00:00:00.000Z", updated_at: "2026-05-07T00:00:00.000Z", ...overrides,
  };
}

export function buildAssistantThread(overrides: Record<string, unknown> = {}) {
  return { id: "assistant-thread-1", title: "Assistant", summary: null, status: "active", lifecycle_state: "active", active_execution_id: null, execution_status: null, created_at: "2026-05-07T00:00:00.000Z", updated_at: "2026-05-07T00:00:00.000Z", ...overrides };
}

export function buildMessage(overrides: Partial<SessionMessage> & Pick<SessionMessage, "id" | "role" | "content_markdown">): SessionMessage {
  return {
    id: overrides.id, session_id: overrides.session_id ?? "session-1", parent_message_id: overrides.parent_message_id ?? null, role: overrides.role,
    message_kind: overrides.message_kind ?? "chat", content_markdown: overrides.content_markdown, token_estimate: overrides.token_estimate ?? 0,
    is_hidden: overrides.is_hidden ?? false, attachments: overrides.attachments ?? [], created_at: overrides.created_at ?? "2026-05-07T00:00:00.000Z",
  };
}

export function jsonResponse(body: unknown, init: number | ResponseInit = 200) {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    status: responseInit.status ?? 200,
    headers: { "content-type": "application/json; charset=utf-8", ...(responseInit.headers ?? {}) },
  });
}
