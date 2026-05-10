import { PersonalAssistantRuntime } from "../../agent/personal-assistant-runtime";
import { ProjectSessionRuntime } from "../../agent/project-session-runtime";
import { getSession, getSessionMessages, postSessionMessage } from "../../lib/api";
import { recordDebugAgentRuntimeEntry } from "../../lib/debug";
import { translate } from "../../lib/i18n";
import type { ProjectAgentRecord, ProjectSummary, SessionMessage, SessionSummary, ViewerProfile, WorkspaceSummary } from "../../lib/types";
import { createSessionFlowDebugId } from "./helpers";
import { handleRuntimeEvent } from "./runtimeEventBridge";
import type { OnboardingState } from "./types";

export async function sendGlobalTurn(input: {
  language: "ru" | "en";
  workspace: WorkspaceSummary;
  profile: ViewerProfile;
  activeAgentKey: string | null;
  session: SessionSummary;
  contentMarkdown: string;
  hiddenPrompt?: string;
  activeSessionId: string | null;
  activeOnboarding: OnboardingState;
  onRefreshWorkspace?: (preferredProjectId?: string | null) => Promise<void> | void;
  onRefreshProfile?: () => Promise<void> | void;
  setMessages: (messages: SessionMessage[]) => void;
  setToolMessage?: (message: string | null) => void;
  setStreamingAssistantText: (value: string) => void;
  setIsAwaitingAssistantStream: (value: boolean) => void;
  setActiveGlobalSession: (session: SessionSummary) => void;
}): Promise<boolean> {
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.send", sessionId: input.session.id, data: { activeSessionId: input.activeSessionId, contentLength: input.contentMarkdown.length, onboardingKind: input.activeOnboarding?.kind ?? null, mode: "personal-assistant-local" } });
  const shouldPersistUserMessage = input.hiddenPrompt !== input.contentMarkdown;
  if (shouldPersistUserMessage) {
    await postSessionMessage(input.session.id, { content_markdown: input.contentMarkdown, role: "user" });
    recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.persist.user", sessionId: input.session.id, data: { scope: "global", contentLength: input.contentMarkdown.length } });
  }
  const persistedAfterUser = await getSessionMessages(input.session.id);
  input.setMessages(persistedAfterUser);
  const runtimeMessages = shouldPersistUserMessage
    ? persistedAfterUser
    : [...persistedAfterUser, buildEphemeralUserMessage(input.session.id, input.contentMarkdown)];

  const runtime = await PersonalAssistantRuntime.create({ workspaceId: input.workspace.id, threadId: input.session.id, initialMessages: runtimeMessages, profile: input.profile });
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "runtime.local.start", sessionId: input.session.id, data: { scope: "global", transcriptLength: runtimeMessages.length } });
  const unsubscribe = runtime.subscribe((event) => {
    input.setStreamingAssistantText(runtime.getStreamingAssistantText());
    input.setIsAwaitingAssistantStream(runtime.isStreaming());
    handleRuntimeEvent({ language: input.language, sessionId: input.session.id, rawEvent: event, setToolMessage: input.setToolMessage });
  });
  const result = await runtime.continueFromTranscript().finally(unsubscribe);

  if (result.assistantText.trim().length > 0) {
    await postSessionMessage(input.session.id, { role: "assistant", actor_id: input.activeAgentKey ?? "sa-agent", content_markdown: result.assistantText });
    recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.persist.assistant", sessionId: input.session.id, data: { scope: "global", contentLength: result.assistantText.length } });
  }

  const [persistedAfterAssistant, nextSession] = await Promise.all([
    getSessionMessages(input.session.id),
    getSession(input.session.id),
  ]);
  input.setMessages(persistedAfterAssistant);
  input.setStreamingAssistantText("");
  input.setIsAwaitingAssistantStream(false);
  input.setActiveGlobalSession(nextSession);
  if (result.profileUpdated) {
    await input.onRefreshProfile?.();
  }
  if (input.activeOnboarding?.kind === "user" && result.onboardingCompleted) input.activeOnboarding.onComplete();
  if (result.projectCreated) await input.onRefreshWorkspace?.(result.createdProjectId);
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "runtime.local.complete", sessionId: input.session.id, data: { scope: "global", onboardingCompleted: result.onboardingCompleted, projectCreated: result.projectCreated } });
  return true;
}

