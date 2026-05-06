import { getMe, getRuntimeContext, getSessions, getWorkspaceProjects, getWorkspaces } from "../lib/api";
import { getCachedResource } from "../lib/cache";
import { getStoredAppState } from "../lib/storage";
import type {
  BootstrapErrorKind,
  AppScreen,
  BootstrapSnapshot,
  BootstrapStage,
  PersistedAppState,
  ProjectSummary,
  RuntimeContextRecord,
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
  selectedProject?: Pick<ProjectSummary, "id" | "onboarding_completed"> | null;
}): AppScreen {
  if (input.workspaces.length === 0) {
    return "bootstrap-error";
  }

  if (!input.profile.onboarding_completed) {
    return "workspace-shell";
  }

  if (input.projects.length === 0) {
    return "empty-projects";
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
  me: 60_000,
  workspaces: 120_000,
  projects: 120_000,
  sessions: 60_000,
  runtimeContext: 60_000,
} as const;

export async function runBootstrapFlow(input?: {
  onStageChange?: (stage: BootstrapStage) => void;
  forceRefresh?: boolean;
  preferredProjectId?: string | null;
}): Promise<{
  screen: AppScreen;
  snapshot: BootstrapSnapshot | null;
  errorKind: BootstrapErrorKind | null;
}> {
  input?.onStageChange?.("profile");
  const profile = await getCachedResource({
    key: "me",
    ttlMs: cacheTtls.me,
    loader: () => getMe(),
    forceRefresh: input?.forceRefresh,
  });

  input?.onStageChange?.("workspaces");
  let usedCachedWorkspaceFallback = false;
  const workspaces = await getCachedResource({
    key: "workspaces",
    ttlMs: cacheTtls.workspaces,
    loader: () => getWorkspaces(),
    forceRefresh: input?.forceRefresh,
    onFallbackToCache: () => {
      usedCachedWorkspaceFallback = true;
    },
  });

  if (workspaces.length === 0) {
    return {
      screen: "bootstrap-error",
      snapshot: null,
      errorKind: usedCachedWorkspaceFallback ? "request-failed" : "no-workspaces",
    };
  }

  const selectedWorkspace = workspaces[0];
  const emptyProjectSnapshot = {
    profile,
    workspaces,
    selectedWorkspace,
    projects: [] as ProjectSummary[],
    selectedProject: null,
    globalSessions: [] as SessionSummary[],
    globalRuntimeContext: null as BootstrapSnapshot["globalRuntimeContext"],
    projectSessions: [] as SessionSummary[],
    projectRuntimeContext: null as BootstrapSnapshot["projectRuntimeContext"],
  };

  input?.onStageChange?.("projects");
  const projects = await getCachedResource({
    key: `projects:${selectedWorkspace.id}`,
    ttlMs: cacheTtls.projects,
    loader: () => getWorkspaceProjects(selectedWorkspace.id),
    forceRefresh: input?.forceRefresh,
  });

  if (!profile.onboarding_completed) {
    input?.onStageChange?.("sessions");
    const globalSessions = await getCachedResource({
      key: `sessions:${selectedWorkspace.id}:global`,
      ttlMs: cacheTtls.sessions,
      loader: () => getSessions(selectedWorkspace.id),
      forceRefresh: input?.forceRefresh,
    });

    input?.onStageChange?.("runtime-context");
    const globalRuntimeContext = await getCachedResource({
      key: `runtime-context:${selectedWorkspace.id}:global`,
      ttlMs: cacheTtls.runtimeContext,
      loader: () => getRuntimeContext(selectedWorkspace.id),
      forceRefresh: input?.forceRefresh,
    });

    input?.onStageChange?.("complete");

    return {
      screen: resolveBootstrapNextScreen({
        profile,
        workspaces,
        projects,
      }),
      snapshot: {
        ...emptyProjectSnapshot,
        projects,
        globalSessions,
        globalRuntimeContext: globalRuntimeContext as BootstrapSnapshot["globalRuntimeContext"],
      },
      errorKind: null,
    };
  }

  if (projects.length === 0) {
    input?.onStageChange?.("sessions");
    const globalSessions = await getCachedResource({
      key: `sessions:${selectedWorkspace.id}:global`,
      ttlMs: cacheTtls.sessions,
      loader: () => getSessions(selectedWorkspace.id),
      forceRefresh: input?.forceRefresh,
    });

    input?.onStageChange?.("runtime-context");
    const globalRuntimeContext = await getCachedResource({
      key: `runtime-context:${selectedWorkspace.id}:global`,
      ttlMs: cacheTtls.runtimeContext,
      loader: () => getRuntimeContext(selectedWorkspace.id),
      forceRefresh: input?.forceRefresh,
    });

    input?.onStageChange?.("complete");

    return {
      screen: resolveBootstrapNextScreen({
        profile,
        workspaces,
        projects,
      }),
      snapshot: {
        ...emptyProjectSnapshot,
        globalSessions,
        globalRuntimeContext: globalRuntimeContext as BootstrapSnapshot["globalRuntimeContext"],
      },
      errorKind: null,
    };
  }

  const selectedProject = selectBootstrapProject(projects, input?.preferredProjectId ?? null);

  if (!selectedProject) {
    input?.onStageChange?.("complete");

    return {
      screen: "empty-projects",
      snapshot: emptyProjectSnapshot,
      errorKind: null,
    };
  }

  input?.onStageChange?.("sessions");
  const [globalSessions, projectSessions] = await Promise.all([
    getCachedResource({
      key: `sessions:${selectedWorkspace.id}:global`,
      ttlMs: cacheTtls.sessions,
      loader: () => getSessions(selectedWorkspace.id),
      forceRefresh: input?.forceRefresh,
    }),
    getCachedResource({
      key: `sessions:${selectedWorkspace.id}:${selectedProject.id}`,
      ttlMs: cacheTtls.sessions,
      loader: () => getSessions(selectedWorkspace.id, selectedProject.id),
      forceRefresh: input?.forceRefresh,
    }),
  ]);

  input?.onStageChange?.("runtime-context");
  const [globalRuntimeContext, projectRuntimeContext] = await Promise.all([
    getCachedResource({
      key: `runtime-context:${selectedWorkspace.id}:global`,
      ttlMs: cacheTtls.runtimeContext,
      loader: () => getRuntimeContext(selectedWorkspace.id),
      forceRefresh: input?.forceRefresh,
    }),
    getCachedResource({
      key: `runtime-context:${selectedWorkspace.id}:${selectedProject.id}`,
      ttlMs: cacheTtls.runtimeContext,
      loader: () => getRuntimeContext(selectedWorkspace.id, selectedProject.id),
      forceRefresh: input?.forceRefresh,
    }),
  ]);

  input?.onStageChange?.("complete");

  return {
    screen: resolveBootstrapNextScreen({
      profile,
      workspaces,
      projects,
      selectedProject,
    }),
    snapshot: {
      profile,
      workspaces,
      selectedWorkspace,
      projects,
      selectedProject,
      globalSessions,
      globalRuntimeContext: globalRuntimeContext as BootstrapSnapshot["globalRuntimeContext"],
      projectSessions,
      projectRuntimeContext: projectRuntimeContext as BootstrapSnapshot["projectRuntimeContext"],
    },
    errorKind: null,
  };
}
