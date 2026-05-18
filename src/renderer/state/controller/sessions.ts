import {
  deleteSession as deleteSessionRequest,
  getAllSessionMessages,
  getSessionSummaries,
  updateSession as updateSessionRequest,
} from "../../lib/api";
import type { Session, WorkspaceScope } from "../../lib/types";
import { getState, setState, type ClientState } from "../store";
import { disposeSessionRuntime } from "./registry";

const DISPLAY_NAME_MAX = 30;

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
  disposeSessionRuntime(sessionId);
}

export async function hydrateSession(sessionId: string) {
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

export function findSession(state: ClientState, sessionId: string): Session | null {
  const global = state.globalSessions.find((session) => session.id === sessionId);
  if (global) return global;
  for (const sessions of Object.values(state.projectSessions)) {
    const match = sessions.find((session) => session.id === sessionId);
    if (match) return match;
  }
  return null;
}

export function buildSessionScope(state: ClientState, session: Session): WorkspaceScope {
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

export function deriveDisplayName(content: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (trimmed.length <= DISPLAY_NAME_MAX) return trimmed;
  return `${trimmed.slice(0, DISPLAY_NAME_MAX)}...`;
}
