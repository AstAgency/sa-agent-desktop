import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { translate } from "../../lib/i18n";
import type { AppLanguage, SessionMessage, SessionSummary } from "../../lib/types";
import { isHiddenPromptMessage, matchesSessionCapability } from "./helpers";
import type { OnboardingState } from "./types";

export function useOnboardingFlow(input: {
  language: AppLanguage;
  onboarding: OnboardingState;
  onboardingSession: SessionSummary | null;
  activeSession: SessionSummary | null;
  currentSessions: SessionSummary[];
  isCreatingSession: boolean;
  expectedOnboardingCapabilityKey: string | null;
  expectedOnboardingCapabilityMode: string | null;
  blockedOnboardingCapabilityKey: string | null;
  canStartOnboardingRuntime: boolean;
  onboardingBootstrapSentSessionIdsRef: React.MutableRefObject<Set<string>>;
  startPrompts: Record<string, string>;
  messages: SessionMessage[];
  streamingAssistantText: string;
  isLoadingMessages: boolean;
  errorMessage: string | null;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onSetBlockedCapability: (capabilityKey: string) => void;
  onError: (message: string | null) => void;
  onRecoveringChange: (value: boolean) => void;
  isRecoveringOnboarding: boolean;
  onSessionPinned: (session: SessionSummary) => void;
  ensureSessionForCurrentScope: (options?: { capabilityKey?: string; capabilityInput?: Record<string, unknown> }) => Promise<SessionSummary>;
  sendMessage: (session: SessionSummary, contentMarkdown: string, options?: { hiddenPrompt?: string }, activeOnboarding?: OnboardingState) => Promise<boolean>;
}) {
  const failedBootstrapKeyRef = useRef<string | null>(null);
  const failedBootstrapKeysRef = useRef(new Set<string>());
  const inFlightBootstrapKeysRef = useRef(new Set<string>());
  const inFlightBootstrapSessionIdsRef = useRef(new Set<string>());
  const bootstrapKey = input.onboarding
    ? `${input.onboarding.kind}:${input.onboarding.kind === "user" ? input.onboarding.workspaceId : input.onboarding.projectId}:${input.language}:${input.expectedOnboardingCapabilityKey ?? "default"}`
    : null;

  useEffect(() => {
    if (!bootstrapKey) {
      failedBootstrapKeyRef.current = null;
      failedBootstrapKeysRef.current.clear();
      inFlightBootstrapKeysRef.current.clear();
    }
  }, [bootstrapKey]);

  useEffect(() => {
    if (!input.onboardingSession || !input.onboarding) return;
    const status = input.onboardingSession.execution_status ?? null;
    const isTerminal = status === "completed" || status === "applied" || status === "failed";
    if (!isTerminal || input.isRecoveringOnboarding) return;
    let isActive = true;
    input.onRecoveringChange(true);
    input.onError(null);
    void Promise.resolve(input.onboarding.onComplete()).catch((error) => {
      if (isActive) input.onError(error instanceof Error ? error.message : translate(input.language, "workspace.error.recoverOnboarding"));
    }).finally(() => {
      if (isActive) input.onRecoveringChange(false);
    });
    return () => {
      isActive = false;
    };
  }, [input]);

  useEffect(() => {
    if (!input.onboarding || input.isCreatingSession || !input.canStartOnboardingRuntime) return;
    const hasTranscriptActivity = input.streamingAssistantText.trim().length > 0
      || input.messages.some((message) => !message.is_hidden && !isHiddenPromptMessage(message.content_markdown, input.startPrompts));
    if (hasTranscriptActivity) return;
    if (bootstrapKey && failedBootstrapKeyRef.current === bootstrapKey) return;
    if (bootstrapKey && (failedBootstrapKeysRef.current.has(bootstrapKey) || inFlightBootstrapKeysRef.current.has(bootstrapKey))) return;
    if (input.onboarding.kind === "project" && input.expectedOnboardingCapabilityKey && input.blockedOnboardingCapabilityKey === input.expectedOnboardingCapabilityKey) return;
    if (input.onboarding.kind === "project" && input.expectedOnboardingCapabilityMode && !["interactive", "both"].includes(input.expectedOnboardingCapabilityMode)) {
      input.onSetBlockedCapability(input.expectedOnboardingCapabilityKey ?? "project_onboarding");
      input.onError(translate(input.language, "projectOnboarding.error.nonInteractive"));
      return;
    }
    if (input.onboardingSession) {
      if (input.activeSession?.id !== input.onboardingSession.id) input.onSessionPinned(input.onboardingSession);
      if (input.onboardingBootstrapSentSessionIdsRef.current.has(input.onboardingSession.id)) return;
      if (inFlightBootstrapSessionIdsRef.current.has(input.onboardingSession.id)) return;
    }
    let isActive = true;
    if (bootstrapKey) {
      inFlightBootstrapKeysRef.current.add(bootstrapKey);
    }
    void input.ensureSessionForCurrentScope({ capabilityKey: input.expectedOnboardingCapabilityKey ?? undefined, capabilityInput: input.onboarding.kind === "project" ? { locale: input.language } : undefined })
      .then(async (session) => {
        if (!isActive || input.onboardingBootstrapSentSessionIdsRef.current.has(session.id) || inFlightBootstrapSessionIdsRef.current.has(session.id)) return;
        inFlightBootstrapSessionIdsRef.current.add(session.id);
        const sent = await input.sendMessage(session, input.startPrompts[input.language], { hiddenPrompt: input.startPrompts[input.language] }, input.onboarding);
        inFlightBootstrapSessionIdsRef.current.delete(session.id);
        if (bootstrapKey) {
          inFlightBootstrapKeysRef.current.delete(bootstrapKey);
        }
        if (sent) {
          input.onboardingBootstrapSentSessionIdsRef.current.add(session.id);
          return;
        }
        if (input.onboardingSession?.id) input.onboardingBootstrapSentSessionIdsRef.current.delete(input.onboardingSession.id);
      })
      .catch((error) => {
        if (!isActive) return;
        if (bootstrapKey) {
          inFlightBootstrapKeysRef.current.delete(bootstrapKey);
          failedBootstrapKeyRef.current = bootstrapKey;
          failedBootstrapKeysRef.current.add(bootstrapKey);
        }
        const message = error instanceof Error ? error.message : translate(input.language, "workspace.error.startOnboarding");
        if (input.onboarding?.kind === "project" && input.expectedOnboardingCapabilityKey && (message.includes("does not support interactive sessions") || message.includes("skill_not_interactive"))) {
          input.onSetBlockedCapability(input.expectedOnboardingCapabilityKey);
          input.onError(translate(input.language, "projectOnboarding.error.nonInteractive"));
          return;
        }
        if (input.onboardingSession?.id) input.onboardingBootstrapSentSessionIdsRef.current.delete(input.onboardingSession.id);
        if (input.onboardingSession?.id) inFlightBootstrapSessionIdsRef.current.delete(input.onboardingSession.id);
        input.onError(message);
      });
    return () => {
      isActive = false;
    };
  }, [bootstrapKey, input]);

  const visibleMessages = useMemo(() => input.messages.filter((message) => !message.is_hidden && !isHiddenPromptMessage(message.content_markdown, input.startPrompts)), [input.messages, input.startPrompts]);

  useLayoutEffect(() => {
    const sentinel = input.messagesEndRef.current;
    if (!sentinel) return;
    const frameId = window.requestAnimationFrame(() => {
      if (typeof sentinel.scrollIntoView === "function") return sentinel.scrollIntoView({ block: "end" });
      const container = input.messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [input.errorMessage, input.isCreatingSession, input.isLoadingMessages, input.streamingAssistantText, visibleMessages.length]);

  return { visibleMessages, matchesSessionCapability };
}
