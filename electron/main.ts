import { app, BrowserWindow, Menu, ipcMain, nativeImage, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApplicationMenuTemplate } from "./application-menu.js";
import { McpRuntimeManager } from "./mcp-manager.js";
import type { AgentMcpServerConfig } from "./mcp-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererDistPath = path.join(__dirname, "../dist");
const preloadPath = path.join(__dirname, "preload.cjs");
const assetsPath = path.join(__dirname, "../assets");
const testUserDataDir = process.env.SA_AGENT_USER_DATA_DIR;
const mcpRuntimeManager = new McpRuntimeManager();
const appDisplayName = "SA-Agent Desktop";

if (testUserDataDir) {
  app.setPath("userData", testUserDataDir);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f5efe3",
    title: appDisplayName,
    icon: getWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    return;
  }

  void window.loadFile(path.join(rendererDistPath, "index.html"));
}

function getWindowIconPath() {
  if (process.platform === "win32") {
    return path.join(assetsPath, "windows/icon.ico");
  }

  if (process.platform === "darwin") {
    return path.join(assetsPath, "macos/icon.icns");
  }

  return path.join(assetsPath, "linux/icons/512x512.png");
}

function getAboutIconPath() {
  if (process.platform === "darwin") {
    return path.join(assetsPath, "macos/512x512.png");
  }

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
    credits:
      "AI collaboration workstation for project orchestration, agent supervision, artifacts, tasks, and runtime control.",
  });

  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(path.join(assetsPath, "macos/512x512.png"));

    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }
}

function installApplicationMenu() {
  const template = buildApplicationMenuTemplate(appDisplayName, process.platform, () => {
    app.showAboutPanel();
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getAgentFilesRootPath() {
  return path.join(app.getPath("userData"), "agent-files");
}

function resolveArtifactTargetPath(rootPath: string, relativePath: string) {
  const normalizedPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolvedPath = path.resolve(rootPath, normalizedPath);
  const rootPathWithSeparator = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;

  if (resolvedPath !== rootPath && !resolvedPath.startsWith(rootPathWithSeparator)) {
    throw new Error("Artifact path escapes the agent files directory.");
  }

  return resolvedPath;
}

app.whenReady().then(() => {
  configureApplicationBranding();
  installApplicationMenu();

  ipcMain.handle("sa-agent:open-devtools", () => {
    try {
      const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

      if (!targetWindow) {
        return {
          ok: false,
          error: "No BrowserWindow available for DevTools.",
        };
      }

      targetWindow.focus();
      targetWindow.webContents.openDevTools({ mode: "right", activate: true });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to open DevTools.",
      };
    }
  });

  ipcMain.handle("sa-agent:write-agent-files", async (_event, files: unknown) => {
    try {
      if (!Array.isArray(files)) {
        throw new Error("Invalid agent files payload.");
      }

      const rootPath = getAgentFilesRootPath();
      await fs.mkdir(rootPath, { recursive: true });

      for (const file of files) {
        if (
          !file ||
          typeof file !== "object" ||
          typeof (file as { relativePath?: unknown }).relativePath !== "string" ||
          typeof (file as { content?: unknown }).content !== "string"
        ) {
          throw new Error("Invalid agent file entry.");
        }

        const targetPath = resolveArtifactTargetPath(
          rootPath,
          (file as { relativePath: string }).relativePath,
        );

        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, (file as { content: string }).content, "utf8");
      }

      return {
        ok: true,
        rootPath,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to write agent files.",
      };
    }
  });

  ipcMain.handle("sa-agent:open-agent-files-folder", async () => {
    try {
      const rootPath = getAgentFilesRootPath();
      await fs.mkdir(rootPath, { recursive: true });
      const errorMessage = await shell.openPath(rootPath);

      if (errorMessage) {
        return {
          ok: false,
          rootPath,
          error: errorMessage,
        };
      }

      return {
        ok: true,
        rootPath,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to open agent files folder.",
      };
    }
  });

  ipcMain.handle("sa-agent:mcp-list-tools", async (_event, runtimeId: unknown, servers: unknown) => {
    try {
      if (typeof runtimeId !== "string" || !isMcpServerRecord(servers)) {
        throw new Error("Invalid MCP list tools payload.");
      }

      const tools = await mcpRuntimeManager.listTools(runtimeId, servers);
      return {
        ok: true,
        tools,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to list MCP tools.",
        tools: [],
      };
    }
  });

  ipcMain.handle(
    "sa-agent:mcp-call-tool",
    async (_event, runtimeId: unknown, serverName: unknown, toolName: unknown, argumentsJson: unknown) => {
      try {
        if (
          typeof runtimeId !== "string" ||
          typeof serverName !== "string" ||
          typeof toolName !== "string" ||
          !isRecord(argumentsJson)
        ) {
          throw new Error("Invalid MCP call tool payload.");
        }

        const result = await mcpRuntimeManager.callTool(
          runtimeId,
          serverName,
          toolName,
          argumentsJson,
        );
        return {
          ok: true,
          result,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to call MCP tool.",
        };
      }
    },
  );

  ipcMain.handle("sa-agent:mcp-close-runtime", async (_event, runtimeId: unknown) => {
    try {
      if (typeof runtimeId !== "string") {
        throw new Error("Invalid MCP runtime id.");
      }

      await mcpRuntimeManager.closeRuntime(runtimeId);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to close MCP runtime.",
      };
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMcpServerRecord(value: unknown): value is Record<string, AgentMcpServerConfig> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isRecord(entry));
}
