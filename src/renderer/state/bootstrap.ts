import { getAgentProfiles, getAssistantThread, getMeBootstrap, getSessions, getWorkspaceProjects } from "../lib/api";
import { getCachedResource } from "../lib/cache";
import { getStoredAppState } from "../lib/storage";
import type {
  AgentCatalogItem,
  AgentProfileRecord,
  AssistantThreadRecord,
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

export function resolveBootstrapNextScreen(input: {
  profile: Pick<ViewerProfile, "onboarding_completed">;
  workspaces: Array<Pick<WorkspaceSummary, "id">>;
  projects: Array<Pick<ProjectSummary, "id" | "onboarding_completed">>;
}): AppScreen {
  if (input.workspaces.length === 0) {
    return "bootstrap-error";
  }

  if (!input.profile.onboarding_completed) {
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
  assistantThread: 60_000,
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
  const assistantThreadEnvelope =
    meBootstrap.assistant_thread
      ? {
          thread: meBootstrap.assistant_thread,
          messages: meBootstrap.assistant_messages ?? [],
        }
      : await getCachedResource({
          key: "assistant-thread",
          ttlMs: cacheTtls.assistantThread,
          loader: () => getAssistantThread(),
          forceRefresh: input?.forceRefresh,
        }).catch(() => null);

  const globalSessions = assistantThreadEnvelope
    ? [mapAssistantThreadToSessionSummary(assistantThreadEnvelope.thread, selectedWorkspace.id)]
    : [];
  const globalAssistantMessages = assistantThreadEnvelope?.messages ?? [];

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

function mapAssistantThreadToSessionSummary(
  thread: AssistantThreadRecord,
  workspaceId: string,
): SessionSummary {
  return {
    id: thread.id,
    workspace_id: workspaceId,
    project_id: null,
    title: thread.title ?? thread.summary ?? "Assistant",
    summary: thread.summary ?? null,
    status: thread.status ?? null,
    lifecycle_state: thread.lifecycle_state ?? null,
    execution_id: thread.active_execution_id ?? null,
    execution_status: thread.execution_status ?? null,
    created_at: thread.created_at ?? undefined,
    updated_at: thread.updated_at ?? undefined,
  };
}
