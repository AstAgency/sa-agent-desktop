import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererDistPath = path.join(__dirname, "../dist");
const preloadPath = path.join(__dirname, "preload.cjs");
const testUserDataDir = process.env.SA_AGENT_USER_DATA_DIR;

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

app.whenReady().then(() => {
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
