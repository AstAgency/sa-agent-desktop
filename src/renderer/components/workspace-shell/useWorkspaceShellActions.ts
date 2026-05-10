import { openAgentFilesFolder } from "../../lib/agent-files";
import { cancelExecution, createSession } from "../../lib/api";
import { recordDebugAgentRuntimeEntry } from "../../lib/debug";
import { translate } from "../../lib/i18n";
import type { ConversationScope, SessionSummary, WorkspaceMode, WorkspaceSummary } from "../../lib/types";
import { createSessionFlowDebugId } from "./helpers";
import type { OnboardingState } from "./types";

export function useWorkspaceShellActions(input: {
  language: "ru" | "en";
  workspace: WorkspaceSummary;
  currentScope: ConversationScope;
  globalSessions: SessionSummary[];
  projectSessionsByProjectId: Record<string, SessionSummary[]>;
  currentSessions: SessionSummary[];
  activeSession: SessionSummary | null;
  activeAgentKey: string | null;
  projectId: string | null;
  projects: Array<{ id: string }>;
  onboarding: OnboardingState;
  onboardingSession: SessionSummary | null;
  isSendDisabled: boolean;
  draftMessage: string;
  setDraftMessage: (value: string) => void;
  setErrorMessage: (message: string | null) => void;
  setToolMessage: (message: string | null) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setIsCreatingSession: (value: boolean) => void;
  setActiveSessionByScope: React.Dispatch<React.SetStateAction<Record<ConversationScope, SessionSummary | null>>>;
  showLockedPopup: (message: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
  sendMessage: (session: SessionSummary, contentMarkdown: string, options?: { hiddenPrompt?: string }, activeOnboarding?: OnboardingState) => Promise<boolean>;
}) {
  const isBlockingOnboarding = false;

  async function createFreshSession(projectId: string | null) {
    input.setIsCreatingSession(true);
    try {
      const session = await createSession({
        workspace_id: input.workspace.id,
        project_id: projectId ?? undefined,
        agent_key: input.activeAgentKey ?? undefined,
        channel_kind: "desktop",
        resume_strategy: "new",
      });
      const scope = session.project_id ? "project" : "global";
      input.setActiveSessionByScope((current) => ({ ...current, [scope]: session }));
      return session;
    } finally {
      input.setIsCreatingSession(false);
    }
  }

  async function resolveSession() {
    if (input.activeSession) return input.activeSession;
    if (input.currentSessions[0]) return input.currentSessions[0];
    const session = await createFreshSession(input.projectId);
    recordDebugAgentRuntimeEntry({
      id: createSessionFlowDebugId(),
      startedAt: new Date().toISOString(),
      type: "session.created",
      sessionId: session.id,
      data: { scope: input.currentScope, capabilityKey: null, projectId: session.project_id ?? null, source: "handleSend" },
    });
    return session;
  }

  async function handleSend() {
    if (input.isSendDisabled) return;
    input.setErrorMessage(null);
    const trimmed = input.draftMessage.trim();
    input.setDraftMessage("");
    try {
      const session = input.onboarding && input.onboardingSession ? input.onboardingSession : await resolveSession();
      await input.sendMessage(session, trimmed, undefined, input.onboarding);
    } catch (error) {
      input.setDraftMessage(trimmed);
      input.setErrorMessage(error instanceof Error ? error.message : translate(input.language, "workspace.error.sendMessage"));
    }
  }

  function handleCreateProjectViaAssistant() {
    if (isBlockingOnboarding) {
      input.showLockedPopup(translate(input.language, "workspace.nav.locked.onboarding"));
      return;
    }
    input.onSelectProject(null);
    input.setWorkspaceMode("thread");
    void input.onWorkspaceModeChange?.("thread");
    input.setDraftMessage(translate(input.language, "workspace.projects.createPrompt"));
    input.setToolMessage(translate(input.language, "workspace.projects.createHint"));
  }

  function handleWorkspaceModeSelection(mode: WorkspaceMode) {
    input.setWorkspaceMode(mode);
    void input.onWorkspaceModeChange?.(mode);
  }

  async function handleCreateSession() {
    input.setErrorMessage(null);
    input.setToolMessage(null);
    const session = await createFreshSession(input.projectId);
    input.setWorkspaceMode("thread");
    void input.onWorkspaceModeChange?.("thread");
    recordDebugAgentRuntimeEntry({
      id: createSessionFlowDebugId(),
      startedAt: new Date().toISOString(),
      type: "session.created",
      sessionId: session.id,
      data: { scope: session.project_id ? "project" : "global", capabilityKey: null, projectId: session.project_id ?? null, source: "new-session" },
    });
  }

  async function handleSessionSelection(sessionId: string, projectId: string | null) {
    const sessions = projectId ? input.projectSessionsByProjectId[projectId] ?? [] : input.globalSessions;
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    input.setErrorMessage(null);
    input.setToolMessage(null);
    input.setActiveSessionByScope((current) => ({ ...current, [projectId ? "project" : "global"]: session }));
    if (projectId !== input.projectId) input.onSelectProject(projectId);
    input.setWorkspaceMode("thread");
    void input.onWorkspaceModeChange?.("thread");
  }

  return {
    handleSend,
    handleCreateSession,
    handleSessionSelection,
    handleCreateProjectViaAssistant,
    handleWorkspaceModeSelection,
    handleOpenAgentFilesFolder: async () => {
      const result = await openAgentFilesFolder();
      if (!result.ok) input.setToolMessage(result.error ?? translate(input.language, "workspace.error.openAgentFilesFolder"));
    },
    handleCancelExecution: async (executionId: string) => {
      try {
        await cancelExecution(executionId);
        input.setToolMessage(translate(input.language, "workspace.execution.cancelRequested"));
      } catch (error) {
        input.setToolMessage(error instanceof Error ? error.message : translate(input.language, "workspace.error.cancelExecution"));
      }
    },
    handleAssistantOverlay: (mode: "ask-assistant" | "run-command") => {
      if (isBlockingOnboarding) {
        input.showLockedPopup(translate(input.language, "workspace.assistant.disabled.onboarding"));
        return;
      }
      input.setWorkspaceMode("thread");
      void input.onWorkspaceModeChange?.("thread");
      input.setToolMessage(translate(input.language, mode === "ask-assistant" ? "workspace.assistant.ask.hint" : "workspace.assistant.command.hint"));
    },
  };
}
