import { readAllCacheValuesDebug, type DebugCacheEntry } from "./cache";
import type { BootstrapSnapshot, DebugNetworkEntry, PersistedAppState } from "./types";

const networkLog: DebugNetworkEntry[] = [];
const agentRuntimeLog: DebugAgentRuntimeEntry[] = [];
const maxEntries = 80;

export function recordDebugNetworkEntry(entry: DebugNetworkEntry) {
  networkLog.unshift(entry);

  if (networkLog.length > maxEntries) {
    networkLog.length = maxEntries;
  }
}

export function getDebugNetworkEntries() {
  return [...networkLog];
}

export type DebugAgentRuntimeEntry = {
  id: string;
  startedAt: string;
  type: string;
  sessionId?: string | null;
  data?: unknown;
};

export function recordDebugAgentRuntimeEntry(entry: DebugAgentRuntimeEntry) {
  agentRuntimeLog.unshift(entry);

  if (agentRuntimeLog.length > maxEntries) {
    agentRuntimeLog.length = maxEntries;
  }
}

export function getDebugAgentRuntimeEntries() {
  return [...agentRuntimeLog];
}

export function getDebugStateSnapshot(input: {
  appState: PersistedAppState | null;
  bootstrapSnapshot: BootstrapSnapshot | null;
}) {
  return {
    appState: input.appState,
    bootstrapSnapshot: input.bootstrapSnapshot,
    localStorageAppState: readLocalStorageAppState(),
    entityCache: readAllCacheValuesDebug(),
    agentRuntime: getDebugAgentRuntimeEntries(),
  };
}

function readLocalStorageAppState(): PersistedAppState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem("sa-agent.app-state");

    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as PersistedAppState;
  } catch {
    return null;
  }
}

export type DebugStateSnapshot = {
  appState: PersistedAppState | null;
  bootstrapSnapshot: BootstrapSnapshot | null;
  localStorageAppState: PersistedAppState | null;
  entityCache: DebugCacheEntry[];
  agentRuntime: DebugAgentRuntimeEntry[];
};
