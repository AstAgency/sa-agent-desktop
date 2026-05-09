import { PersonalAssistantRuntime } from "../../agent/personal-assistant-runtime";
import { ProjectSessionRuntime } from "../../agent/project-session-runtime";
import { getAssistantThread, getSession, getSessionMessages, postAssistantThreadMessage, postSessionMessage } from "../../lib/api";
import { recordDebugAgentRuntimeEntry } from "../../lib/debug";
import { translate } from "../../lib/i18n";
import type { ProjectAgentRecord, ProjectSummary, SessionMessage, SessionSummary, ViewerProfile, WorkspaceSummary } from "../../lib/types";
import { createSessionFlowDebugId, mapAssistantThreadToSessionSummary } from "./helpers";
import type { OnboardingState } from "./types";

export async function sendGlobalTurn(input: {
  workspace: WorkspaceSummary;
  profile: ViewerProfile;
  activeAgentKey: string | null;
  session: SessionSummary;
  contentMarkdown: string;
  activeSessionId: string | null;
  activeOnboarding: OnboardingState;
  onRefreshWorkspace?: () => Promise<void> | void;
  setMessages: (messages: SessionMessage[]) => void;
  setStreamingAssistantText: (value: string) => void;
  setIsAwaitingAssistantStream: (value: boolean) => void;
  setActiveGlobalSession: (session: SessionSummary) => void;
}) {
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.send", sessionId: input.session.id, data: { activeSessionId: input.activeSessionId, contentLength: input.contentMarkdown.length, onboardingKind: input.activeOnboarding?.kind ?? null, mode: "personal-assistant-local" } });
  await postAssistantThreadMessage({ content_markdown: input.contentMarkdown, role: "user" });
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.persist.user", sessionId: input.session.id, data: { scope: "global", contentLength: input.contentMarkdown.length } });
  const persistedAfterUser = await getAssistantThread();
  input.setMessages(persistedAfterUser.messages);
  input.setActiveGlobalSession(mapAssistantThreadToSessionSummary(persistedAfterUser.thread, input.workspace.id));

  const runtime = await PersonalAssistantRuntime.create({ workspaceId: input.workspace.id, threadId: input.session.id, initialMessages: persistedAfterUser.messages, profile: input.profile });
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "runtime.local.start", sessionId: input.session.id, data: { scope: "global", transcriptLength: persistedAfterUser.messages.length } });
  const unsubscribe = runtime.subscribe(() => {
    input.setStreamingAssistantText(runtime.getStreamingAssistantText());
    input.setIsAwaitingAssistantStream(runtime.isStreaming());
  });
  const result = await runtime.continueFromTranscript().finally(unsubscribe);

  if (result.assistantText.trim().length > 0) {
    await postAssistantThreadMessage({ role: "assistant", actor_id: input.activeAgentKey ?? "sa-agent", content_markdown: result.assistantText });
    recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.persist.assistant", sessionId: input.session.id, data: { scope: "global", contentLength: result.assistantText.length } });
  }

  const persistedAfterAssistant = await getAssistantThread();
  input.setMessages(persistedAfterAssistant.messages);
  input.setStreamingAssistantText("");
  input.setIsAwaitingAssistantStream(false);
  input.setActiveGlobalSession(mapAssistantThreadToSessionSummary(persistedAfterAssistant.thread, input.workspace.id));
  if (input.activeOnboarding?.kind === "user" && result.onboardingCompleted) input.activeOnboarding.onComplete();
  if (result.projectCreated) await input.onRefreshWorkspace?.();
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "runtime.local.complete", sessionId: input.session.id, data: { scope: "global", onboardingCompleted: result.onboardingCompleted, projectCreated: result.projectCreated } });
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
  setStreamingAssistantText: (value: string) => void;
  setIsAwaitingAssistantStream: (value: boolean) => void;
  setActiveProjectSession: (session: SessionSummary) => void;
}) {
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.send", sessionId: input.session.id, data: { activeSessionId: input.activeSessionId, contentLength: input.contentMarkdown.length, onboardingKind: input.activeOnboarding?.kind ?? null } });
  await postSessionMessage(input.session.id, { content_markdown: input.contentMarkdown, role: "user" });
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "message.persist.user", sessionId: input.session.id, data: { scope: "project", contentLength: input.contentMarkdown.length } });
  const persistedAfterUser = await getSessionMessages(input.session.id);
  input.setMessages(persistedAfterUser);
  const projectAgentId = input.activeProjectAgentId ?? input.activeProjectAgent?.id ?? input.projectAgents[0]?.id;
  if (!projectAgentId) throw new Error(translate(input.language, "workspace.error.loadCapabilities"));

  const runtime = await ProjectSessionRuntime.create({ workspaceId: input.workspace.id, projectId: input.project?.id ?? null, sessionId: input.session.id, initialMessages: persistedAfterUser, projectAgentId, capabilityKey: input.session.active_capability_key ?? null, projectName: input.project?.name ?? null });
  recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "runtime.local.start", sessionId: input.session.id, data: { scope: "project", transcriptLength: persistedAfterUser.length, capabilityKey: input.session.active_capability_key ?? null } });
  const unsubscribe = runtime.subscribe(() => {
    input.setStreamingAssistantText(runtime.getStreamingAssistantText());
    input.setIsAwaitingAssistantStream(runtime.isStreaming());
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
}
