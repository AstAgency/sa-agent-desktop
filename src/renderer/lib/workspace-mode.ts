import type { WorkspaceMode } from "./types";

export function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return value === "home" ||
    value === "activity" ||
    value === "thread" ||
    value === "tasks" ||
    value === "agents" ||
    value === "files" ||
    value === "executions";
}

export function resolveWorkspaceMode(value: unknown): WorkspaceMode {
  return isWorkspaceMode(value) ? value : "home";
}
