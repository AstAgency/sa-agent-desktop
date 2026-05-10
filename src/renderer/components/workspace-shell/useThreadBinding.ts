import { useEffect } from "react";
import { translate } from "../../lib/i18n";
import { matchesSessionCapability } from "./helpers";
import type { OnboardingState } from "./types";
import { useOnboardingFlow } from "./useOnboardingFlow";
import { useWorkspaceShellState } from "./useWorkspaceShellState";

const ONBOARDING_START_PROMPT = {
  ru: "Начни онбординг на русском языке, задай первый вопрос и веди диалог до завершения.",
  en: "Start onboarding in English, ask the first question, and continue the dialog until completion.",
} as const;

export function useThreadBinding(input: {
  language: "ru" | "en";
  onboarding: OnboardingState;
  capabilities: Array<{ capability_key: string; mode?: string | null }>;
  state: ReturnType<typeof useWorkspaceShellState>;
  messages: Parameters<typeof useOnboardingFlow>[0]["messages"];
  streamingAssistantText: string;
  isLoadingMessages: boolean;
  activeProjectThreadId: string | null;
  projectThreads: Array<{ id?: string | null }>;
  ensureSessionForCurrentScope: Parameters<typeof useOnboardingFlow>[0]["ensureSessionForCurrentScope"];
  sendMessage: Parameters<typeof useOnboardingFlow>[0]["sendMessage"];
  onActiveThreadChange?: (threadId: string | null) => void;
}) {
  const onboardingKey = input.onboarding?.kind === "project" ? "project_onboarding" : "user_onboarding";
  const onboardingCapability = input.onboarding
    ? input.capabilities.find((capability) => capability.capability_key === onboardingKey) ?? null
    : null;
  const onboardingSession = input.onboarding
    ? input.onboarding.kind === "user"
      ? input.state.activeSession ?? input.state.currentSessions[0] ?? null
      : (matchesSessionCapability(input.state.activeSession, onboardingKey) ? input.state.activeSession : null) ??
        input.state.currentSessions.find((session) => matchesSessionCapability(session, onboardingKey)) ??
        null
    : null;
  const projectRuntimeReady = input.onboarding?.kind !== "project"
    || Boolean(input.state.activeProjectAgentId);

  const { visibleMessages } = useOnboardingFlow({
    language: input.language,
    onboarding: input.onboarding,
    onboardingSession,
    activeSession: input.state.activeSession,
    currentSessions: input.state.currentSessions,
    isCreatingSession: input.state.isCreatingSession,
    expectedOnboardingCapabilityKey: input.onboarding ? onboardingKey : null,
    expectedOnboardingCapabilityMode: onboardingCapability?.mode ?? null,
    blockedOnboardingCapabilityKey: input.state.blockedOnboardingCapabilityKey,
    canStartOnboardingRuntime: projectRuntimeReady,
    onboardingBootstrapSentSessionIdsRef: input.state.onboardingBootstrapSentSessionIdsRef,
    startPrompts: ONBOARDING_START_PROMPT,
    messages: input.messages,
    streamingAssistantText: input.streamingAssistantText,
    isLoadingMessages: input.isLoadingMessages,
    errorMessage: input.state.errorMessage,
    messagesContainerRef: input.state.messagesContainerRef,
    messagesEndRef: input.state.messagesEndRef,
    onSetBlockedCapability: input.state.setBlockedOnboardingCapabilityKey,
    onError: input.state.setErrorMessage,
    onRecoveringChange: input.state.setIsRecoveringOnboarding,
    isRecoveringOnboarding: input.state.isRecoveringOnboarding,
    onSessionPinned: (session) => input.state.setActiveSessionByScope((current) => ({ ...current, [input.onboarding?.kind === "user" ? "global" : "project"]: session })),
    ensureSessionForCurrentScope: input.ensureSessionForCurrentScope,
    sendMessage: input.sendMessage,
  });

  useEffect(() => {
    const nextThreadId = input.state.currentScope === "global"
      ? input.state.activeSession?.id ?? null
      : input.activeProjectThreadId ?? input.projectThreads[0]?.id ?? null;
    void input.onActiveThreadChange?.(nextThreadId);
  }, [input.activeProjectThreadId, input.onActiveThreadChange, input.projectThreads, input.state.activeSession?.id, input.state.currentScope]);

  const isSendDisabled = !input.state.draftMessage.trim()
    || input.state.isSendingMessage
    || input.state.isCreatingSession
    || (Boolean(input.onboarding) && !onboardingSession);
  const sendDisabledReason = input.state.isCreatingSession || (Boolean(input.onboarding) && !onboardingSession)
    ? translate(input.language, "chat.send.disabled.onboarding")
    : input.state.isSendingMessage
      ? translate(input.language, "chat.send.disabled.pending")
      : null;

  return { onboardingSession, visibleMessages, isSendDisabled, sendDisabledReason };
}
