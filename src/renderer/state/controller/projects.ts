import {
  createProject,
  deleteProject as deleteProjectRequest,
  getSessionsPage,
  updateProject as updateProjectRequest,
  updateProjectMemory,
} from "../../lib/api";
import { getState, setState } from "../store";
import { isNavigationLocked } from "../navigation-lock";
import { disposeSessionRuntime } from "./registry";

export async function loadProjectSessions(projectId: string) {
  setState((state) => ({
    ...state,
    projectSessionsPage: {
      ...state.projectSessionsPage,
      [projectId]: {
        page: 0,
        total: state.projectSessionsPage[projectId]?.total ?? 0,
        hasMore: false,
        loaded: state.projectSessionsPage[projectId]?.loaded ?? false,
        loading: true,
      },
    },
  }));
  const result = await getSessionsPage({ projectId, page: 1 });
  setState((state) => ({
    ...state,
    projectSessions: { ...state.projectSessions, [projectId]: result.sessions },
    projectSessionsPage: {
      ...state.projectSessionsPage,
      [projectId]: {
        page: result.page,
        total: result.total,
        hasMore: result.has_more,
        loaded: true,
        loading: false,
      },
    },
  }));
}

export async function loadMoreProjectSessions(projectId: string) {
  const state = getState();
  const pageState = state.projectSessionsPage[projectId];
  if (!pageState || pageState.loading || !pageState.hasMore) return;
  setState((current) => ({
    ...current,
    projectSessionsPage: {
      ...current.projectSessionsPage,
      [projectId]: { ...current.projectSessionsPage[projectId], loading: true },
    },
  }));
  const result = await getSessionsPage({ projectId, page: pageState.page + 1 });
  setState((current) => ({
    ...current,
    projectSessions: {
      ...current.projectSessions,
      [projectId]: [...(current.projectSessions[projectId] ?? []), ...result.sessions],
    },
    projectSessionsPage: {
      ...current.projectSessionsPage,
      [projectId]: {
        page: result.page,
        total: result.total,
        hasMore: result.has_more,
        loaded: true,
        loading: false,
      },
    },
  }));
}

export async function createProjectAndSelect(input: { name: string; description?: string }) {
  if (isNavigationLocked(getState())) return null;
  const project = await createProjectFromInput(input);
  setState((state) => ({ ...state, selection: { kind: "new-project", projectId: project.id } }));
  return project;
}

export async function createProjectViaTool(input: { name: string; description?: string }) {
  return createProjectFromInput(input);
}

async function createProjectFromInput(input: { name: string; description?: string }) {
  const projectKey = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `project-${Date.now().toString(36)}`;
  const project = await createProject({
    name: input.name,
    description: input.description ?? null,
    project_key: projectKey,
  });
  setState((state) => ({
    ...state,
    projects: [...state.projects, project],
    projectSessions: { ...state.projectSessions, [project.id]: [] },
    projectSessionsPage: {
      ...state.projectSessionsPage,
      [project.id]: { page: 0, total: 0, hasMore: false, loaded: false, loading: false },
    },
  }));
  return project;
}

export async function renameProject(projectId: string, name: string) {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  const project = await updateProjectRequest(projectId, { name: trimmed });
  setState((state) => ({
    ...state,
    projects: state.projects.map((existing) => (existing.id === projectId ? project : existing)),
  }));
}

export async function removeProject(projectId: string) {
  if (isNavigationLocked(getState())) return;
  await deleteProjectRequest(projectId);
  const stateBefore = getState();
  const affectedSessionIds = (stateBefore.projectSessions[projectId] ?? []).map(
    (session) => session.id,
  );
  setState((state) => {
    const nextProjects = state.projects.filter((existing) => existing.id !== projectId);
    const { [projectId]: _removed, ...nextProjectSessions } = state.projectSessions;
    const { [projectId]: _removedPage, ...nextProjectSessionsPage } = state.projectSessionsPage;
    const selection = state.selection;
    const selectionTouchesProject =
      (selection.kind === "new-project" && selection.projectId === projectId) ||
      (selection.kind === "session" && affectedSessionIds.includes(selection.sessionId));
    const messagesBySession = { ...state.messagesBySession };
    const summariesBySession = { ...state.summariesBySession };
    for (const sessionId of affectedSessionIds) {
      delete messagesBySession[sessionId];
      delete summariesBySession[sessionId];
    }
    return {
      ...state,
      projects: nextProjects,
      projectSessions: nextProjectSessions,
      projectSessionsPage: nextProjectSessionsPage,
      messagesBySession,
      summariesBySession,
      selection: selectionTouchesProject ? { kind: "none" } : state.selection,
      streamingFinalText: selectionTouchesProject ? "" : state.streamingFinalText,
      runtimeTrace: selectionTouchesProject ? [] : state.runtimeTrace,
    };
  });
  for (const sessionId of affectedSessionIds) {
    disposeSessionRuntime(sessionId);
  }
}

export async function saveProjectMemory(projectId: string, content: string) {
  const project = await updateProjectMemory(projectId, content);
  setState((state) => ({
    ...state,
    projects: state.projects.map((existing) => (existing.id === projectId ? project : existing)),
  }));
}
