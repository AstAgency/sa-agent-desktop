import type { FileEntry, PythonRuntimeStatus, RunPythonResult, WorkspaceScope } from "./types";

type Bridge = {
  python: {
    status: () => Promise<PythonRuntimeStatus>;
    start: () => Promise<PythonRuntimeStatus>;
    embedQuery: (text: string) => Promise<number[]>;
    embedPassage: (text: string) => Promise<number[]>;
    run: (
      scope: WorkspaceScope,
      code: string,
      options?: { timeoutMs?: number; stdin?: string },
    ) => Promise<RunPythonResult>;
  };
  fs: {
    read: (scope: WorkspaceScope, path: string) => Promise<string>;
    write: (scope: WorkspaceScope, path: string, content: string) => Promise<{ path: string }>;
    edit: (
      scope: WorkspaceScope,
      path: string,
      oldString: string,
      newString: string,
      replaceAll: boolean,
    ) => Promise<{ replacements: number; path: string }>;
    list: (scope: WorkspaceScope, path?: string) => Promise<FileEntry[]>;
    openFolder: (scope: WorkspaceScope) => Promise<{ path: string }>;
    scopeRoot: (scope: WorkspaceScope) => Promise<string>;
    openWorkspaceRoot: (kind: "global" | "projects") => Promise<{ path: string }>;
    openProjectRoot: (projectId: string) => Promise<{ path: string }>;
  };
};

declare global {
  interface Window {
    saAgent?: Bridge;
  }
}

export function getBridge(): Bridge {
  const bridge = window.saAgent;
  if (!bridge) {
    throw new Error("Electron bridge unavailable — make sure preload.cjs is loaded");
  }
  return bridge;
}

export type { Bridge };
