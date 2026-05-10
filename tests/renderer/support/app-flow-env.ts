import { afterEach, beforeEach, vi } from "vitest";

export type StorageSnapshot = {
  language: "ru" | "en" | null;
  isAuthenticated: boolean;
  themeMode?: "dark" | "light" | null;
  workspaceMode?: "home" | "activity" | "thread" | "tasks" | "agents" | "files" | "executions" | null;
  selectedAgentKey?: string | null;
  activeWorkspaceId?: string | null;
  apiBaseUrl?: string | null;
  devModeEnabled?: boolean;
  activeProjectId?: string | null;
  activeProjectAgentId?: string | null;
  activeSessionId?: string | null;
  activeThreadId?: string | null;
};

export const storage = {
  getAppState: vi.fn<() => Promise<StorageSnapshot | null>>(),
  setAppState: vi.fn<(value: Partial<StorageSnapshot>) => Promise<StorageSnapshot>>(),
  clearAppState: vi.fn<() => Promise<void>>(),
};

export const devtools = {
  open: vi.fn<() => Promise<{ ok: boolean; error?: string | null }>>(),
};

export const files = {
  writeFiles: vi.fn<(entries: Array<{ relativePath: string; content: string }>) => Promise<unknown>>(),
  openFolder: vi.fn<() => Promise<{ ok: boolean; rootPath?: string | null; error?: string | null }>>(),
};

export function installAppFlowEnv() {
  let currentState: StorageSnapshot = { language: null, isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
  let fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    currentState = { language: null, isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true };
    fetchMock = vi.fn<typeof fetch>();
    storage.getAppState.mockImplementation(async () => currentState);
    storage.setAppState.mockImplementation(async (patch) => (currentState = { ...currentState, ...patch }));
    storage.clearAppState.mockResolvedValue();
    devtools.open.mockResolvedValue({ ok: true });
    files.writeFiles.mockResolvedValue({ ok: true, rootPath: "/tmp/agent-files" });
    files.openFolder.mockResolvedValue({ ok: true, rootPath: "/tmp/agent-files" });
    window.saAgent = { storage, devtools, files };
    document.documentElement.lang = "en";
    document.documentElement.dataset.themeMode = "";
    window.localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  return {
    setState(next: StorageSnapshot) {
      currentState = next;
    },
    get fetchMock() {
      return fetchMock;
    },
  };
}
