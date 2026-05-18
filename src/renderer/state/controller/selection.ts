import { setState } from "../store";
import { hydrateSession } from "./sessions";

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
