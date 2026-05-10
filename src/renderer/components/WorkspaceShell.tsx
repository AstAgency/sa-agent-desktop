import { useEffect, useRef } from "react";
import type { WorkspaceShellProps } from "./workspace-shell/types";
import { useConversationFlow } from "./workspace-shell/useConversationFlow";
import { useRuntimeResources } from "./workspace-shell/useRuntimeResources";
import { buildSessionTree } from "./workspace-shell/session-tree";
import { useSessionCatalog } from "./workspace-shell/useSessionCatalog";
import { useSessionMessages } from "./workspace-shell/useSessionMessages";
import { useThreadBinding } from "./workspace-shell/useThreadBinding";
import { useWorkspaceShellActions } from "./workspace-shell/useWorkspaceShellActions";
import { WorkspaceShellFrame } from "./workspace-shell/WorkspaceShellFrame";
import { useWorkspaceShellState } from "./workspace-shell/useWorkspaceShellState";

export function WorkspaceShell(props: WorkspaceShellProps) {
  const startupSessionScopeRef = useRef<{ global: boolean; project: boolean }>({ global: false, project: false });
  const sessionCatalog = useSessionCatalog({
    workspaceId: props.workspace.id,
    projects: props.projects,
    selectedProjectId: props.project?.id ?? null,
    initialGlobalSessions: props.globalSessions,
    initialProjectSessions: props.projectSessions,
    onError: () => undefined,
  });
  const state = useWorkspaceShellState({
    ...props,
    globalSessions: sessionCatalog.globalSessions,
    projectSessions: sessionCatalog.currentProjectSessions,
  });
  const sessionTree = buildSessionTree({
    globalSessions: sessionCatalog.globalSessions,
    projects: props.projects,
    projectSessions: Object.values(sessionCatalog.projectSessionsByProjectId).flat(),
    selectedProjectId: props.project?.id ?? null,
    selectedSessionId: state.activeSession?.id ?? null,
  });
  const resources = useRuntimeResources({
    language: props.language,
    workspace: props.workspace,
    project: props.project,
    activeAgentKey: state.activeAgentKey,
    activeProjectAgentId: state.activeProjectAgentId,
    onActiveProjectAgentIdResolved: state.setActiveProjectAgentId,
    onToolMessage: state.setToolMessage,
  });
  const messages = useSessionMessages({
    language: props.language,
    workspace: props.workspace,
    currentScope: state.currentScope,
    activeSession: state.activeSession,
    activeAgentMcps: resources.activeAgentMcps,
    onError: state.setErrorMessage,
  });
  const flow = useConversationFlow({
    language: props.language,
    workspace: props.workspace,
    projectId: props.project?.id ?? null,
    projectName: props.project?.name ?? null,
    activeAgentKey: state.activeAgentKey,
    currentScope: state.currentScope,
    currentSessions: state.currentSessions,
    activeSessionByScope: state.activeSessionByScope,
    activeSession: state.activeSession,
    activeProjectAgentId: state.activeProjectAgentId,
    activeProjectAgent: resources.activeProjectAgent,
    projectAgents: resources.projectAgents,
    profile: props.profile,
    onRefreshWorkspace: props.onRefreshWorkspace,
    onRefreshProfile: props.onRefreshProfile,
    setActiveSessionByScope: state.setActiveSessionByScope,
    setMessages: messages.setMessages,
    setStreamingAssistantText: messages.setStreamingAssistantText,
    setIsAwaitingAssistantStream: messages.setIsAwaitingAssistantStream,
    setIsCreatingSession: state.setIsCreatingSession,
    setIsSendingMessage: state.setIsSendingMessage,
    setErrorMessage: state.setErrorMessage,
    setToolMessage: state.setToolMessage,
  });
  const thread = useThreadBinding({
    language: props.language,
    onboarding: props.onboarding,
    capabilities: resources.capabilities,
    state,
    messages: messages.messages,
    streamingAssistantText: messages.streamingAssistantText,
    isLoadingMessages: messages.isLoadingMessages,
    activeProjectThreadId: resources.activeProjectAgent?.active_thread_id ?? null,
    projectThreads: resources.projectThreads,
    ensureSessionForCurrentScope: flow.ensureSessionForCurrentScope,
    sendMessage: flow.sendMessage,
    onActiveThreadChange: props.onActiveThreadChange,
  });
  const actions = useWorkspaceShellActions({
    language: props.language,
    workspace: props.workspace,
    currentScope: state.currentScope,
    globalSessions: sessionCatalog.globalSessions,
    projectSessionsByProjectId: sessionCatalog.projectSessionsByProjectId,
    currentSessions: state.currentSessions,
    activeSession: state.activeSession,
    activeAgentKey: state.activeAgentKey,
    projectId: props.project?.id ?? null,
    projects: props.projects,
    onboarding: props.onboarding,
    onboardingSession: thread.onboardingSession,
    isSendDisabled: thread.isSendDisabled,
    draftMessage: state.draftMessage,
    setDraftMessage: state.setDraftMessage,
    setErrorMessage: state.setErrorMessage,
    setToolMessage: state.setToolMessage,
    setWorkspaceMode: state.setWorkspaceMode,
    setIsCreatingSession: state.setIsCreatingSession,
    setActiveSessionByScope: state.setActiveSessionByScope,
    showLockedPopup: state.showLockedPopup,
    onSelectProject: props.onSelectProject,
    onWorkspaceModeChange: props.onWorkspaceModeChange,
    sendMessage: flow.sendMessage,
  });

  useEffect(() => {
    if (state.resolvedWorkspaceMode === "home") {
      state.setWorkspaceMode("thread");
      void props.onWorkspaceModeChange?.("thread");
    }
  }, [props.onWorkspaceModeChange, state.resolvedWorkspaceMode, state.setWorkspaceMode]);

  useEffect(() => {
    const scope = state.currentScope;
    if (props.onboarding || state.activeSession || state.currentSessions.length > 0 || state.isCreatingSession || startupSessionScopeRef.current[scope]) {
      return;
    }

    startupSessionScopeRef.current[scope] = true;
    state.setErrorMessage(null);
    state.setToolMessage(null);
    state.setWorkspaceMode("thread");
    void props.onWorkspaceModeChange?.("thread");

    void flow.ensureSessionForCurrentScope().catch((error) => {
      startupSessionScopeRef.current[scope] = false;
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to create a session.");
    });
  }, [
    flow,
    props.onboarding,
    props.onWorkspaceModeChange,
    state.activeSession,
    state.currentScope,
    state.currentSessions.length,
    state.isCreatingSession,
    state.setErrorMessage,
    state.setToolMessage,
    state.setWorkspaceMode,
  ]);

  return (
    <WorkspaceShellFrame
      language={props.language}
      profile={props.profile}
      onboarding={props.onboarding}
      project={props.project}
      projectAgents={resources.projectAgents}
      state={state}
      visibleMessages={thread.visibleMessages}
      streamingAssistantText={messages.streamingAssistantText}
      isAwaitingAssistantStream={messages.isAwaitingAssistantStream}
      isLoadingMessages={messages.isLoadingMessages}
      sendDisabledReason={thread.sendDisabledReason}
      isSendDisabled={thread.isSendDisabled}
      documents={resources.documents}
      projectThreads={resources.projectThreads}
      projectCommitments={resources.projectCommitments}
      activeAgentProfile={resources.activeAgentProfile}
      onOpenAgentFilesFolder={actions.handleOpenAgentFilesFolder}
      onCancelExecution={actions.handleCancelExecution}
      onSend={actions.handleSend}
      onCreateSession={actions.handleCreateSession}
      onCreateProject={actions.handleCreateProjectViaAssistant}
      onSelectSession={actions.handleSessionSelection}
      onSelectProject={props.onSelectProject}
      onOpenSettings={props.onOpenSettings}
      onSelectProjectAgent={state.setActiveProjectAgentId}
      onToggleNav={() => state.setIsNavCollapsed((current) => !current)}
      onSelectMode={actions.handleWorkspaceModeSelection}
      onToggleContext={() => state.setIsContextPanelCollapsed((value) => !value)}
      onOpenAssistantOverlay={actions.handleAssistantOverlay}
      sessionTree={sessionTree}
    />
  );
}
