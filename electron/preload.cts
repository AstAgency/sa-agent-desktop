const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

const storageKey = "sa-agent.app-state";

type PersistedAppState = {
  language: "ru" | "en" | null;
  isAuthenticated: boolean;
  themeMode?: "dark" | "light" | null;
  selectedAgentKey?: string | null;
  activeProjectId?: string | null;
  activeSessionByProjectId?: Record<string, string | null>;
  apiBaseUrl?: string | null;
  devModeEnabled?: boolean;
};

type PersistedAppStatePatch = Partial<PersistedAppState>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAppState(value: unknown): PersistedAppState {
  if (!isRecord(value)) {
    return {
      language: null,
      isAuthenticated: false,
      themeMode: "dark",
      selectedAgentKey: null,
      activeProjectId: null,
      activeSessionByProjectId: {},
      apiBaseUrl: null,
      devModeEnabled: true,
    };
  }

  return {
    language: value.language === "ru" || value.language === "en" ? value.language : null,
    isAuthenticated: typeof value.isAuthenticated === "boolean" ? value.isAuthenticated : false,
    themeMode: value.themeMode === "dark" || value.themeMode === "light" ? value.themeMode : "dark",
    selectedAgentKey: typeof value.selectedAgentKey === "string" ? value.selectedAgentKey : null,
    activeProjectId: typeof value.activeProjectId === "string" ? value.activeProjectId : null,
    activeSessionByProjectId:
      isRecord(value.activeSessionByProjectId)
        ? (Object.fromEntries(
            Object.entries(value.activeSessionByProjectId).filter(
              ([key, entryValue]) => key.length > 0 && (typeof entryValue === "string" || entryValue === null),
            ),
          ) as Record<string, string | null>)
        : {},
    apiBaseUrl: typeof value.apiBaseUrl === "string" && value.apiBaseUrl.trim().length > 0 ? value.apiBaseUrl : null,
    devModeEnabled: typeof value.devModeEnabled === "boolean" ? value.devModeEnabled : true,
  };
}

function mergeAppState(
  currentState: PersistedAppState,
  patch: PersistedAppStatePatch,
): PersistedAppState {
  return normalizeAppState({ ...currentState, ...patch });
}

function getStorage() {
  return (globalThis as {
    localStorage?: {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    };
  }).localStorage;
}

function readAppState(): PersistedAppState | null {
  const storage = getStorage();
  const rawValue = storage?.getItem(storageKey);

  if (!rawValue) {
    return null;
  }

  try {
    return normalizeAppState(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function writeAppState(state: PersistedAppState) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(storageKey, JSON.stringify(state));
}

contextBridge.exposeInMainWorld("saAgent", {
  storage: {
    async getAppState() {
      return readAppState();
    },
    async setAppState(patch: PersistedAppStatePatch) {
      const currentState =
        readAppState() ?? {
          language: null,
          isAuthenticated: false,
          themeMode: "dark",
          selectedAgentKey: null,
          activeProjectId: null,
          activeSessionByProjectId: {},
          apiBaseUrl: null,
          devModeEnabled: true,
        };
      const nextState = mergeAppState(currentState, patch);
      writeAppState(nextState);
      return nextState;
    },
    async clearAppState() {
      getStorage()?.removeItem(storageKey);
    },
  },
  devtools: {
    async open() {
      return ipcRenderer.invoke("sa-agent:open-devtools");
    },
  },
  files: {
    async writeFiles(files: Array<{ relativePath: string; content: string }>) {
      return ipcRenderer.invoke("sa-agent:write-agent-files", files);
    },
    async openFolder() {
      return ipcRenderer.invoke("sa-agent:open-agent-files-folder");
    },
  },
  mcp: {
    async listTools(runtimeId: string, servers: Record<string, unknown>) {
      const response = await ipcRenderer.invoke("sa-agent:mcp-list-tools", runtimeId, servers);

      if (!isRecord(response) || response.ok !== true || !Array.isArray(response.tools)) {
        throw new Error(
          isRecord(response) && typeof response.error === "string"
            ? response.error
            : "Failed to list MCP tools.",
        );
      }

      return response.tools;
    },
    async callTool(
      runtimeId: string,
      serverName: string,
      toolName: string,
      argumentsJson: Record<string, unknown>,
    ) {
      const response = await ipcRenderer.invoke(
        "sa-agent:mcp-call-tool",
        runtimeId,
        serverName,
        toolName,
        argumentsJson,
      );

      if (!isRecord(response) || response.ok !== true || !isRecord(response.result)) {
        throw new Error(
          isRecord(response) && typeof response.error === "string"
            ? response.error
            : "Failed to call MCP tool.",
        );
      }

      return response.result;
    },
    async closeRuntime(runtimeId: string) {
      const response = await ipcRenderer.invoke("sa-agent:mcp-close-runtime", runtimeId);

      if (!isRecord(response) || response.ok !== true) {
        throw new Error(
          isRecord(response) && typeof response.error === "string"
            ? response.error
            : "Failed to close MCP runtime.",
        );
      }
    },
  },
});
