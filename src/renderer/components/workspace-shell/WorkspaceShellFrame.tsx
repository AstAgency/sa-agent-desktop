import { useState } from "react";
import { createSession } from "../../lib/api";
import { openAgentFilesFolder } from "../../lib/agent-files";
import { recordDebugAgentRuntimeEntry } from "../../lib/debug";
import { translate } from "../../lib/i18n";
import type { AgentCatalogItem, ProjectSummary, SessionSummary, WorkspaceSummary } from "../../lib/types";
import { MainLayout } from "../layout/MainLayout";
import { createSessionFlowDebugId } from "./helpers";
import type { OnboardingState, SidebarSessionTree, WorkspaceShellProps } from "./types";
import { useWorkspaceShellState } from "./useWorkspaceShellState";

export function WorkspaceShellFrame(input: {
  language: "ru" | "en";
  profile: WorkspaceShellProps["profile"];
  onboarding: OnboardingState;
  workspace: WorkspaceSummary;
  agents: AgentCatalogItem[];
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  state: ReturnType<typeof useWorkspaceShellState>;
  visibleMessages: WorkspaceShellProps["globalAssistantMessages"];
  streamingAssistantText: string;
  isAwaitingAssistantStream: boolean;
  isLoadingMessages: boolean;
  sendDisabledReason: string | null;
  isSendDisabled: boolean;
  onSend: () => void;
  onSessionCreated: (session: SessionSummary) => void;
  onSelectSession: (sessionId: string, projectId: string | null) => Promise<void>;
  onSelectProject: WorkspaceShellProps["onSelectProject"];
  onOpenSettings: WorkspaceShellProps["onOpenSettings"];
  onSelectAgent: WorkspaceShellProps["onSelectAgent"];
  sessionTree: SidebarSessionTree;
}) {
  const [isCreatingSessionForClick, setIsCreatingSessionForClick] = useState(false);

  const projectGroups = input.sessionTree.projectGroups.map((group) => ({
    project: group.project,
    sessions: group.sessions.map((s) => s.session),
  }));

  // Click on project name → create new project-scoped session and open it
  const handleProjectClick = async (projectId: string) => {
    input.state.setErrorMessage(null);
    input.state.setToolMessage(null);
    setIsCreatingSessionForClick(true);
    try {
      // Switch project context first
      input.onSelectProject(projectId);

      const session = await createSession({
        workspace_id: input.workspace.id,
        project_id: projectId,
        agent_key: input.state.activeAgentKey ?? undefined,
        channel_kind: "desktop",
        resume_strategy: "new",
      });

      input.state.setActiveSessionByScope((current) => ({
        ...current,
        project: session,
      }));
      input.onSessionCreated(session);

      recordDebugAgentRuntimeEntry({
        id: createSessionFlowDebugId(),
        startedAt: new Date().toISOString(),
        type: "session.created",
        sessionId: session.id,
        data: {
          scope: "project",
          capabilityKey: null,
          projectId: session.project_id ?? null,
          source: "project-click",
        },
      });
    } catch (error) {
      input.state.setErrorMessage(
        error instanceof Error
          ? error.message
          : translate(input.language, "workspace.error.createSession"),
      );
    } finally {
      setIsCreatingSessionForClick(false);
    }
  };

  // Click on session → select and load messages
  const handleSessionClick = async (sessionId: string, projectId: string | null) => {
    await input.onSelectSession(sessionId, projectId);
  };

  // "New Chat" in global sessions → create new global session
  const handleNewGlobalSession = async () => {
    input.state.setErrorMessage(null);
    input.state.setToolMessage(null);
    input.state.setIsCreatingSession(true);
    try {
      // Switch to global scope first
      input.onSelectProject(null);

      const session = await createSession({
        workspace_id: input.workspace.id,
        project_id: undefined,
        agent_key: input.state.activeAgentKey ?? undefined,
        channel_kind: "desktop",
        resume_strategy: "new",
      });

      input.state.setActiveSessionByScope((current) => ({
        ...current,
        global: session,
      }));
      input.onSessionCreated(session);

      recordDebugAgentRuntimeEntry({
        id: createSessionFlowDebugId(),
        startedAt: new Date().toISOString(),
        type: "session.created",
        sessionId: session.id,
        data: {
          scope: "global",
          capabilityKey: null,
          projectId: null,
          source: "new-global-chat",
        },
      });
    } catch (error) {
      input.state.setErrorMessage(
        error instanceof Error
          ? error.message
          : translate(input.language, "workspace.error.createSession"),
      );
    } finally {
      input.state.setIsCreatingSession(false);
    }
  };

  // Files button → open native OS file explorer
  const handleFilesClick = async () => {
    const result = await openAgentFilesFolder();
    if (!result.ok) {
      input.state.setToolMessage(
        result.error ??
          translate(input.language, "workspace.error.openAgentFilesFolder"),
      );
    }
  };

  // Welcome screen send → create global session + send message
  const handleWelcomeSend = async (message: string) => {
    input.state.setErrorMessage(null);
    input.state.setToolMessage(null);
    input.state.setIsCreatingSession(true);
    try {
      // Switch to global scope
      input.onSelectProject(null);

      const session = await createSession({
        workspace_id: input.workspace.id,
        project_id: undefined,
        agent_key: input.state.activeAgentKey ?? undefined,
        channel_kind: "desktop",
        resume_strategy: "new",
      });

      input.state.setActiveSessionByScope((current) => ({
        ...current,
        global: session,
      }));
      input.onSessionCreated(session);

      recordDebugAgentRuntimeEntry({
        id: createSessionFlowDebugId(),
        startedAt: new Date().toISOString(),
        type: "session.created",
        sessionId: session.id,
        data: {
          scope: "global",
          capabilityKey: null,
          projectId: null,
          source: "welcome-send",
        },
      });

      input.state.setIsCreatingSession(false);

      // Set draft and trigger send
      input.state.setDraftMessage(message);
      // Small delay for state propagation before sending
      setTimeout(() => {
        input.onSend();
      }, 50);
    } catch (error) {
      input.state.setIsCreatingSession(false);
      input.state.setErrorMessage(
        error instanceof Error
          ? error.message
          : translate(input.language, "workspace.error.createSession"),
      );
    }
  };

  // Create project handler
  const handleCreateProject = () => {
    input.state.setDraftMessage(
      translate(input.language, "workspace.projects.createPrompt"),
    );
    input.state.setToolMessage(
      translate(input.language, "workspace.projects.createHint"),
    );
    if (input.onboarding) {
      input.state.showLockedPopup(
        translate(input.language, "workspace.nav.locked.onboarding"),
      );
    }
  };

  const activeSession = input.state.activeSession ?? null;

  return (
    <MainLayout
      language={input.language}
      workspaceName={input.workspace.name}
      agents={input.agents}
      selectedAgentKey={input.state.activeAgentKey}
      profile={input.profile}
      projectGroups={projectGroups}
      globalSessions={input.sessionTree.globalGroup.sessions.map((s) => s.session)}
      selectedProjectId={input.project?.id ?? null}
      selectedSessionId={activeSession?.id ?? null}
      currentScope={input.state.currentScope}
      activeSession={activeSession}
      onboardingKind={input.onboarding?.kind ?? null}
      visibleMessages={input.visibleMessages}
      streamingAssistantText={input.streamingAssistantText}
      isAwaitingAssistantStream={input.isAwaitingAssistantStream}
      isLoadingMessages={input.isLoadingMessages}
      isCreatingSession={input.state.isCreatingSession || isCreatingSessionForClick}
      isSendingMessage={input.state.isSendingMessage}
      errorMessage={input.state.errorMessage}
      toolMessage={input.state.toolMessage}
      isSendDisabled={input.isSendDisabled}
      sendDisabledReason={input.sendDisabledReason}
      draftMessage={input.state.draftMessage}
      onDraftMessageChange={input.state.setDraftMessage}
      onSend={input.onSend}
      messagesEndRef={input.state.messagesEndRef}
      onSelectAgent={input.onSelectAgent}
      onProjectClick={handleProjectClick}
      onSessionClick={handleSessionClick}
      onNewGlobalSession={handleNewGlobalSession}
      onCreateProject={handleCreateProject}
      onFilesClick={handleFilesClick}
      onOpenSettings={input.onOpenSettings}
      onWelcomeSend={handleWelcomeSend}
    />
  );
}
