import { app, protocol } from "electron";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Custom scheme used to serve the renderer bundle from a local cache directory.
// Loading via `app://renderer/index.html` (instead of `file://.../dist`) lets us
// swap the served bundle at runtime for over-the-air updates while keeping the
// same `contextIsolation` security model as a normal app origin.
export const RENDERER_SCHEME = "app";
export const RENDERER_HOST = "renderer";
export const RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`;
export const RENDERER_ENTRY_URL = `${RENDERER_ORIGIN}/index.html`;

// Directory shipped inside the app bundle. Used as the baseline that the app
// always falls back to (first run, or if a cached update is ever missing).
let bundledRendererDir = "";

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

function rendererStateDir(): string {
  return path.join(app.getPath("userData"), "renderer");
}

function rendererStateFile(): string {
  return path.join(rendererStateDir(), "state.json");
}

type RendererState = { current: string; version?: string };

async function readState(): Promise<RendererState | null> {
  try {
    const raw = await fs.readFile(rendererStateFile(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && typeof (parsed as RendererState).current === "string") {
      return parsed as RendererState;
    }
  } catch {
    // No state yet, or unreadable — fall back to the bundled baseline.
  }
  return null;
}

// Resolve the directory whose contents are currently served to the renderer.
// An applied OTA update records an absolute path under `<userData>/renderer/`;
// otherwise we serve the bundle shipped with the app.
export async function getCurrentRendererDir(): Promise<string> {
  const state = await readState();
  if (state) {
    try {
      const stat = await fs.stat(state.current);
      if (stat.isDirectory()) return state.current;
    } catch {
      // Recorded version is gone — fall through to the baseline.
    }
  }
  return bundledRendererDir;
}

// Must be called before `app.whenReady()`.
export function registerRendererSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: RENDERER_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

// Must be called after `app.whenReady()`. `bundledDir` is the renderer build
// shipped inside the app (e.g. `<resources>/dist`).
export function registerRendererProtocol(bundledDir: string): void {
  bundledRendererDir = bundledDir;

  protocol.handle(RENDERER_SCHEME, async (request) => {
    const url = new URL(request.url);
    let relative = decodeURIComponent(url.pathname);
    if (relative === "" || relative === "/") relative = "/index.html";

    const dir = await getCurrentRendererDir();
    const resolvedDir = path.resolve(dir);
    const filePath = path.resolve(path.join(resolvedDir, relative));

    // Path-escape guard: never serve anything outside the served directory.
    if (filePath !== resolvedDir && !filePath.startsWith(resolvedDir + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const data = await fs.readFile(filePath);
      const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      return new Response(data, { status: 200, headers: { "content-type": mime } });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });
}

// Version of the bundle currently served. A cached OTA update records its own
// version; otherwise this is the version baked into the shipped app.
export async function getInstalledRendererVersion(): Promise<string> {
  const state = await readState();
  return state?.version ?? app.getVersion();
}

export type RendererUpdateFile = { path: string; base64: string; hash: string };
export type RendererUpdatePayload = { version: string; files: RendererUpdateFile[] };

function safeJoin(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(path.join(resolvedRoot, relative.replace(/^[/\\]+/, "")));
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Unsafe path in update payload: ${relative}`);
  }
  return target;
}

// Verify, stage and atomically activate a renderer bundle downloaded by the
// renderer. Bytes arrive base64-encoded over IPC; each file's sha256 is checked
// against the manifest before anything is written into the active location.
export async function applyRendererUpdate(
  payload: RendererUpdatePayload,
): Promise<{ version: string }> {
  if (!payload || typeof payload.version !== "string" || payload.version.length === 0) {
    throw new Error("Update payload is missing a version");
  }
  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    throw new Error("Update payload contains no files");
  }

  const versionsRoot = path.join(rendererStateDir(), "versions");
  const finalDir = path.join(versionsRoot, payload.version);
  const stagingDir = path.join(versionsRoot, `.staging-${payload.version}-${Date.now()}`);

  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(stagingDir, { recursive: true });

  try {
    let sawEntry = false;
    for (const file of payload.files) {
      if (
        !file ||
        typeof file.path !== "string" ||
        typeof file.base64 !== "string" ||
        typeof file.hash !== "string"
      ) {
        throw new Error("Malformed file entry in update payload");
      }
      const data = Buffer.from(file.base64, "base64");
      const actual = crypto.createHash("sha256").update(data).digest("hex");
      if (actual !== file.hash.toLowerCase()) {
        throw new Error(`Hash mismatch for ${file.path}`);
      }
      const target = safeJoin(stagingDir, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
      if (file.path === "index.html") sawEntry = true;
    }
    if (!sawEntry) throw new Error("Update payload is missing index.html");

    // Activate: replace any existing copy of this version, then point state at it.
    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.rename(stagingDir, finalDir);

    await fs.mkdir(rendererStateDir(), { recursive: true });
    const nextState: RendererState = { current: finalDir, version: payload.version };
    const tmpStateFile = `${rendererStateFile()}.tmp`;
    await fs.writeFile(tmpStateFile, JSON.stringify(nextState));
    await fs.rename(tmpStateFile, rendererStateFile());

    return { version: payload.version };
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
}
