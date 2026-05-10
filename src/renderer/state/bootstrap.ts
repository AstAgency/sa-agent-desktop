import { getAgentProfiles, getMeBootstrap, getSessions, getWorkspaceProjects } from "../lib/api";
import { getCachedResource } from "../lib/cache";
import { getStoredAppState } from "../lib/storage";
import type {
  AgentCatalogItem,
  AgentProfileRecord,
  BootstrapErrorKind,
  AppScreen,
  BootstrapSnapshot,
  BootstrapStage,
  MeBootstrapRecord,
  PersistedAppState,
  ProjectSummary,
  SessionMessage,
  SessionSummary,
  ViewerProfile,
  WorkspaceSummary,
} from "../lib/types";
import { defaultAppState } from "./app-state";

export function decideInitialScreen(
  state: Pick<PersistedAppState, "language" | "isAuthenticated">,
): AppScreen {
  if (!state.language) {
    return "language-setup";
  }

  if (!state.isAuthenticated) {
    return "auth";
  }

  return "bootstrapping";
}

export function isExplicitlyIncompleteOnboarding(value: boolean | null | undefined) {
  return value === false;
}

export function resolveBootstrapNextScreen(input: {
  profile: Pick<ViewerProfile, "onboarding_completed">;
  workspaces: Array<Pick<WorkspaceSummary, "id">>;
  projects: Array<Pick<ProjectSummary, "id" | "onboarding_completed">>;
}): AppScreen {
  if (input.workspaces.length === 0) {
    return "bootstrap-error";
  }

  if (isExplicitlyIncompleteOnboarding(input.profile.onboarding_completed)) {
    return "workspace-shell";
  }

  return "workspace-shell";
}

export function selectBootstrapProject<T extends Pick<ProjectSummary, "id">>(
  projects: T[],
  activeProjectId?: string | null,
) {
  if (projects.length === 0) {
    return null;
  }

  if (!activeProjectId) {
    return projects[0];
  }

  return projects.find((project) => project.id === activeProjectId) ?? projects[0];
}

export async function bootstrapApp() {
  const appState = await getStoredAppState().catch(() => defaultAppState);

  return {
    appState,
    screen: decideInitialScreen(appState),
  };
}

const cacheTtls = {
  meBootstrap: 60_000,
  agentProfiles: 120_000,
  projects: 120_000,
  sessions: 60_000,
} as const;

export async function runBootstrapFlow(input?: {
  onStageChange?: (stage: BootstrapStage) => void;
  forceRefresh?: boolean;
  preferredProjectId?: string | null;
  preferredAgentKey?: string | null;
}): Promise<{
  screen: AppScreen;
  snapshot: BootstrapSnapshot | null;
  errorKind: BootstrapErrorKind | null;
}> {
  input?.onStageChange?.("profile");
  const meBootstrap = await getCachedResource({
    key: "me-bootstrap",
    ttlMs: cacheTtls.meBootstrap,
    loader: () => getMeBootstrap(),
    forceRefresh: input?.forceRefresh,
  });

  const profile = resolveBootstrapProfile(meBootstrap);
  const workspaces = resolveBootstrapWorkspaces(meBootstrap);

  if (!profile || workspaces.length === 0) {
    return {
      screen: "bootstrap-error",
      snapshot: null,
      errorKind: "request-failed",
    };
  }

  input?.onStageChange?.("workspaces");
  const agentProfiles = await getCachedResource({
    key: "agent-profiles",
    ttlMs: cacheTtls.agentProfiles,
    loader: () => getAgentProfiles(),
    forceRefresh: input?.forceRefresh,
  });
  const agents = agentProfiles.map(mapAgentProfileToCatalogItem);
  const selectedAgent =
    (input?.preferredAgentKey
      ? agents.find((agent) => agent.agent_key === input.preferredAgentKey && agent.is_active !== false) ?? null
      : null) ??
    agents.find((agent) => agent.is_active !== false) ??
    agents[0] ??
    null;

  const selectedWorkspace = resolveSelectedWorkspace(meBootstrap, workspaces);

  input?.onStageChange?.("projects");
  const projects = await getCachedResource({
    key: `projects:${selectedWorkspace.id}`,
    ttlMs: cacheTtls.projects,
    loader: () => getWorkspaceProjects(selectedWorkspace.id),
    forceRefresh: input?.forceRefresh,
  });

  const bootstrapSelectedProject =
    meBootstrap.selected_project && projects.some((project) => project.id === meBootstrap.selected_project?.id)
      ? meBootstrap.selected_project
      : null;
  const selectedProject =
    bootstrapSelectedProject ?? selectBootstrapProject(projects, input?.preferredProjectId ?? null);

  input?.onStageChange?.("assistant");
  const globalSessions = meBootstrap.user_global_session ? [meBootstrap.user_global_session] : [];
  const globalAssistantMessages = meBootstrap.user_global_messages ?? [];

  let projectSessions: SessionSummary[] = [];
  if (selectedProject) {
    input?.onStageChange?.("sessions");
    projectSessions = await getCachedResource({
      key: `sessions:${selectedWorkspace.id}:${selectedProject.id}`,
      ttlMs: cacheTtls.sessions,
      loader: () => getSessions(selectedWorkspace.id, selectedProject.id),
      forceRefresh: input?.forceRefresh,
    });
  }

  input?.onStageChange?.("complete");

  return {
    screen: resolveBootstrapNextScreen({
      profile,
      workspaces,
      projects,
    }),
    snapshot: {
      profile,
      workspaces,
      selectedWorkspace,
      agents,
      selectedAgentKey: selectedAgent?.agent_key ?? null,
      projects,
      selectedProject,
      globalSessions,
      globalAssistantMessages,
      projectSessions,
    },
    errorKind: null,
  };
}

function resolveBootstrapProfile(bootstrap: MeBootstrapRecord) {
  return bootstrap.viewer_profile ?? bootstrap.profile ?? null;
}

function resolveBootstrapWorkspaces(bootstrap: MeBootstrapRecord) {
  return (bootstrap.workspaces ?? []).filter(Boolean);
}

function resolveSelectedWorkspace(bootstrap: MeBootstrapRecord, workspaces: WorkspaceSummary[]) {
  if (bootstrap.selected_workspace && workspaces.some((workspace) => workspace.id === bootstrap.selected_workspace?.id)) {
    return bootstrap.selected_workspace;
  }

  return workspaces[0];
}

function mapAgentProfileToCatalogItem(agent: AgentProfileRecord): AgentCatalogItem {
  return {
    agent_key: agent.agent_key,
    display_name: agent.display_name ?? null,
    description: typeof agent.description === "string" ? agent.description : null,
    domain: agent.domain ?? null,
    memory_policy: agent.memory_policy ?? null,
    visibility: agent.visibility ?? null,
    is_active: agent.is_active ?? true,
    safe_metadata: agent.safe_metadata ?? null,
  };
}
