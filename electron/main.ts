import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApplicationMenuTemplate } from "./application-menu.js";
import { PythonRuntime, resolvePythonRuntimePaths } from "./python-runtime.js";
import {
  editFile,
  ensureScopeRoot,
  listFiles,
  readFile,
  resolveScopeRoot,
  writeFile,
  writeTmpScript,
  type WorkspaceScope,
} from "./workspace-fs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererDistPath = path.join(__dirname, "../dist");
const preloadPath = path.join(__dirname, "preload.cjs");
const assetsPath = path.join(__dirname, "../assets");
const appDisplayName = "SA-Agent Desktop";

const testUserDataDir = process.env.SA_AGENT_USER_DATA_DIR;
if (testUserDataDir) {
  app.setPath("userData", testUserDataDir);
}

const pythonRuntime = new PythonRuntime(resolvePythonRuntimePaths());

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b0d10",
    title: appDisplayName,
    icon: getWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] did-fail-load: ${errorCode} ${errorDescription} url=${validatedURL}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[renderer] render-process-gone:", details);
  });
  window.webContents.on("preload-error", (_event, preloadPathArg, error) => {
    console.error(`[renderer] preload-error at ${preloadPathArg}:`, error);
  });
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const prefix = level >= 2 ? "console.error" : level === 1 ? "console.warn" : "console";
    console.log(`[renderer ${prefix}] ${sourceId}:${line} ${message}`);
  });

  if (devServerUrl) {
    console.log(`[renderer] loading dev URL ${devServerUrl}`);
    window.webContents.openDevTools({ mode: "detach" });
    void window.loadURL(devServerUrl).catch((error) => {
      console.error("[renderer] loadURL failed:", error);
    });
  } else {
    void window.loadFile(path.join(rendererDistPath, "index.html"));
  }
}

function getWindowIconPath() {
  if (process.platform === "win32") return path.join(assetsPath, "windows/icon.ico");
  if (process.platform === "darwin") return path.join(assetsPath, "macos/icon.icns");
  return path.join(assetsPath, "linux/icons/512x512.png");
}

function getAboutIconPath() {
  if (process.platform === "darwin") return path.join(assetsPath, "macos/512x512.png");
  return path.join(assetsPath, "icon.png");
}

function configureApplicationBranding() {
  app.setName(appDisplayName);
  app.setAboutPanelOptions({
    applicationName: appDisplayName,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    iconPath: getAboutIconPath(),
    copyright: "© 2026 SA-Agent",
    credits: "AI client backed by a local embedding/python runtime and the SA-Agent backend.",
  });

  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(path.join(assetsPath, "macos/512x512.png"));
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
}

