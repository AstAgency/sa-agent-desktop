import { getState, setState } from "../store";
import { isNavigationLocked } from "../navigation-lock";
import { getRuntime } from "./registry";
import { hydrateSession } from "./sessions";

export function selectSession(sessionId: string) {
  if (isNavigationLocked(getState())) return;
  // Restore the live execution timeline for this session instead of blanking
  // it — switching to a session that is (or was) generating must keep its
  // reasoning/tool blocks and streamed text visible (spec §13). Sessions
  // with no active runtime fall back to empty; their finished turns are
  // reconstructed from persisted messages by the chat view.
  const live = getRuntime(sessionId)?.getState() ?? null;
  setState((state) => ({
    ...state,
    selection: { kind: "session", sessionId },
    streamingFinalText: live?.streamingFinalText ?? "",
    runtimeTrace: live?.trace ?? [],
    sendingMessage: live?.isStreaming ?? false,
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
