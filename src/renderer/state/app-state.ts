import type { AppLanguage, PersistedAppState, PersistedAppStatePatch, ThemeMode } from "../lib/types";

export const storageKey = "sa-agent.app-state";

export const defaultAppState: PersistedAppState = {
  language: null,
  isAuthenticated: false,
  themeMode: "dark",
  activeProjectId: null,
  activeSessionByProjectId: {},
  apiBaseUrl: null,
  devModeEnabled: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "ru" || value === "en";
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function normalizeAppState(value: unknown): PersistedAppState {
  if (!isRecord(value)) {
    return defaultAppState;
  }

  return {
    language: isAppLanguage(value.language) ? value.language : null,
    isAuthenticated: typeof value.isAuthenticated === "boolean" ? value.isAuthenticated : false,
    themeMode: isThemeMode(value.themeMode) ? value.themeMode : "dark",
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

export function mergeAppState(
  currentState: PersistedAppState,
  patch: PersistedAppStatePatch,
): PersistedAppState {
  return normalizeAppState({ ...currentState, ...patch });
}
