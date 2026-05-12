import { useSyncExternalStore } from "react";
import type {
  Agent,
  EmbeddingModelInfo,
  Message,
  Profile,
  Project,
  Session,
  Summary,
} from "../lib/types";

export type ActiveSelection =
  | { kind: "none" }
  | { kind: "new-global" }
  | { kind: "new-project"; projectId: string }
  | { kind: "session"; sessionId: string };

export type ClientState = {
  bootstrap: {
    status: "idle" | "loading" | "ready" | "error";
    error: string | null;
    pythonReady: boolean;
    pythonError: string | null;
  };
  profile: Profile | null;
  projects: Project[];
  globalSessions: Session[];
  projectSessions: Record<string, Session[]>;
  embeddingModel: EmbeddingModelInfo | null;
  agents: Agent[];
  selectedAgentKey: string | null;
  selection: ActiveSelection;
  messagesBySession: Record<string, Message[]>;
  summariesBySession: Record<string, Summary[]>;
  loadingSessionId: string | null;
  sendingMessage: boolean;
  streamingAssistantText: string;
};

const initialState: ClientState = {
  bootstrap: { status: "idle", error: null, pythonReady: false, pythonError: null },
  profile: null,
  projects: [],
  globalSessions: [],
  projectSessions: {},
  embeddingModel: null,
  agents: [],
  selectedAgentKey: null,
  selection: { kind: "none" },
  messagesBySession: {},
  summariesBySession: {},
  loadingSessionId: null,
  sendingMessage: false,
  streamingAssistantText: "",
};

type Listener = () => void;

let currentState: ClientState = initialState;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function getState(): ClientState {
  return currentState;
}

export function setState(updater: (state: ClientState) => ClientState) {
  currentState = updater(currentState);
  emit();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useClientState<Selected>(selector: (state: ClientState) => Selected): Selected {
  return useSyncExternalStore(subscribe, () => selector(currentState), () => selector(currentState));
}

export function selectSelection(state: ClientState): ActiveSelection {
  return state.selection;
}

export function selectActiveSession(state: ClientState): Session | null {
  if (state.selection.kind !== "session") return null;
  const sessionId = state.selection.sessionId;
  if (sessionId == null) return null;
  const fromGlobal = state.globalSessions.find((session) => session.id === sessionId);
  if (fromGlobal) return fromGlobal;
  for (const sessions of Object.values(state.projectSessions)) {
    const match = sessions.find((session) => session.id === sessionId);
    if (match) return match;
  }
  return null;
}

export function selectActiveProject(state: ClientState): Project | null {
  const selection = state.selection;
  if (selection.kind === "new-project") {
    return state.projects.find((project) => project.id === selection.projectId) ?? null;
  }
  const session = selectActiveSession(state);
  if (!session || !session.project_id) return null;
  return state.projects.find((project) => project.id === session.project_id) ?? null;
}
