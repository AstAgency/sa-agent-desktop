import {
  getAgents,
  getBilling,
  getEmbeddingModelInfo,
  getSessionsPage,
  getProfile,
  getProjects,
} from "../../lib/api";
import { getBridge } from "../../lib/bridge";
import { setBilling, setState } from "../store";

let inflightBootstrap: Promise<void> | null = null;

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
  if (inflightBootstrap) return inflightBootstrap;

  inflightBootstrap = (async () => {
    setState((state) => ({
      ...state,
      bootstrap: { ...state.bootstrap, status: "loading", error: null },
    }));
    try {
      const [profile, projects, globalSessionsPage, embeddingModel, agents] = await Promise.all([
        getProfile(),
        getProjects(),
        getSessionsPage({ global: true, page: 1 }),
        getEmbeddingModelInfo(),
        getAgents(),
      ]);
      setState((state) => ({
        ...state,
        profile,
        projects,
        globalSessions: globalSessionsPage.sessions,
        globalSessionsPage: {
          page: globalSessionsPage.page,
          total: globalSessionsPage.total,
          hasMore: globalSessionsPage.has_more,
          loading: false,
          loaded: true,
        },
        embeddingModel,
        agents,
        selectedAgentKey: state.selectedAgentKey ?? agents[0]?.agent_key ?? null,
        selection: state.selection.kind === "none" ? { kind: "new-global" } : state.selection,
        bootstrap: { ...state.bootstrap, status: "ready", error: null },
      }));
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
    } finally {
      inflightBootstrap = null;
    }
  })();

  return inflightBootstrap;
}

export async function refreshBilling(): Promise<void> {
  try {
    const billing = await getBilling();
    setBilling(billing);
  } catch (error) {
    console.warn("[billing] refresh failed", error);
  }
}
