import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

export type WorkspaceScope =
  | { kind: "project"; projectId: string }
  | { kind: "global"; sessionId: string };

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
  modified_at: string;
};

const TMP_SUBDIR = ".tmp";

export function resolveScopeRoot(scope: WorkspaceScope): string {
  const userData = app.getPath("userData");
  if (scope.kind === "project") {
    if (!isSafeId(scope.projectId)) {
      throw new Error("Invalid project id");
    }
    return path.join(userData, "projects", scope.projectId);
  }
  if (!isSafeId(scope.sessionId)) {
    throw new Error("Invalid session id");
  }
  return path.join(userData, "global", scope.sessionId);
}

export async function ensureScopeRoot(scope: WorkspaceScope): Promise<string> {
  const root = resolveScopeRoot(scope);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, TMP_SUBDIR), { recursive: true });
  return root;
}

export function resolveTmpDir(scope: WorkspaceScope): string {
  return path.join(resolveScopeRoot(scope), TMP_SUBDIR);
}

function resolveSafePath(root: string, relative: string): string {
  if (typeof relative !== "string") throw new Error("Path must be a string");
  if (relative.includes("\0")) throw new Error("Path must not contain NUL");
  const normalized = path.normalize(relative).replace(/^([./\\]+)+/, "");
  const resolved = path.resolve(root, normalized);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error("Path escapes workspace root");
  }
  return resolved;
}

export async function readFile(scope: WorkspaceScope, relative: string): Promise<string> {
  const root = await ensureScopeRoot(scope);
  const target = resolveSafePath(root, relative);
  return fs.readFile(target, "utf8");
}

export async function writeFile(
  scope: WorkspaceScope,
  relative: string,
  content: string,
): Promise<{ path: string }> {
  const root = await ensureScopeRoot(scope);
  const target = resolveSafePath(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return { path: path.relative(root, target) };
}

export async function editFile(
  scope: WorkspaceScope,
  relative: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): Promise<{ replacements: number; path: string }> {
  const root = await ensureScopeRoot(scope);
  const target = resolveSafePath(root, relative);
  if (!existsSync(target)) throw new Error(`File not found: ${relative}`);
  const original = await fs.readFile(target, "utf8");
  if (oldString.length === 0) throw new Error("oldString must be non-empty");
  if (oldString === newString) throw new Error("oldString must differ from newString");
  let updated: string;
  let count: number;
  if (replaceAll) {
    const parts = original.split(oldString);
    count = parts.length - 1;
    updated = parts.join(newString);
  } else {
    const firstIndex = original.indexOf(oldString);
    if (firstIndex === -1) {
      throw new Error("oldString not found in file");
    }
    const secondIndex = original.indexOf(oldString, firstIndex + oldString.length);
    if (secondIndex !== -1) {
      throw new Error("oldString matches multiple locations; use replace_all=true or add more context");
    }
    updated = original.slice(0, firstIndex) + newString + original.slice(firstIndex + oldString.length);
    count = 1;
  }
  if (count === 0) throw new Error("oldString not found in file");
  await fs.writeFile(target, updated, "utf8");
  return { replacements: count, path: path.relative(root, target) };
}

export async function listFiles(
  scope: WorkspaceScope,
  relative: string,
): Promise<FileEntry[]> {
  const root = await ensureScopeRoot(scope);
  const target = resolveSafePath(root, relative || ".");
  const entries = await fs.readdir(target, { withFileTypes: true });
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.name === TMP_SUBDIR) continue;
    const fullPath = path.join(target, entry.name);
    const stats = await fs.stat(fullPath).catch(() => null);
    result.push({
      name: entry.name,
      path: path.relative(root, fullPath),
      type: entry.isDirectory() ? "directory" : "file",
      size: stats?.isFile() ? stats.size : null,
      modified_at: stats?.mtime.toISOString() ?? new Date().toISOString(),
    });
  }
  return result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function writeTmpScript(
  scope: WorkspaceScope,
  content: string,
): Promise<{ scriptPath: string; cwd: string }> {
  const root = await ensureScopeRoot(scope);
  const tmpDir = path.join(root, TMP_SUBDIR);
  const fileName = `script-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.py`;
  const scriptPath = path.join(tmpDir, fileName);
  await fs.writeFile(scriptPath, content, "utf8");
  return { scriptPath, cwd: root };
}

function isSafeId(value: string): boolean {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  return /^[A-Za-z0-9._-]+$/.test(value);
}
