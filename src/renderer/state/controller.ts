import {
  ChatCompletionError,
  createProject,
  createSession,
  deleteProject as deleteProjectRequest,
  deleteSession as deleteSessionRequest,
  getAgentRoles,
  getAgentSkills,
  getAgents,
  getAllSessionMessages,
  getBilling,
  getEmbeddingModelInfo,
  getGlobalSessions,
  getProfile,
  getProjectSessions,
  getProjects,
  getSessionSummaries,
  updateGlobalMemory,
  updateProject as updateProjectRequest,
  updateProjectMemory,
  updateSession as updateSessionRequest,
} from "../lib/api";
import { getBridge } from "../lib/bridge";
import { translate } from "../lib/i18n";
import type {
  AgentRole,
  AgentSkill,
  Message,
  Session,
  Summary,
  WorkspaceScope,
} from "../lib/types";
import { SessionRuntime, type SessionRuntimeState } from "../agent/runtime";
import {
  buildComposerMessage,
  nextAvailableAttachmentPath,
  type ComposerAttachment,
} from "../components/chat-view-helpers";
import { createAgentContentCache } from "./agent-content-cache";
import {
  getState,
  setBilling,
  setLastStreamError,
  setState,
  type ChatErrorKind,
  type ClientState,
} from "./store";

const DISPLAY_NAME_MAX = 30;

const runtimeBySession = new Map<string, SessionRuntime>();
const runtimeUnsubscribes = new Map<string, () => void>();
const agentContentCache = createAgentContentCache();

async function loadAgentSkills(agentKey: string): Promise<AgentSkill[]> {
  const cached = agentContentCache.getSkillsList(agentKey);
  if (cached) return cached;
  try {
    const skills = await getAgentSkills(agentKey);
    agentContentCache.setSkills(agentKey, skills);
    return skills;
  } catch (error) {
    console.warn("[controller] failed to load agent skills", error);
    return [];
  }
}

async function loadAgentRoles(agentKey: string): Promise<AgentRole[]> {
  const cached = agentContentCache.getRolesList(agentKey);
  if (cached) return cached;
  try {
    const roles = await getAgentRoles(agentKey);
    agentContentCache.setRoles(agentKey, roles);
    return roles;
  } catch (error) {
    console.warn("[controller] failed to load agent roles", error);
    return [];
  }
}

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
      selection: state.selection.kind === "none" ? { kind: "new-global" } : state.selection,
      bootstrap: { ...state.bootstrap, status: "ready", error: null },
    }));
    await Promise.all(projects.map((project) => loadProjectSessions(project.id)));
    void refreshBilling();
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

export async function refreshBilling(): Promise<void> {
  try {
    const billing = await getBilling();
    setBilling(billing);
  } catch (error) {
    console.warn("[billing] refresh failed", error);
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
    streamingFinalText: "",
    runtimeTrace: [],
  }));
  void hydrateSession(sessionId);
}

export function startNewGlobalSession() {
  setState((state) => ({
    ...state,
    selection: { kind: "new-global" },
    streamingFinalText: "",
    runtimeTrace: [],
  }));
}

export function startNewProjectSession(projectId: string) {
  setState((state) => ({
    ...state,
    selection: { kind: "new-project", projectId },
    streamingFinalText: "",
    runtimeTrace: [],
  }));
}

export function clearSelection() {
  setState((state) => ({ ...state, selection: { kind: "none" }, streamingFinalText: "",
    runtimeTrace: [] }));
}

export function setSelectedAgent(agentKey: string | null) {
  setState((state) => ({ ...state, selectedAgentKey: agentKey }));
}

export async function createProjectAndSelect(input: { name: string; description?: string }) {
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
  }));
  return project;
}

export async function saveGlobalMemory(content: string) {
  const profile = await updateGlobalMemory(content);
  setState((state) => ({ ...state, profile }));
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
  await deleteProjectRequest(projectId);
  const stateBefore = getState();
  const affectedSessionIds = (stateBefore.projectSessions[projectId] ?? []).map(
    (session) => session.id,
  );
  setState((state) => {
    const nextProjects = state.projects.filter((existing) => existing.id !== projectId);
    const { [projectId]: _removed, ...nextProjectSessions } = state.projectSessions;
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
      messagesBySession,
      summariesBySession,
      selection: selectionTouchesProject ? { kind: "none" } : state.selection,
      streamingFinalText: selectionTouchesProject ? "" : state.streamingFinalText,
      runtimeTrace: selectionTouchesProject ? [] : state.runtimeTrace,
    };
  });
  for (const sessionId of affectedSessionIds) {
    const instance = runtimeBySession.get(sessionId);
    if (!instance) continue;
    instance.dispose();
    runtimeBySession.delete(sessionId);
    const unsub = runtimeUnsubscribes.get(sessionId);
    unsub?.();
    runtimeUnsubscribes.delete(sessionId);
  }
}

