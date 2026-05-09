import type { WorkspaceShellProps } from "./workspace-shell/types";
import { useConversationFlow } from "./workspace-shell/useConversationFlow";
import { useRuntimeResources } from "./workspace-shell/useRuntimeResources";
import { useSessionMessages } from "./workspace-shell/useSessionMessages";
import { useThreadBinding } from "./workspace-shell/useThreadBinding";
import { useWorkspaceShellActions } from "./workspace-shell/useWorkspaceShellActions";
import { WorkspaceShellFrame } from "./workspace-shell/WorkspaceShellFrame";
import { useWorkspaceShellState } from "./workspace-shell/useWorkspaceShellState";

export function WorkspaceShell(props: WorkspaceShellProps) {
  const state = useWorkspaceShellState(props);
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
    globalAssistantMessages: props.globalAssistantMessages,
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
    setActiveSessionByScope: state.setActiveSessionByScope,
    setMessages: messages.setMessages,
    setStreamingAssistantText: messages.setStreamingAssistantText,
    setIsAwaitingAssistantStream: messages.setIsAwaitingAssistantStream,
    setIsCreatingSession: state.setIsCreatingSession,
    setIsSendingMessage: state.setIsSendingMessage,
    setErrorMessage: state.setErrorMessage,
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

  return (
    <WorkspaceShellFrame
      language={props.language}
      profile={props.profile}
      onboarding={props.onboarding}
      project={props.project}
      projects={props.projects}
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
      onSelectProject={props.onSelectProject}
      onOpenSettings={props.onOpenSettings}
      onSelectProjectAgent={state.setActiveProjectAgentId}
      onToggleNav={() => state.setIsNavCollapsed((current) => !current)}
      onSelectMode={actions.handleWorkspaceModeSelection}
      onCreateProject={actions.handleCreateProjectViaAssistant}
      onToggleContext={() => state.setIsContextPanelCollapsed((value) => !value)}
      onOpenAssistantOverlay={actions.handleAssistantOverlay}
    />
  );
}
