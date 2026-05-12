const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

type IpcEnvelope<T> = { ok: true; value: T } | { ok: false; error: string };

type WorkspaceScope =
  | { kind: "project"; projectId: string }
  | { kind: "global"; sessionId: string };

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
    write(scope: WorkspaceScope, path: string, content: string): Promise<{ path: string }> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-write", scope, path, content));
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
    openProjectRoot(projectId: string): Promise<{ path: string }> {
      return unwrap(ipcRenderer.invoke("sa-agent:fs-open-project-root", projectId));
    },
  },
});
