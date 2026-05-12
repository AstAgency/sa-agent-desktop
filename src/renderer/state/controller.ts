import {
  appendMessage,
  createProject,
  createSession,
  getAgents,
  getAllSessionMessages,
  getEmbeddingModelInfo,
  getGlobalSessions,
  getProfile,
  getProjectSessions,
  getProjects,
  getSessionSummaries,
  updateGlobalMemory,
  updateProjectMemory,
} from "../lib/api";
import { getBridge } from "../lib/bridge";
import type { Message, Session, Summary } from "../lib/types";
import { SessionRuntime, type SessionRuntimeState } from "../agent/runtime";
import { getState, setState, type ActiveSelection, type ClientState } from "./store";

const DISPLAY_NAME_MAX = 30;

const runtimeBySession = new Map<string, SessionRuntime>();

export async function startPythonRuntime() {
  setState((state) => ({
    ...state,
    bootstrap: { ...state.bootstrap, pythonReady: false, pythonError: null },
  }));
  try {
    const status = await getBridge().python.start();
    setState((state) => ({
      ...state,
      bootstrap: {
        ...state.bootstrap,
        pythonReady: status.ready,
        pythonError: status.error,
      },
    }));
  } catch (error) {
    setState((state) => ({
      ...state,
      bootstrap: {
        ...state.bootstrap,
        pythonReady: false,
        pythonError: error instanceof Error ? error.message : String(error),
      },
    }));
  }
}

export async function bootstrap() {
  setState((state) => ({
    ...state,
    bootstrap: { ...state.bootstrap, status: "loading", error: null },
  }));
  try {
    const [profile, projects, globalSessions, embeddingModel, agents] = await Promise.all([
      getProfile(),
      getProjects(),
      getGlobalSessions(),
      getEmbeddingModelInfo(),
      getAgents(),
    ]);
    setState((state) => ({
      ...state,
      profile,
      projects,
      globalSessions,
      embeddingModel,
      agents,
      selectedAgentKey: state.selectedAgentKey ?? agents[0]?.agent_key ?? null,
      bootstrap: { ...state.bootstrap, status: "ready", error: null },
    }));
    await Promise.all(projects.map((project) => loadProjectSessions(project.id)));
  } catch (error) {
    setState((state) => ({
      ...state,
      bootstrap: {
        ...state.bootstrap,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
    }));
  }
}

export async function loadProjectSessions(projectId: string) {
  const sessions = await getProjectSessions(projectId);
  setState((state) => ({
    ...state,
    projectSessions: { ...state.projectSessions, [projectId]: sessions },
  }));
}

export function selectSession(sessionId: string) {
  setState((state) => ({
    ...state,
    selection: { kind: "session", sessionId },
    streamingAssistantText: "",
  }));
  void hydrateSession(sessionId);
}

export function startNewGlobalSession() {
  setState((state) => ({
    ...state,
    selection: { kind: "new-global" },
    streamingAssistantText: "",
  }));
}

export function startNewProjectSession(projectId: string) {
  setState((state) => ({
    ...state,
    selection: { kind: "new-project", projectId },
    streamingAssistantText: "",
  }));
}

export function clearSelection() {
  setState((state) => ({ ...state, selection: { kind: "none" }, streamingAssistantText: "" }));
}

export function setSelectedAgent(agentKey: string | null) {
  setState((state) => ({ ...state, selectedAgentKey: agentKey }));
}

export async function createProjectAndSelect(input: { name: string; description?: string }) {
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
    selection: { kind: "new-project", projectId: project.id },
  }));
  return project;
}

export async function saveGlobalMemory(content: string) {
  const profile = await updateGlobalMemory(content);
  setState((state) => ({ ...state, profile }));
}

export async function saveProjectMemory(projectId: string, content: string) {
  const project = await updateProjectMemory(projectId, content);
  setState((state) => ({
    ...state,
    projects: state.projects.map((existing) => (existing.id === projectId ? project : existing)),
  }));
}

async function hydrateSession(sessionId: string) {
  if (getState().messagesBySession[sessionId]) return;
  setState((state) => ({ ...state, loadingSessionId: sessionId }));
  try {
    const [messages, summaries] = await Promise.all([
      getAllSessionMessages(sessionId),
      getSessionSummaries(sessionId),
    ]);
    setState((state) => ({
      ...state,
      messagesBySession: { ...state.messagesBySession, [sessionId]: messages },
      summariesBySession: { ...state.summariesBySession, [sessionId]: summaries },
      loadingSessionId: state.loadingSessionId === sessionId ? null : state.loadingSessionId,
    }));
  } catch (error) {
    setState((state) => ({
      ...state,
      loadingSessionId: state.loadingSessionId === sessionId ? null : state.loadingSessionId,
      bootstrap: {
        ...state.bootstrap,
        error: error instanceof Error ? error.message : String(error),
      },
    }));
  }
}

