import { useRef } from "react";
import { createSession } from "../../lib/api";
import { recordDebugAgentRuntimeEntry } from "../../lib/debug";
import { translate } from "../../lib/i18n";
import type { ConversationScope, SessionSummary, WorkspaceSummary } from "../../lib/types";
import { createSessionFlowDebugId, matchesSessionCapability } from "./helpers";
import { sendGlobalTurn, sendProjectTurn } from "./conversationTurns";
import type { OnboardingState } from "./types";

export function useConversationFlow(input: {
  language: "ru" | "en";
  workspace: WorkspaceSummary;
  projectId: string | null;
  projectName: string | null;
  activeAgentKey: string | null;
  currentScope: ConversationScope;
  currentSessions: SessionSummary[];
  activeSessionByScope: Record<ConversationScope, SessionSummary | null>;
  activeSession: SessionSummary | null;
  activeProjectAgentId: string | null;
  activeProjectAgent: { id?: string | null } | null;
  projectAgents: Array<{ id: string }>;
  profile: Parameters<typeof sendGlobalTurn>[0]["profile"];
  onRefreshWorkspace?: (preferredProjectId?: string | null) => Promise<void> | void;
  onRefreshProfile?: () => Promise<void> | void;
  setActiveSessionByScope: React.Dispatch<React.SetStateAction<Record<ConversationScope, SessionSummary | null>>>;
  setMessages: (messages: Parameters<typeof sendGlobalTurn>[0]["setMessages"] extends (v: infer T) => void ? T : never) => void;
  setStreamingAssistantText: (value: string) => void;
  setIsAwaitingAssistantStream: (value: boolean) => void;
  setIsCreatingSession: (value: boolean) => void;
  setIsSendingMessage: (value: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  setToolMessage: (message: string | null) => void;
}) {
  const abortControllerRef = useRef<AbortController | null>(null);

  async function ensureSessionForCurrentScope(options?: { capabilityKey?: string; capabilityInput?: Record<string, unknown> }) {
    const scopeKey = options?.capabilityKey === "project_onboarding" || input.projectId ? "project" : "global";
    const existingSession = options?.capabilityKey
      ? input.currentSessions.find((session) => matchesSessionCapability(session, options.capabilityKey ?? null)) ?? (matchesSessionCapability(input.activeSession, options.capabilityKey ?? null) ? input.activeSession : null)
      : input.activeSessionByScope[scopeKey] ?? input.currentSessions[0] ?? null;
    if (existingSession) return existingSession;

    input.setIsCreatingSession(true);
    input.setErrorMessage(null);
    try {
      const createdSession = await createSession({ workspace_id: input.workspace.id, project_id: input.projectId ?? undefined, agent_key: input.activeAgentKey ?? undefined, capability_key: options?.capabilityKey, input: options?.capabilityInput, channel_kind: "desktop", resume_strategy: "new" });
      input.setActiveSessionByScope((current) => ({ ...current, [scopeKey]: createdSession }));
      recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "session.created", sessionId: createdSession.id, data: { scope: scopeKey, capabilityKey: options?.capabilityKey ?? null, projectId: createdSession.project_id ?? null } });
      return createdSession;
    } finally {
      input.setIsCreatingSession(false);
    }
  }

  async function sendMessage(session: SessionSummary, contentMarkdown: string, options?: { hiddenPrompt?: string }, activeOnboarding?: OnboardingState) {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    input.setIsSendingMessage(true);
    input.setStreamingAssistantText("");
    input.setIsAwaitingAssistantStream(true);

    try {
      if (input.currentScope === "global") {
        await sendGlobalTurn({ language: input.language, workspace: input.workspace, profile: input.profile, activeAgentKey: input.activeAgentKey, session, contentMarkdown, hiddenPrompt: options?.hiddenPrompt, activeSessionId: input.activeSession?.id ?? null, activeOnboarding: activeOnboarding ?? null, onRefreshWorkspace: input.onRefreshWorkspace, onRefreshProfile: input.onRefreshProfile, setMessages: input.setMessages, setToolMessage: input.setToolMessage, setStreamingAssistantText: input.setStreamingAssistantText, setIsAwaitingAssistantStream: input.setIsAwaitingAssistantStream, setActiveGlobalSession: (nextSession) => input.setActiveSessionByScope((current) => ({ ...current, global: nextSession })) });
      } else {
        await sendProjectTurn({ language: input.language, workspace: input.workspace, project: input.projectId ? { id: input.projectId, name: input.projectName } as never : null, session, contentMarkdown, activeAgentKey: input.activeAgentKey, activeSessionId: input.activeSession?.id ?? null, activeProjectAgentId: input.activeProjectAgentId, activeProjectAgent: input.activeProjectAgent as never, projectAgents: input.projectAgents as never, hiddenPrompt: options?.hiddenPrompt, activeOnboarding: activeOnboarding ?? null, setMessages: input.setMessages, setToolMessage: input.setToolMessage, setStreamingAssistantText: input.setStreamingAssistantText, setIsAwaitingAssistantStream: input.setIsAwaitingAssistantStream, setActiveProjectSession: (nextSession) => input.setActiveSessionByScope((current) => ({ ...current, [session.project_id ? "project" : "global"]: nextSession })) });
      }
      return true;
    } catch (error) {
      input.setStreamingAssistantText("");
      input.setIsAwaitingAssistantStream(false);
      input.setErrorMessage(error instanceof Error ? error.message : translate(input.language, "workspace.error.sendMessage"));
      return false;
    } finally {
      input.setIsAwaitingAssistantStream(false);
      input.setIsSendingMessage(false);
    }
  }

  return { abortControllerRef, ensureSessionForCurrentScope, sendMessage };
}