export async function sendProjectTurn(input: {
  language: "ru" | "en";
  workspace: WorkspaceSummary;
  project: ProjectSummary | null;
  session: SessionSummary;
  contentMarkdown: string;
  activeAgentKey: string | null;
  activeSessionId: string | null;
  activeProjectAgentId: string | null;
  activeProjectAgent: ProjectAgentRecord | null;
  projectAgents: ProjectAgentRecord[];
  hiddenPrompt?: string;
  activeOnboarding: OnboardingState;
  setMessages: (messages: SessionMessage[]) => void;
  setToolMessage?: (message: string | null) => void;
  setStreamingAssistantText: (value: string) => void;
  setIsAwaitingAssistantStream: (value: boolean) => void;
  setActiveProjectSession: (session: SessionSummary) => void;
}): Promise<boolean> {
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.send", sessionId: input.session.id, data: { activeSessionId: input.activeSessionId, contentLength: input.contentMarkdown.length, onboardingKind: input.activeOnboarding?.kind ?? null } });
  const shouldPersistUserMessage = input.hiddenPrompt !== input.contentMarkdown;
  if (shouldPersistUserMessage) {
    await postSessionMessage(input.session.id, { content_markdown: input.contentMarkdown, role: "user" });
    recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.persist.user", sessionId: input.session.id, data: { scope: "project", contentLength: input.contentMarkdown.length } });
  }
  const persistedAfterUser = await getSessionMessages(input.session.id);
  input.setMessages(persistedAfterUser);
  const runtimeMessages = shouldPersistUserMessage
    ? persistedAfterUser
    : [...persistedAfterUser, buildEphemeralUserMessage(input.session.id, input.contentMarkdown)];
  const projectAgentId = input.activeProjectAgentId ?? input.activeProjectAgent?.id ?? input.projectAgents[0]?.id;
  if (!projectAgentId) throw new Error(translate(input.language, "workspace.error.loadCapabilities"));

  const runtime = await ProjectSessionRuntime.create({ workspaceId: input.workspace.id, projectId: input.project?.id ?? null, sessionId: input.session.id, initialMessages: runtimeMessages, projectAgentId, capabilityKey: input.session.active_capability_key ?? null, projectName: input.project?.name ?? null });
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "runtime.local.start", sessionId: input.session.id, data: { scope: "project", transcriptLength: runtimeMessages.length, capabilityKey: input.session.active_capability_key ?? null } });
  const unsubscribe = runtime.subscribe((event) => {
    input.setStreamingAssistantText(runtime.getStreamingAssistantText());
    input.setIsAwaitingAssistantStream(runtime.isStreaming());
    handleRuntimeEvent({ language: input.language, sessionId: input.session.id, rawEvent: event, setToolMessage: input.setToolMessage });
  });
  const result = await runtime.continueFromTranscript().finally(unsubscribe);

  if (result.assistantText.trim().length > 0) {
    await postSessionMessage(input.session.id, { role: "assistant", actor_id: input.activeAgentKey ?? null, content_markdown: result.assistantText });
    recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.persist.assistant", sessionId: input.session.id, data: { scope: "project", contentLength: result.assistantText.length } });
  }

  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "messages.fetch", sessionId: input.session.id, data: { source: "post-send-refresh" } });
  const [nextMessages, nextSession] = await Promise.all([getSessionMessages(input.session.id), getSession(input.session.id)]);
  input.setMessages(nextMessages.filter((message) => message.content_markdown !== input.hiddenPrompt));
  input.setStreamingAssistantText("");
  input.setIsAwaitingAssistantStream(false);
  input.setActiveProjectSession(nextSession);
  if (input.activeOnboarding?.kind === "project" && result.projectOnboardingCompleted) input.activeOnboarding.onComplete();
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "runtime.local.complete", sessionId: input.session.id, data: { scope: "project", projectOnboardingCompleted: result.projectOnboardingCompleted } });
  return true;
}

function buildEphemeralUserMessage(sessionId: string, contentMarkdown: string): SessionMessage {
  return {
    id: `ephemeral-user-${sessionId}-${contentMarkdown.length}`,
    session_id: sessionId,
    parent_message_id: null,
    role: "user",
    message_kind: "chat",
    content_markdown: contentMarkdown,
    token_estimate: contentMarkdown.length,
    is_hidden: true,
    attachments: [],
    created_at: new Date().toISOString(),
  };
}
