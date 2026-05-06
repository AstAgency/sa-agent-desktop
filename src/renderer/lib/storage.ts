import type { PersistedAppState, PersistedAppStatePatch } from "./types";
import { defaultAppState, mergeAppState, normalizeAppState, storageKey } from "../state/app-state";

function readFromLocalStorage(): PersistedAppState {
  if (typeof window === "undefined") {
    return defaultAppState;
  }

  let rawValue: string | null = null;

  try {
    rawValue = window.localStorage.getItem(storageKey);
  } catch {
    return defaultAppState;
  }

  if (!rawValue) {
    return defaultAppState;
  }

  try {
    return normalizeAppState(JSON.parse(rawValue));
  } catch {
    return defaultAppState;
  }
}

function writeToLocalStorage(state: PersistedAppState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore local persistence failures and keep the in-memory transition.
  }
}

export async function getStoredAppState(): Promise<PersistedAppState> {
  try {
    const bridgeState = await window.saAgent?.storage.getAppState();
    return bridgeState ? normalizeAppState(bridgeState) : readFromLocalStorage();
  } catch {
    return readFromLocalStorage();
  }
}

export async function updateStoredAppState(
  patch: PersistedAppStatePatch,
): Promise<PersistedAppState> {
  try {
    if (window.saAgent?.storage) {
      const nextState = await window.saAgent.storage.setAppState(patch);
      const normalizedState = normalizeAppState(nextState);
      writeToLocalStorage(normalizedState);
      return normalizedState;
    }
  } catch {
    // Fall back to renderer-local persistence below.
  }

  const nextState = mergeAppState(readFromLocalStorage(), patch);
  writeToLocalStorage(nextState);
  return nextState;
}

export async function clearStoredAppState(): Promise<void> {
  try {
    if (window.saAgent?.storage) {
      await window.saAgent.storage.clearAppState();
    }
  } catch {
    // Fall back to renderer-local cleanup below.
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore local cleanup failures.
    }
  }
}
