import { useSyncExternalStore } from "react";
import type { AppLanguage } from "../lib/i18n";
import type { RuntimeTraceEvent } from "../agent/runtime";
import type { AuthSession } from "../lib/auth-api";
import type {
  Agent,
  Billing,
  EmbeddingModelInfo,
  Message,
  Profile,
  Project,
  Session,
  Summary,
} from "../lib/types";

export type SessionListPageState = {
  page: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
};

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthSlice = {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
};

export type ChatErrorKind = "rate_limit" | "timeout" | "generic";

export type LastStreamError = {
  kind: ChatErrorKind;
  message: string;
  sessionId: string;
};

export type ActiveSelection =
  | { kind: "none" }
  | { kind: "new-global" }
  | { kind: "new-project"; projectId: string }
  | { kind: "session"; sessionId: string };

export type ThemeMode = "dark" | "light";

export type ClientState = {
  auth: AuthSlice;
  bootstrap: {
    status: "idle" | "loading" | "ready" | "error";
    error: string | null;
    pythonReady: boolean;
    pythonError: string | null;
  };
  profile: Profile | null;
  projects: Project[];
  globalSessions: Session[];
  globalSessionsPage: SessionListPageState;
  projectSessions: Record<string, Session[]>;
  projectSessionsPage: Record<string, SessionListPageState>;
  embeddingModel: EmbeddingModelInfo | null;
  agents: Agent[];
  selectedAgentKey: string | null;
  selection: ActiveSelection;
  messagesBySession: Record<string, Message[]>;
  summariesBySession: Record<string, Summary[]>;
  loadingSessionId: string | null;
  sendingMessage: boolean;
  streamingFinalText: string;
  runtimeTrace: RuntimeTraceEvent[];
  theme: ThemeMode;
  language: AppLanguage;
  sidebarCollapsed: boolean;
  profileModalOpen: boolean;
  billing: Billing | null;
  lastStreamError: LastStreamError | null;
  uiNotice: { id: number; message: string } | null;
};

const SETTINGS_KEY = "sa-agent.settings";
type PersistedSettings = {
  theme?: ThemeMode;
  language?: AppLanguage;
  sidebarCollapsed?: boolean;
};

function readPersistedSettings(): PersistedSettings {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedSettings;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function detectDefaultLanguage(): AppLanguage {
  if (typeof navigator === "undefined") return "en";
  const tag = (navigator.language || "en").toLowerCase();
  return tag.startsWith("ru") ? "ru" : "en";
}

const persisted = readPersistedSettings();

const initialState: ClientState = {
  auth: { status: "loading", session: null, error: null },
  bootstrap: { status: "idle", error: null, pythonReady: false, pythonError: null },
  profile: null,
  projects: [],
  globalSessions: [],
  globalSessionsPage: { page: 0, total: 0, hasMore: false, loading: false, loaded: false },
  projectSessions: {},
  projectSessionsPage: {},
  embeddingModel: null,
  agents: [],
  selectedAgentKey: null,
  selection: { kind: "none" },
  messagesBySession: {},
  summariesBySession: {},
  loadingSessionId: null,
  sendingMessage: false,
  streamingFinalText: "",
  runtimeTrace: [],
  theme: persisted.theme ?? "dark",
  language: persisted.language ?? detectDefaultLanguage(),
  sidebarCollapsed: persisted.sidebarCollapsed ?? false,
  profileModalOpen: false,
  billing: null,
  lastStreamError: null,
  uiNotice: null,
};

function persistSettings(state: ClientState) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedSettings = {
      theme: state.theme,
      language: state.language,
      sidebarCollapsed: state.sidebarCollapsed,
    };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

type Listener = () => void;

let currentState: ClientState = initialState;
const listeners = new Set<Listener>();
let uiNoticeCounter = 0;
let uiNoticeTimeoutId: number | null = null;

function emit() {
  for (const listener of listeners) listener();
}

export function getState(): ClientState {
  return currentState;
}

export function setState(updater: (state: ClientState) => ClientState) {
  const next = updater(currentState);
  const prefsChanged =
    next.theme !== currentState.theme ||
    next.language !== currentState.language ||
    next.sidebarCollapsed !== currentState.sidebarCollapsed;
  currentState = next;
  if (prefsChanged) persistSettings(currentState);
  emit();
}

export function setTheme(theme: ThemeMode) {
  setState((state) => ({ ...state, theme }));
}

export function setLanguage(language: AppLanguage) {
  setState((state) => ({ ...state, language }));
}

export function toggleSidebarCollapsed() {
  setState((state) => ({ ...state, sidebarCollapsed: !state.sidebarCollapsed }));
}

export function setProfileModalOpen(open: boolean) {
  setState((state) => ({ ...state, profileModalOpen: open }));
}

export function setBilling(billing: Billing | null) {
  setState((state) => ({ ...state, billing }));
}

export function setLastStreamError(lastStreamError: LastStreamError | null) {
  setState((state) => ({ ...state, lastStreamError }));
}

export function showUiNotice(message: string, durationMs = 2800) {
  uiNoticeCounter += 1;
  const id = uiNoticeCounter;
  if (typeof window !== "undefined") {
    if (uiNoticeTimeoutId !== null) window.clearTimeout(uiNoticeTimeoutId);
    uiNoticeTimeoutId = window.setTimeout(() => {
      setState((state) => (state.uiNotice?.id === id ? { ...state, uiNotice: null } : state));
      uiNoticeTimeoutId = null;
    }, durationMs);
  }
  setState((state) => ({ ...state, uiNotice: { id, message } }));
}

export function setAuthLoading() {
  setState((state) => ({
    ...state,
    auth: { status: "loading", session: state.auth.session, error: null },
  }));
}

export function setAuthAuthenticated(session: AuthSession) {
  setState((state) => ({
    ...state,
    auth: { status: "authenticated", session, error: null },
  }));
}

export function setAuthUnauthenticated(error: string | null = null) {
  setState((state) => ({
    ...state,
    auth: { status: "unauthenticated", session: null, error },
  }));
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
