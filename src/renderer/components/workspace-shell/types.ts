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
  initialActiveSessionId?: string | null;
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
  onActiveProjectAgentChange?: (projectAgentId: string | null) => void;
  onActiveSessionChange?: (sessionId: string | null) => void;
  onActiveThreadChange?: (threadId: string | null) => void;
  onSelectAgent: (agentKey: string | null) => void;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: (value: CreateProjectInput) => Promise<void>;
  onRefreshWorkspace?: (preferredProjectId?: string | null) => Promise<void> | void;
  onRefreshProfile?: () => Promise<void> | void;
  onOpenSettings: () => void;
};

export type SidebarVisibleMode = "files";

export type SidebarSessionItem = {
  session: SessionSummary;
  isSelected: boolean;
};

export type SidebarGlobalGroup = {
  sessions: SidebarSessionItem[];
};

export type SidebarProjectGroup = {
  project: ProjectSummary;
  sessions: SidebarSessionItem[];
  isSelected: boolean;
};

export type SidebarSessionTree = {
  visibleModes: SidebarVisibleMode[];
  globalGroup: SidebarGlobalGroup;
  projectGroups: SidebarProjectGroup[];
  selected: {
    projectId: string | null;
    sessionId: string | null;
  };
};