function installApplicationMenu() {
  const template = buildApplicationMenuTemplate(appDisplayName, process.platform, () => {
    app.showAboutPanel();
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseScope(payload: unknown): WorkspaceScope {
  if (!isRecord(payload)) throw new Error("Invalid workspace scope");
  if (payload.kind === "project" && typeof payload.projectId === "string") {
    return { kind: "project", projectId: payload.projectId };
  }
  if (payload.kind === "global" && typeof payload.sessionId === "string") {
    return { kind: "global", sessionId: payload.sessionId };
  }
  throw new Error("Invalid workspace scope");
}

function ipcResult<T>(handler: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  return handler()
    .then((value) => ({ ok: true as const, value }))
    .catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
}

app.whenReady().then(async () => {
  configureApplicationBranding();
  installApplicationMenu();

  ipcMain.handle("sa-agent:python-status", () => pythonRuntime.getStatus());

  ipcMain.handle("sa-agent:python-start", () =>
    ipcResult(async () => {
      await pythonRuntime.start();
      return pythonRuntime.getStatus();
    }),
  );

  ipcMain.handle("sa-agent:python-embed-query", (_event, text: unknown) =>
    ipcResult(async () => {
      if (typeof text !== "string") throw new Error("text must be a string");
      const result = (await pythonRuntime.call("embed_query", { text })) as { embedding: number[] };
      return result.embedding;
    }),
  );

  ipcMain.handle("sa-agent:python-embed-passage", (_event, text: unknown) =>
    ipcResult(async () => {
      if (typeof text !== "string") throw new Error("text must be a string");
      const result = (await pythonRuntime.call("embed_passage", { text })) as { embedding: number[] };
      return result.embedding;
    }),
  );

  ipcMain.handle(
    "sa-agent:python-run",
    (_event, scopePayload: unknown, code: unknown, timeoutMs: unknown, stdin: unknown) =>
      ipcResult(async () => {
        const scope = parseScope(scopePayload);
        if (typeof code !== "string") throw new Error("code must be a string");
        const { scriptPath, cwd } = await writeTmpScript(scope, code);
        const params = {
          script_path: scriptPath,
          cwd,
          timeout_ms: typeof timeoutMs === "number" && Number.isFinite(timeoutMs) ? timeoutMs : 30_000,
          stdin: typeof stdin === "string" ? stdin : "",
        };
        const result = (await pythonRuntime.call("run_python", params)) as {
          stdout: string;
          stderr: string;
          exit_code: number;
          duration_ms: number;
          timed_out: boolean;
          script_path: string;
        };
        return result;
      }),
  );

  ipcMain.handle("sa-agent:fs-read", (_event, scopePayload: unknown, relative: unknown) =>
    ipcResult(async () => {
      const scope = parseScope(scopePayload);
      if (typeof relative !== "string") throw new Error("path must be a string");
      return readFile(scope, relative);
    }),
  );

  ipcMain.handle(
    "sa-agent:fs-write",
    (_event, scopePayload: unknown, relative: unknown, content: unknown) =>
      ipcResult(async () => {
        const scope = parseScope(scopePayload);
        if (typeof relative !== "string") throw new Error("path must be a string");
        if (typeof content !== "string") throw new Error("content must be a string");
        return writeFile(scope, relative, content);
      }),
  );

  ipcMain.handle(
    "sa-agent:fs-edit",
    (
      _event,
      scopePayload: unknown,
      relative: unknown,
      oldString: unknown,
      newString: unknown,
      replaceAll: unknown,
    ) =>
      ipcResult(async () => {
        const scope = parseScope(scopePayload);
        if (typeof relative !== "string") throw new Error("path must be a string");
        if (typeof oldString !== "string") throw new Error("old_string must be a string");
        if (typeof newString !== "string") throw new Error("new_string must be a string");
        return editFile(scope, relative, oldString, newString, replaceAll === true);
      }),
  );

  ipcMain.handle("sa-agent:fs-list", (_event, scopePayload: unknown, relative: unknown) =>
    ipcResult(async () => {
      const scope = parseScope(scopePayload);
      if (relative !== undefined && typeof relative !== "string") {
        throw new Error("path must be a string");
      }
      return listFiles(scope, typeof relative === "string" ? relative : ".");
    }),
  );

  ipcMain.handle("sa-agent:fs-open-folder", (_event, scopePayload: unknown) =>
    ipcResult(async () => {
      const scope = parseScope(scopePayload);
      const root = await ensureScopeRoot(scope);
      const error = await shell.openPath(root);
      if (error) throw new Error(error);
      return { path: root };
    }),
  );

  ipcMain.handle("sa-agent:fs-scope-root", (_event, scopePayload: unknown) =>
    ipcResult(async () => {
      const scope = parseScope(scopePayload);
      return resolveScopeRoot(scope);
    }),
  );

  ipcMain.handle("sa-agent:fs-open-workspace-root", (_event, kindPayload: unknown) =>
    ipcResult(async () => {
      const kind = kindPayload === "projects" ? "projects" : "global";
      const root = path.join(app.getPath("userData"), kind);
      await fs.mkdir(root, { recursive: true });
      const error = await shell.openPath(root);
      if (error) throw new Error(error);
      return { path: root };
    }),
  );

  ipcMain.handle("sa-agent:fs-open-project-root", (_event, projectIdPayload: unknown) =>
    ipcResult(async () => {
      if (typeof projectIdPayload !== "string") throw new Error("projectId must be a string");
      const scope = parseScope({ kind: "project", projectId: projectIdPayload });
      const root = await ensureScopeRoot(scope);
      const error = await shell.openPath(root);
      if (error) throw new Error(error);
      return { path: root };
    }),
  );

  pythonRuntime.start().catch((error) => {
    console.error("[python-runtime] failed to start:", error);
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await pythonRuntime.stop().catch(() => undefined);
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await pythonRuntime.stop().catch(() => undefined);
});
