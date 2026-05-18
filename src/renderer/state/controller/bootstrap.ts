import {
  getAgents,
  getBilling,
  getEmbeddingModelInfo,
  getGlobalSessions,
  getProfile,
  getProjects,
} from "../../lib/api";
import { getBridge } from "../../lib/bridge";
import { setBilling, setState } from "../store";
import { loadProjectSessions } from "./projects";

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
