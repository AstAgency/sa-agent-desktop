import type {
  AgentCatalogItem,
  AppLanguage,
  CreateProjectInput,
  ProjectSummary,
  SessionMessage,
  SessionSummary,
  WorkspaceMode,
  WorkspaceSummary,
  ViewerProfile,
} from "../../lib/types";

export type LockedPopupState = {
  message: string;
  phase: "enter" | "exit";
};

export type OnboardingState =
  | {
      kind: "user";
      workspaceId: string;
      onComplete: () => void;
    }
  | {
      kind: "project";
      projectId: string;
      onComplete: () => void;
    }
  | null;

export type WorkspaceShellProps = {
  language: AppLanguage;
  workspace: WorkspaceSummary;
  agents: AgentCatalogItem[];
  selectedAgentKey: string | null;
  profile: ViewerProfile;
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  globalSessions: SessionSummary[];
  globalAssistantMessages: SessionMessage[];
  projectSessions: SessionSummary[];
  onboarding: OnboardingState;
  initialWorkspaceMode?: WorkspaceMode;
  initialActiveProjectAgentId?: string | null;
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
  onActiveProjectAgentChange?: (projectAgentId: string | null) => void;
  onActiveSessionChange?: (sessionId: string | null) => void;
  onActiveThreadChange?: (threadId: string | null) => void;
  onSelectAgent: (agentKey: string | null) => void;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: (value: CreateProjectInput) => Promise<void>;
  onRefreshWorkspace?: () => Promise<void> | void;
  onOpenSettings: () => void;
};
