import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

export type WorkspaceScope =
  | { kind: "project"; projectId: string; displayName: string }
  | { kind: "global"; sessionId: string; displayName: string };

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
  modified_at: string;
};

const TMP_SUBDIR = ".tmp";
const ID_SUFFIX_LENGTH = 8;
const FOLDER_NAME_LIMIT = 80;
const ID_SEPARATOR = "__";

// Virtual namespaces exposed via path prefixes so an agent can read across
// scopes. Writes always go to the primary scope; reads can target any
// `global/<folder>/...` (any session) and, for project scopes, only its
// own `projects/<folder>/...`. Global scopes can also read every project.
const NS_GLOBAL = "global";
const NS_PROJECTS = "projects";
const FOREIGN_NAMESPACES = [NS_GLOBAL, NS_PROJECTS] as const;
type Namespace = (typeof FOREIGN_NAMESPACES)[number];

type ResolvedPath =
  | { kind: "primary"; absolute: string; primaryRoot: string }
  | {
      kind: "namespace_root";
      namespace: Namespace;
      absolute: string;
    }
  | {
      kind: "foreign_folder";
      namespace: Namespace;
      folder: string;
      absolute: string;
      foreignRoot: string;
    };

type ScopeParts = {
  parent: string;
  id: string;
  displayName: string;
};

function isSharedGlobalScope(scope: WorkspaceScope): boolean {
  return scope.kind === "global";
}

function getScopeParts(scope: WorkspaceScope): ScopeParts {
  const userData = app.getPath("userData");
  if (scope.kind === "project") {
    if (!isSafeId(scope.projectId)) throw new Error("Invalid project id");
    return {
      parent: path.join(userData, "projects"),
      id: scope.projectId,
      displayName: scope.displayName ?? scope.projectId,
    };
  }
  if (!isSafeId(scope.sessionId)) throw new Error("Invalid session id");
  return {
    parent: path.join(userData, "global"),
    id: scope.sessionId,
    displayName: scope.displayName ?? scope.sessionId,
  };
}

function shortId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9]/g, "");
  return cleaned.slice(0, ID_SUFFIX_LENGTH) || "id";
}

/**
 * Filesystem-safe representation of a display name. We keep it broad enough to
 * survive most natural-language session names (incl. cyrillic) while
 * sanitizing anything that would break on Windows or shells:
 *   <>:"/\|?*    + control codes + reserved trailing dots/spaces
 */
function sanitizeName(value: string): string {
  const collapsed = value
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const limited = collapsed.slice(0, FOLDER_NAME_LIMIT).trim();
  return limited.length > 0 ? limited : "untitled";
}

function buildFolderName(parts: ScopeParts): string {
  return `${sanitizeName(parts.displayName)}${ID_SEPARATOR}${shortId(parts.id)}`;
}

export function resolveScopeRoot(scope: WorkspaceScope): string {
  const parts = getScopeParts(scope);
  if (isSharedGlobalScope(scope)) return parts.parent;
  return path.join(parts.parent, buildFolderName(parts));
}

async function findExistingFolderForId(parts: ScopeParts): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(parts.parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const expectedSuffix = `${ID_SEPARATOR}${shortId(parts.id)}`;
  // Match anything ending with our id suffix — covers folders renamed
  // out-of-band, plus legacy folders that were named exactly by id
  // (when id length equals ID_SUFFIX_LENGTH).
  for (const entry of entries) {
    if (entry.endsWith(expectedSuffix)) {
      return path.join(parts.parent, entry);
    }
  }
  // Legacy: folder was named exactly the full id (older versions of the app).
  const legacyExact = path.join(parts.parent, parts.id);
  if (entries.includes(parts.id)) return legacyExact;
  return null;
}

