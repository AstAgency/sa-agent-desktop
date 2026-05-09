import { WorkspaceShellLayout } from "./WorkspaceShellLayout";
import type { WorkspaceShellProps } from "./types";
import { useWorkspaceShellState } from "./useWorkspaceShellState";
import type { ProjectAgentRecord } from "../../lib/types";

export function WorkspaceShellFrame(input: {
  language: "ru" | "en";
  profile: WorkspaceShellProps["profile"];
  onboarding: WorkspaceShellProps["onboarding"];
  project: WorkspaceShellProps["project"];
  projects: WorkspaceShellProps["projects"];
  projectAgents: ProjectAgentRecord[];
  state: ReturnType<typeof useWorkspaceShellState>;
  visibleMessages: Parameters<typeof WorkspaceShellLayout>[0]["mainContentProps"]["visibleMessages"];
  streamingAssistantText: string;
  isAwaitingAssistantStream: boolean;
  isLoadingMessages: boolean;
  sendDisabledReason: string | null;
  isSendDisabled: boolean;
  documents: Parameters<typeof WorkspaceShellLayout>[0]["mainContentProps"]["documents"];
  projectThreads: Parameters<typeof WorkspaceShellLayout>[0]["mainContentProps"]["threads"];
  projectCommitments: Parameters<typeof WorkspaceShellLayout>[0]["mainContentProps"]["commitments"];
  activeAgentProfile: Parameters<typeof WorkspaceShellLayout>[0]["mainContentProps"]["activeAgentProfile"];
  onOpenAgentFilesFolder: () => Promise<void>;
  onCancelExecution: (executionId: string) => Promise<void>;
  onSend: () => void;
  onSelectProject: WorkspaceShellProps["onSelectProject"];
  onOpenSettings: WorkspaceShellProps["onOpenSettings"];
  onSelectProjectAgent: (projectAgentId: string) => void;
  onToggleNav: () => void;
  onSelectMode: Parameters<typeof WorkspaceShellLayout>[0]["onSelectMode"];
  onCreateProject: () => void;
  onToggleContext: () => void;
  onOpenAssistantOverlay: Parameters<typeof WorkspaceShellLayout>[0]["onOpenAssistantOverlay"];
}) {
  return (
    <WorkspaceShellLayout
      language={input.language}
      onboarding={input.onboarding ? { kind: input.onboarding.kind } : null}
      project={input.project}
      projects={input.projects}
      projectAgents={input.projectAgents}
      activeProjectAgentId={input.state.activeProjectAgentId}
      resolvedWorkspaceMode={input.state.resolvedWorkspaceMode}
      isNavCollapsed={input.state.isNavCollapsed}
      isContextPanelCollapsed={input.state.isContextPanelCollapsed}
      lockedPopup={input.state.lockedPopup}
      profileSummary={{ displayName: input.profile.display_name, email: input.profile.email, preferredUserName: input.state.profilePreferredUserName, preferredAgentName: input.state.profilePreferredAgentName, activityDomain: input.state.profileActivityDomain, onboardingCompleted: input.profile.onboarding_completed }}
      mainContentProps={{ language: input.language, mode: input.state.resolvedWorkspaceMode, scope: input.state.currentScope, projectScoped: Boolean(input.project), activeSession: input.state.activeSession, onboardingKind: input.onboarding?.kind ?? null, visibleMessages: input.visibleMessages, streamingAssistantText: input.streamingAssistantText, isAwaitingAssistantStream: input.isAwaitingAssistantStream, isLoadingMessages: input.isLoadingMessages, isCreatingSession: input.state.isCreatingSession, errorMessage: input.state.errorMessage, toolMessage: input.state.toolMessage, isSendDisabled: input.isSendDisabled, sendDisabledReason: input.sendDisabledReason, draftMessage: input.state.draftMessage, onDraftMessageChange: input.state.setDraftMessage, onSend: input.onSend, messagesContainerRef: input.state.messagesContainerRef, messagesEndRef: input.state.messagesEndRef, documents: input.documents, onOpenAgentFilesFolder: input.onOpenAgentFilesFolder, sessions: input.state.currentSessions, threads: input.projectThreads, commitments: input.projectCommitments, activeAgentProfile: input.activeAgentProfile, projectAgents: input.projectAgents, onCancelExecution: input.onCancelExecution }}
      toolMessageSetter={input.state.setToolMessage}
      onSelectProjectAgent={input.onSelectProjectAgent}
      onToggleNav={input.onToggleNav}
      onSelectMode={input.onSelectMode}
      onSelectProject={input.onSelectProject}
      onCreateProject={input.onCreateProject}
      onToggleContext={input.onToggleContext}
      onOpenSettings={input.onOpenSettings}
      onOpenAssistantOverlay={input.onOpenAssistantOverlay}
      onDismissPopup={input.state.dismissLockedPopup}
    />
  );
}
