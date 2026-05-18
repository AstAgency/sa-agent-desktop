import { getState, setState } from "../store";
import { isNavigationLocked } from "../navigation-lock";
import { hydrateSession } from "./sessions";

export function selectSession(sessionId: string) {
  if (isNavigationLocked(getState())) return;
  setState((state) => ({
    ...state,
    selection: { kind: "session", sessionId },
    streamingFinalText: "",
    runtimeTrace: [],
  }));
  void hydrateSession(sessionId);
}

export function startNewGlobalSession() {
  if (isNavigationLocked(getState())) return;
  setState((state) => ({
    ...state,
    selection: { kind: "new-global" },
    streamingFinalText: "",
    runtimeTrace: [],
  }));
}

export function startNewProjectSession(projectId: string) {
  if (isNavigationLocked(getState())) return;
  setState((state) => ({
    ...state,
    selection: { kind: "new-project", projectId },
    streamingFinalText: "",
    runtimeTrace: [],
  }));
}

export function clearSelection() {
  if (isNavigationLocked(getState())) return;
  setState((state) => ({ ...state, selection: { kind: "none" }, streamingFinalText: "",
    runtimeTrace: [] }));
}

export function setSelectedAgent(agentKey: string | null) {
  setState((state) => ({ ...state, selectedAgentKey: agentKey }));
}