export async function ensureScopeRoot(scope: WorkspaceScope): Promise<string> {
  const parts = getScopeParts(scope);
  if (isSharedGlobalScope(scope)) {
    await fs.mkdir(parts.parent, { recursive: true });
    await fs.mkdir(path.join(parts.parent, TMP_SUBDIR), { recursive: true });
    return parts.parent;
  }
  const desired = path.join(parts.parent, buildFolderName(parts));
  await fs.mkdir(parts.parent, { recursive: true });

  if (!existsSync(desired)) {
    const existing = await findExistingFolderForId(parts);
    if (existing && existing !== desired) {
      try {
        await fs.rename(existing, desired);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
      }
    }
  }

  await fs.mkdir(desired, { recursive: true });
  await fs.mkdir(path.join(desired, TMP_SUBDIR), { recursive: true });
  return desired;
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

function parseNamespacePrefix(relative: string): { namespace: Namespace; rest: string } | null {
  for (const ns of FOREIGN_NAMESPACES) {
    if (relative === ns) return { namespace: ns, rest: "" };
    if (relative.startsWith(`${ns}/`) || relative.startsWith(`${ns}\\`)) {
      return { namespace: ns, rest: relative.slice(ns.length + 1) };
    }
  }
  return null;
}

function ownFolderName(scope: WorkspaceScope): string {
  return buildFolderName(getScopeParts(scope));
}

function isSafeFolderSegment(value: string): boolean {
  return value.length > 0 && value !== "." && value !== "..";
}

function canReadForeignFolder(scope: WorkspaceScope, namespace: Namespace, folder: string): boolean {
  if (scope.kind === "global") return true;
  // project scope: any global session is readable; only own project is.
  if (namespace === NS_GLOBAL) return true;
  return folder === ownFolderName(scope);
}

async function resolveRequestedPath(
  scope: WorkspaceScope,
  relative: string,
): Promise<ResolvedPath> {
  if (typeof relative !== "string") throw new Error("Path must be a string");
  if (relative.includes("\0")) throw new Error("Path must not contain NUL");
  const stripped = relative.replace(/^([./\\]+)+/, "");
  const namespaced = parseNamespacePrefix(stripped);
  if (!namespaced) {
    const root = await ensureScopeRoot(scope);
    return { kind: "primary", absolute: resolveSafePath(root, relative), primaryRoot: root };
  }
  const userData = app.getPath("userData");
  const namespaceRoot = path.join(userData, namespaced.namespace);
  if (namespaced.rest.length === 0) {
    return { kind: "namespace_root", namespace: namespaced.namespace, absolute: namespaceRoot };
  }
  const [folder, ...remaining] = namespaced.rest.split(/[\\/]+/).filter(Boolean);
  if (!folder) {
    return { kind: "namespace_root", namespace: namespaced.namespace, absolute: namespaceRoot };
  }
  if (!isSafeFolderSegment(folder)) throw new Error("Invalid namespace folder");
  if (!canReadForeignFolder(scope, namespaced.namespace, folder)) {
    throw new Error(
      `Access denied: ${namespaced.namespace}/${folder} is outside this session's scope`,
    );
  }
  const foreignRoot = path.join(namespaceRoot, folder);
  const tail = remaining.join("/");
  const absolute = tail.length > 0 ? resolveSafePath(foreignRoot, tail) : foreignRoot;
  return {
    kind: "foreign_folder",
    namespace: namespaced.namespace,
    folder,
    absolute,
    foreignRoot,
  };
}

function relativeFromRoot(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function relativeFromUserData(absolute: string): string {
  const userData = app.getPath("userData");
  return relativeFromRoot(userData, absolute);
}

function assertPrimaryWritePath(relative: string): void {
  const stripped = relative.replace(/^([./\\]+)+/, "");
  if (parseNamespacePrefix(stripped)) {
    throw new Error("Namespace paths are read-only; write to the current workspace instead");
  }
}

export async function readFile(scope: WorkspaceScope, relative: string): Promise<string> {
  const resolved = await resolveRequestedPath(scope, relative);
  if (resolved.kind === "namespace_root") {
    throw new Error(`Cannot read namespace root as a file: ${resolved.namespace}`);
  }
  return fs.readFile(resolved.absolute, "utf8");
}

export async function writeFile(
  scope: WorkspaceScope,
  relative: string,
  content: string,
): Promise<{ path: string }> {
  assertPrimaryWritePath(relative);
  const root = await ensureScopeRoot(scope);
  const target = resolveSafePath(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return { path: path.relative(root, target) };
}

export async function writeBinaryFile(
  scope: WorkspaceScope,
  relative: string,
  base64: string,
): Promise<{ path: string }> {
  assertPrimaryWritePath(relative);
  const root = await ensureScopeRoot(scope);
  const target = resolveSafePath(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(base64, "base64"));
  return { path: path.relative(root, target) };
}

export async function editFile(
  scope: WorkspaceScope,
  relative: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): Promise<{ replacements: number; path: string }> {
  assertPrimaryWritePath(relative);
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
  const resolved = await resolveRequestedPath(scope, relative || ".");
  const target = resolved.absolute;
  if (resolved.kind === "namespace_root") {
    await fs.mkdir(target, { recursive: true });
  }
  const entries = await fs.readdir(target, { withFileTypes: true });
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.name === TMP_SUBDIR) continue;
    if (
      resolved.kind === "namespace_root" &&
      !canReadForeignFolder(scope, resolved.namespace, entry.name)
    ) {
      continue;
    }
    const fullPath = path.join(target, entry.name);
    const stats = await fs.stat(fullPath).catch(() => null);
    const entryPath =
      resolved.kind === "primary"
        ? relativeFromRoot(resolved.primaryRoot, fullPath)
        : relativeFromUserData(fullPath);
    result.push({
      name: entry.name,
      path: entryPath,
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