export async function sendMessage(content: string): Promise<void> {
  const trimmed = content.trim();
  if (trimmed.length === 0) return;
  const state = getState();
  if (state.sendingMessage) throw new Error("Already sending a message");
  if (!state.profile) throw new Error("Profile not loaded");

  setState((s) => ({ ...s, sendingMessage: true, streamingAssistantText: "" }));

  try {
    const selection = state.selection;
    let session: Session;
    let isNewSession = false;
    if (selection.kind === "session") {
      const existing = findSession(state, selection.sessionId);
      if (!existing) throw new Error("Session not found");
      session = existing;
    } else if (selection.kind === "new-global") {
      session = await createSession({
        display_name: deriveDisplayName(content),
        project_id: null,
      });
      isNewSession = true;
      setState((s) => ({
        ...s,
        globalSessions: [session, ...s.globalSessions],
        selection: { kind: "session", sessionId: session.id },
        messagesBySession: { ...s.messagesBySession, [session.id]: [] },
        summariesBySession: { ...s.summariesBySession, [session.id]: [] },
      }));
    } else if (selection.kind === "new-project") {
      session = await createSession({
        display_name: deriveDisplayName(content),
        project_id: selection.projectId,
      });
      isNewSession = true;
      const projectId = selection.projectId;
      setState((s) => ({
        ...s,
        projectSessions: {
          ...s.projectSessions,
          [projectId]: [session, ...(s.projectSessions[projectId] ?? [])],
        },
        selection: { kind: "session", sessionId: session.id },
        messagesBySession: { ...s.messagesBySession, [session.id]: [] },
        summariesBySession: { ...s.summariesBySession, [session.id]: [] },
      }));
    } else {
      throw new Error("Nothing selected — open or start a session first");
    }

    const runtime = await acquireRuntime(session);
    if (isNewSession) {
      // ensure the runtime sees the empty initial transcript
    }
    await runtime.sendUserMessage(content);
  } finally {
    setState((s) => ({ ...s, sendingMessage: false, streamingAssistantText: "" }));
  }
}

export function abortActiveTurn() {
  const state = getState();
  if (state.selection.kind !== "session") return;
  const runtime = runtimeBySession.get(state.selection.sessionId);
  runtime?.abort();
}

function findSession(state: ClientState, sessionId: string): Session | null {
  const global = state.globalSessions.find((session) => session.id === sessionId);
  if (global) return global;
  for (const sessions of Object.values(state.projectSessions)) {
    const match = sessions.find((session) => session.id === sessionId);
    if (match) return match;
  }
  return null;
}

async function acquireRuntime(session: Session): Promise<SessionRuntime> {
  const existing = runtimeBySession.get(session.id);
  if (existing) return existing;
  const state = getState();
  if (!state.profile) throw new Error("Profile not loaded");
  const project = session.project_id
    ? state.projects.find((proj) => proj.id === session.project_id) ?? null
    : null;
  const agent =
    state.agents.find((candidate) => candidate.agent_key === state.selectedAgentKey) ??
    state.agents[0] ??
    null;
  const scope = session.project_id
    ? { kind: "project" as const, projectId: session.project_id }
    : { kind: "global" as const, sessionId: session.id };
  const messages = state.messagesBySession[session.id] ?? [];
  const summaries = state.summariesBySession[session.id] ?? [];

  const runtime = new SessionRuntime({
    sessionId: session.id,
    scope,
    profile: state.profile,
    project,
    agent,
    messages,
    summaries,
  });

  const unsubscribe = runtime.subscribe((runtimeState) => {
    onRuntimeStateChanged(session.id, runtimeState);
  });
  (runtime as unknown as { __unsubscribe?: () => void }).__unsubscribe = unsubscribe;
  runtimeBySession.set(session.id, runtime);
  return runtime;
}

function onRuntimeStateChanged(sessionId: string, runtimeState: SessionRuntimeState) {
  setState((state) => {
    const currentSelectionId =
      state.selection.kind === "session" ? state.selection.sessionId : null;
    return {
      ...state,
      messagesBySession: { ...state.messagesBySession, [sessionId]: runtimeState.messages },
      summariesBySession: { ...state.summariesBySession, [sessionId]: runtimeState.summaries },
      streamingAssistantText:
        currentSelectionId === sessionId ? runtimeState.streamingAssistantText : state.streamingAssistantText,
      sendingMessage: currentSelectionId === sessionId ? runtimeState.isStreaming : state.sendingMessage,
    };
  });
}

export function deriveDisplayName(content: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (trimmed.length <= DISPLAY_NAME_MAX) return trimmed;
  return `${trimmed.slice(0, DISPLAY_NAME_MAX)}...`;
}

export function disposeRuntimes() {
  for (const runtime of runtimeBySession.values()) {
    runtime.abort();
    const unsubscribe = (runtime as unknown as { __unsubscribe?: () => void }).__unsubscribe;
    unsubscribe?.();
  }
  runtimeBySession.clear();
}

// re-export for callers that want to listen to runtime turns externally
export function getRuntime(sessionId: string): SessionRuntime | null {
  return runtimeBySession.get(sessionId) ?? null;
}

// Silence unused imports for messages helpers that may be needed later.
void appendMessage;
export type { Message, Summary };