export async function renameSession(sessionId: string, displayName: string) {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return;
  const session = await updateSessionRequest(sessionId, { display_name: trimmed });
  setState((state) => {
    const inGlobals = state.globalSessions.some((existing) => existing.id === sessionId);
    const nextGlobalSessions = inGlobals
      ? state.globalSessions.map((existing) => (existing.id === sessionId ? session : existing))
      : state.globalSessions;
    const nextProjectSessions: Record<string, typeof state.globalSessions> = {};
    for (const [projectId, sessions] of Object.entries(state.projectSessions)) {
      nextProjectSessions[projectId] = sessions.map((existing) =>
        existing.id === sessionId ? session : existing,
      );
    }
    return {
      ...state,
      globalSessions: nextGlobalSessions,
      projectSessions: nextProjectSessions,
    };
  });
}

export async function removeSession(sessionId: string) {
  await deleteSessionRequest(sessionId);
  setState((state) => {
    const nextGlobalSessions = state.globalSessions.filter((existing) => existing.id !== sessionId);
    const nextProjectSessions: Record<string, typeof state.globalSessions> = {};
    for (const [projectId, sessions] of Object.entries(state.projectSessions)) {
      nextProjectSessions[projectId] = sessions.filter((existing) => existing.id !== sessionId);
    }
    const isSelected = state.selection.kind === "session" && state.selection.sessionId === sessionId;
    const { [sessionId]: _droppedMessages, ...messagesBySession } = state.messagesBySession;
    const { [sessionId]: _droppedSummaries, ...summariesBySession } = state.summariesBySession;
    return {
      ...state,
      globalSessions: nextGlobalSessions,
      projectSessions: nextProjectSessions,
      messagesBySession,
      summariesBySession,
      selection: isSelected ? { kind: "none" } : state.selection,
      streamingFinalText: isSelected ? "" : state.streamingFinalText,
      runtimeTrace: isSelected ? [] : state.runtimeTrace,
    };
  });
  const runtime = runtimeBySession.get(sessionId);
  if (runtime) {
    runtime.dispose();
    runtimeBySession.delete(sessionId);
    const unsub = runtimeUnsubscribes.get(sessionId);
    unsub?.();
    runtimeUnsubscribes.delete(sessionId);
  }
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

export async function sendMessage(
  content: string,
  attachments: ComposerAttachment[] = [],
): Promise<void> {
  const trimmed = content.trim();
  if (trimmed.length === 0 && attachments.length === 0) return;
  const state = getState();
  if (state.sendingMessage) throw new Error("Already sending a message");
  if (!state.profile) throw new Error("Profile not loaded");

  setLastStreamError(null);
  setState((s) => ({ ...s, sendingMessage: true, streamingFinalText: "",
    runtimeTrace: [] }));

  try {
    const selection = state.selection;
    let session: Session;
    if (selection.kind === "session") {
      const existing = findSession(state, selection.sessionId);
      if (!existing) throw new Error("Session not found");
      session = existing;
    } else if (selection.kind === "new-global") {
      session = await createSession({
        display_name: deriveDisplayName(deriveSessionNameSource(content, attachments)),
        project_id: null,
      });
      setState((s) => ({
        ...s,
        globalSessions: [session, ...s.globalSessions],
        selection: { kind: "session", sessionId: session.id },
        messagesBySession: { ...s.messagesBySession, [session.id]: [] },
        summariesBySession: { ...s.summariesBySession, [session.id]: [] },
      }));
    } else if (selection.kind === "new-project") {
      session = await createSession({
        display_name: deriveDisplayName(deriveSessionNameSource(content, attachments)),
        project_id: selection.projectId,
      });
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

    const scope = buildSessionScope(state, session);
    const persistedAttachments = await saveAttachmentsToWorkspace(scope, attachments);
    const messageContent = buildComposerMessage(content, persistedAttachments);
    const runtime = await acquireRuntime(session);
    try {
      await runtime.sendUserMessage(messageContent);
    } catch (error) {
      reportStreamError(error, session.id);
      throw error;
    }
  } finally {
    setState((s) => ({ ...s, sendingMessage: false, streamingFinalText: "",
    runtimeTrace: [] }));
    void refreshBilling();
  }
}

function deriveSessionNameSource(
  content: string,
  attachments: ComposerAttachment[],
): string {
  const trimmed = content.trim();
  if (trimmed.length > 0) return trimmed;
  return attachments[0]?.name ?? "New chat";
}

function reportStreamError(error: unknown, sessionId: string) {
  const state = getState();
  const language = state.language;
  let kind: ChatErrorKind = "generic";
  let message: string;
  if (error instanceof ChatCompletionError) {
    kind = error.kind;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  if (kind === "rate_limit") {
    message = translate(language, "chat.error.rateLimit");
  } else if (kind === "timeout") {
    message = translate(language, "chat.error.timeout");
  } else {
    message = translate(language, "chat.error.generic", { message: rawMessage });
  }
  setLastStreamError({ kind, message, sessionId });
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
  const scope = buildSessionScope(state, session);
  const messages = state.messagesBySession[session.id] ?? [];
  const summaries = state.summariesBySession[session.id] ?? [];
  const [agentSkills, agentRoles] = agent
    ? await Promise.all([loadAgentSkills(agent.id), loadAgentRoles(agent.id)])
    : [[] as AgentSkill[], [] as AgentRole[]];

  const runtime = new SessionRuntime({
    sessionId: session.id,
    scope,
    profile: state.profile,
    project,
    agent,
    agentSkills,
    agentRoles,
    messages,
    summaries,
    toolActions: {
      updateGlobalMemory: saveGlobalMemory,
      updateProjectMemory: saveProjectMemory,
      // createProject: createProjectViaTool,
    },
    model: agent.llm_model
  });

  const unsubscribe = runtime.subscribe((runtimeState) => {
    onRuntimeStateChanged(session.id, runtimeState);
  });
  runtimeUnsubscribes.set(session.id, unsubscribe);
  runtimeBySession.set(session.id, runtime);
  return runtime;
}

function buildSessionScope(state: ClientState, session: Session): WorkspaceScope {
  const project = session.project_id
    ? state.projects.find((proj) => proj.id === session.project_id) ?? null
    : null;
  return session.project_id
    ? {
        kind: "project",
        projectId: session.project_id,
        displayName: project?.name ?? session.project_id,
      }
    : {
        kind: "global",
        sessionId: session.id,
        displayName: session.display_name,
      };
}

async function saveAttachmentsToWorkspace(
  scope: WorkspaceScope,
  attachments: ComposerAttachment[],
) {
  if (attachments.length === 0) return [];
  const fs = getBridge().fs;
  const rootEntries = await fs.list(scope, ".");
  const usedPaths = new Set(
    rootEntries.filter((entry) => entry.type === "file").map((entry) => entry.name),
  );
  const persisted: Array<{
    name: string;
    size: number;
    mime: string;
    kind: "text" | "binary";
    workspacePath: string;
  }> = [];
  for (const attachment of attachments) {
    const workspacePath = nextAvailableAttachmentPath(attachment.name, usedPaths);
    usedPaths.add(workspacePath);
    if (attachment.kind === "text") {
      await fs.write(scope, workspacePath, attachment.content);
    } else {
      await fs.writeBinary(scope, workspacePath, attachment.content);
    }
    persisted.push({
      name: attachment.name,
      size: attachment.size,
      mime: attachment.mime,
      kind: attachment.kind,
      workspacePath,
    });
  }
  return persisted;
}

function onRuntimeStateChanged(sessionId: string, runtimeState: SessionRuntimeState) {
  setState((state) => {
    const currentSelectionId =
      state.selection.kind === "session" ? state.selection.sessionId : null;
    return {
      ...state,
      messagesBySession: { ...state.messagesBySession, [sessionId]: runtimeState.messages },
      summariesBySession: { ...state.summariesBySession, [sessionId]: runtimeState.summaries },
      streamingFinalText:
        currentSelectionId === sessionId ? runtimeState.streamingFinalText : state.streamingFinalText,
      runtimeTrace:
        currentSelectionId === sessionId ? runtimeState.trace : state.runtimeTrace,
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
  }
  for (const unsubscribe of runtimeUnsubscribes.values()) {
    unsubscribe();
  }
  runtimeBySession.clear();
  runtimeUnsubscribes.clear();
}

export function getRuntime(sessionId: string): SessionRuntime | null {
  return runtimeBySession.get(sessionId) ?? null;
}

export type { Message, Summary };
