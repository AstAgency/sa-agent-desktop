const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

type IpcEnvelope<T> = { ok: true; value: T } | { ok: false; error: string };

type WorkspaceScope =
  | { kind: "project"; projectId: string; displayName: string }
  | { kind: "global"; sessionId: string; displayName: string };

type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
  modified_at: string;
};

type RunPythonResult = {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  timed_out: boolean;
  script_path: string;
};

type PythonRuntimeStatus = {
  ready: boolean;
  model_id: string | null;
  dimensions: number | null;
  error: string | null;
};

type SearchStatus =
  | { state: "stopped" }
  | { state: "starting" }
  | { state: "running"; port: number; pid: number | null }
  | { state: "unsupported"; reason: string }
  | { state: "failed"; error: string };

type DialogOpenFileResult = {
  name: string;
  size: number;
  mime: string;
  kind: "text" | "binary";
  content: string;
};

async function unwrap<T>(invocation: Promise<IpcEnvelope<T>>): Promise<T> {
  const result = await invocation;
  if (!result || typeof result !== "object") {
    throw new Error("Invalid IPC response");
  }
  if (result.ok) return result.value;
  throw new Error(result.error);
}

contextBridge.exposeInMainWorld("saAgent", {
  python: {
    status(): Promise<PythonRuntimeStatus> {
      return ipcRenderer.invoke("sa-agent:python-status") as Promise<PythonRuntimeStatus>;
    },
    start(): Promise<PythonRuntimeStatus> {
      return unwrap(ipcRenderer.invoke("sa-agent:python-start"));
    },
    embedQuery(text: string): Promise<number[]> {
      return unwrap(ipcRenderer.invoke("sa-agent:python-embed-query", text));
    },
    embedPassage(text: string): Promise<number[]> {
      return unwrap(ipcRenderer.invoke("sa-agent:python-embed-passage", text));
    },
    run(
      scope: WorkspaceScope,
      code: string,
      options?: { timeoutMs?: number; stdin?: string },
    ): Promise<RunPythonResult> {
      return unwrap(
        ipcRenderer.invoke(
          "sa-agent:python-run",
          scope,
          code,
          options?.timeoutMs ?? 30_000,
          options?.stdin ?? "",
        ),
      );
    },
  },
  fs: {
    read(scope: WorkspaceScope, path: string): Promise<string> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-read", scope, path));
    },
    readBinary(
      scope: WorkspaceScope,
      path: string,
    ): Promise<{ base64: string; bytes: number }> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-read-binary", scope, path));
    },
    write(scope: WorkspaceScope, path: string, content: string): Promise<{ path: string }> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-write", scope, path, content));
    },
    writeBinary(scope: WorkspaceScope, path: string, base64: string): Promise<{ path: string }> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-write-binary", scope, path, base64));
    },
    edit(
      scope: WorkspaceScope,
      path: string,
      oldString: string,
      newString: string,
      replaceAll: boolean,
    ): Promise<{ replacements: number; path: string }> {
      return unwrap(
        ipcRenderer.invoke("sa-agent:fs-edit", scope, path, oldString, newString, replaceAll),
      );
    },
    list(scope: WorkspaceScope, path?: string): Promise<FileEntry[]> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-list", scope, path));
    },
    openFolder(scope: WorkspaceScope): Promise<{ path: string }> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-open-folder", scope));
    },
    scopeRoot(scope: WorkspaceScope): Promise<string> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-scope-root", scope));
    },
    openWorkspaceRoot(kind: "global" | "projects"): Promise<{ path: string }> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-open-workspace-root", kind));
    },
    openProjectRoot(projectId: string, displayName?: string): Promise<{ path: string }> {
      return unwrap(
        ipcRenderer.invoke("sa-agent:fs-open-project-root", projectId, displayName ?? ""),
      );
    },
  },
  net: {
    fetchUrl(
      url: string,
      options?: { timeoutMs?: number; maxChars?: number; mode?: "readable" | "raw" },
    ): Promise<string> {
      return unwrap(ipcRenderer.invoke("sa-agent:net-fetch-url", url, options ?? {}));
    },
    webSearch(query: string, limit?: number): Promise<string> {
      return unwrap(ipcRenderer.invoke("sa-agent:net-web-search", query, limit ?? 5));
    },
    getSearchStatus(): Promise<SearchStatus> {
      return ipcRenderer.invoke("sa-agent:net-get-search-status") as Promise<SearchStatus>;
    },
    startSearch(): Promise<SearchStatus> {
      return unwrap(ipcRenderer.invoke("sa-agent:net-start-search"));
    },
  },
  dialog: {
    openFiles(): Promise<DialogOpenFileResult[]> {
      return unwrap(ipcRenderer.invoke("sa-agent:dialog-open-files"));
    },
  },
});
