import { useEffect, useRef, useState } from "react";
import type { ConversationScope, WorkspaceMode } from "../../lib/types";
import { resolveWorkspaceMode } from "../../lib/workspace-mode";
import {
  readProfileActivityDomain,
  readProfilePreferredAgentName,
  readProfilePreferredUserName,
} from "./helpers";
import type { WorkspaceShellProps } from "./types";
import { useLockedPopup } from "./useLockedPopup";
import { useScopeSessions } from "./useScopeSessions";

export function useWorkspaceShellState(
  input: Pick<
    WorkspaceShellProps,
    | "selectedAgentKey"
    | "profile"
    | "project"
    | "globalSessions"
    | "projectSessions"
    | "onboarding"
    | "initialWorkspaceMode"
    | "initialActiveProjectAgentId"
    | "initialActiveSessionId"
    | "onActiveProjectAgentChange"
    | "onActiveSessionChange"
    | "onWorkspaceModeChange"
  >,
) {
  const [draftMessage, setDraftMessage] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProjectAgentId, setActiveProjectAgentId] = useState<string | null>(input.initialActiveProjectAgentId ?? null);
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [blockedOnboardingCapabilityKey, setBlockedOnboardingCapabilityKey] = useState<string | null>(null);
  const [isRecoveringOnboarding, setIsRecoveringOnboarding] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(resolveInitialWorkspaceMode(input.initialWorkspaceMode));
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [isContextPanelCollapsed, setIsContextPanelCollapsed] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const onboardingBootstrapSentSessionIdsRef = useRef(new Set<string>());
  const previousOnboardingRef = useRef<WorkspaceShellProps["onboarding"]>(input.onboarding);
  const { lockedPopup, showLockedPopup, dismissLockedPopup } = useLockedPopup();
  const { activeSessionByScope, setActiveSessionByScope } = useScopeSessions(input.globalSessions, input.projectSessions, input.initialActiveSessionId ?? null);

  const currentScope: ConversationScope = input.project ? "project" : "global";
  const isBlockingOnboarding = false;
  const resolvedWorkspaceMode = resolveWorkspaceMode(workspaceMode);
  const activeAgentKey = input.project?.agent_key ?? input.selectedAgentKey ?? null;
  const currentSessions = input.project ? input.projectSessions : input.globalSessions;
  const activeSession = activeSessionByScope[currentScope] ?? currentSessions[0] ?? null;
  const profilePreferredUserName = readProfilePreferredUserName(input.profile);
  const profilePreferredAgentName = readProfilePreferredAgentName(input.profile);
  const profileActivityDomain = readProfileActivityDomain(input.profile);

  useEffect(() => {
    setWorkspaceMode(resolveInitialWorkspaceMode(input.initialWorkspaceMode));
  }, [input.initialWorkspaceMode]);

  useEffect(() => {
    setActiveProjectAgentId(input.initialActiveProjectAgentId ?? null);
  }, [input.initialActiveProjectAgentId]);

  useEffect(() => {
    void input.onActiveProjectAgentChange?.(activeProjectAgentId);
  }, [activeProjectAgentId, input.onActiveProjectAgentChange]);

  useEffect(() => {
    void input.onActiveSessionChange?.(activeSession?.id ?? null);
  }, [activeSession?.id, input.onActiveSessionChange]);

  useEffect(() => {
    if (!input.onboarding) {
      onboardingBootstrapSentSessionIdsRef.current.clear();
    }
  }, [input.onboarding]);

  useEffect(() => {
    if (previousOnboardingRef.current?.kind === "user" && !input.onboarding) {
      setWorkspaceMode("thread");
      void input.onWorkspaceModeChange?.("thread");
    }
    previousOnboardingRef.current = input.onboarding;
  }, [input.onboarding, input.onWorkspaceModeChange]);

  return {
    draftMessage,
    setDraftMessage,
    isCreatingSession,
    setIsCreatingSession,
    isSendingMessage,
    setIsSendingMessage,
    errorMessage,
    setErrorMessage,
    activeProjectAgentId,
    setActiveProjectAgentId,
    toolMessage,
    setToolMessage,
    blockedOnboardingCapabilityKey,
    setBlockedOnboardingCapabilityKey,
    isRecoveringOnboarding,
    setIsRecoveringOnboarding,
    workspaceMode,
    setWorkspaceMode,
    isNavCollapsed,
    setIsNavCollapsed,
    isContextPanelCollapsed,
    setIsContextPanelCollapsed,
    messagesContainerRef,
    messagesEndRef,
    onboardingBootstrapSentSessionIdsRef,
    lockedPopup,
    showLockedPopup,
    dismissLockedPopup,
    activeSessionByScope,
    setActiveSessionByScope,
    currentScope,
    isBlockingOnboarding,
    resolvedWorkspaceMode,
    activeAgentKey,
    currentSessions,
    activeSession,
    profilePreferredUserName,
    profilePreferredAgentName,
    profileActivityDomain,
  };
}

function resolveInitialWorkspaceMode(value: WorkspaceShellProps["initialWorkspaceMode"]) {
  const resolved = resolveWorkspaceMode(value);
  return resolved === "home" ? "thread" : resolved;
}
