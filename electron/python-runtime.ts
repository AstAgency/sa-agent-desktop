import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type PythonResponse = {
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
  trace?: string;
  event?: string;
};

const STARTUP_TIMEOUT_MS = 60_000;

export type PythonRuntimePaths = {
  interpreter: string;
  serverScript: string;
  hfCacheDir: string;
  runtimeRoot: string;
};

export type PythonRuntimeStatus = {
  ready: boolean;
  model_id: string | null;
  dimensions: number | null;
  error: string | null;
};

export class PythonRuntime {
  private process: ChildProcessWithoutNullStreams | null = null;
  private readyPromise: Promise<void> | null = null;
  private stdoutBuffer = "";
  private nextRequestId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private status: PythonRuntimeStatus = {
    ready: false,
    model_id: null,
    dimensions: null,
    error: null,
  };

  constructor(private readonly paths: PythonRuntimePaths) {}

  getStatus(): PythonRuntimeStatus {
    return { ...this.status };
  }

  async start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this._start();
    try {
      await this.readyPromise;
    } catch (error) {
      this.readyPromise = null;
      throw error;
    }
  }

  private async _start(): Promise<void> {
    if (!existsSync(this.paths.interpreter)) {
      const error = new Error(`Python interpreter not found at ${this.paths.interpreter}`);
      this.status = { ready: false, model_id: null, dimensions: null, error: error.message };
      throw error;
    }
    if (!existsSync(this.paths.serverScript)) {
      const error = new Error(`Python sidecar script not found at ${this.paths.serverScript}`);
      this.status = { ready: false, model_id: null, dimensions: null, error: error.message };
      throw error;
    }

    const child = spawn(this.paths.interpreter, [this.paths.serverScript], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        SA_AGENT_HF_CACHE: this.paths.hfCacheDir,
        HF_HOME: this.paths.hfCacheDir,
        HUGGINGFACE_HUB_CACHE: this.paths.hfCacheDir,
        TRANSFORMERS_OFFLINE: "1",
        HF_HUB_OFFLINE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    const readyPromise = new Promise<void>((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => {
        rejectReady(new Error("Python sidecar did not signal readiness in time"));
      }, STARTUP_TIMEOUT_MS);

      const onLine = (line: string) => {
        const parsed = this.parseLine(line);
        if (!parsed) return;
        if (parsed.event === "ready") {
          clearTimeout(timeout);
          this.status = { ready: true, model_id: null, dimensions: null, error: null };
          resolveReady();
          return;
        }
        this.dispatchResponse(parsed);
      };

      child.stdout.on("data", (chunk: string) => {
        this.stdoutBuffer += chunk;
        let newlineIndex;
        while ((newlineIndex = this.stdoutBuffer.indexOf("\n")) !== -1) {
          const line = this.stdoutBuffer.slice(0, newlineIndex);
          this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
          if (line.trim().length > 0) onLine(line);
        }
      });

      child.stderr.on("data", (chunk: string) => {
        process.stderr.write(`[python-sidecar] ${chunk}`);
      });

      child.on("exit", (code) => {
        const error = new Error(`Python sidecar exited unexpectedly (code=${code})`);
        clearTimeout(timeout);
        this.status = {
          ready: false,
          model_id: null,
          dimensions: null,
          error: error.message,
        };
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        this.process = null;
        this.readyPromise = null;
        rejectReady(error);
      });
    });

    await readyPromise;

    const info = (await this.call("model_info", {})) as { model_id: string; dimensions: number };
    this.status = { ready: true, model_id: info.model_id, dimensions: info.dimensions, error: null };
  }

  async call(command: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.process) {
      await this.start();
    }
    const child = this.process;
    if (!child) throw new Error("Python runtime not running");
    const id = String(this.nextRequestId++);
    const payload = JSON.stringify({ id, command, params });
    return new Promise((resolveCall, rejectCall) => {
      this.pending.set(id, { resolve: resolveCall as (value: unknown) => void, reject: rejectCall });
      child.stdin.write(`${payload}\n`, "utf8", (error) => {
        if (error) {
          this.pending.delete(id);
          rejectCall(error);
        }
      });
    });
  }

  async stop(): Promise<void> {
    const child = this.process;
    if (!child) return;
    this.process = null;
    this.readyPromise = null;
    try {
      child.stdin.end();
    } catch {
      // ignore
    }
    child.kill();
  }

  private dispatchResponse(response: PythonResponse) {
    if (!response.id) return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.ok === false) {
      pending.reject(new Error(response.error ?? "Python sidecar error"));
      return;
    }
    pending.resolve(response.result);
  }

  private parseLine(line: string): PythonResponse | null {
    try {
      return JSON.parse(line) as PythonResponse;
    } catch {
      process.stderr.write(`[python-sidecar] non-JSON line: ${line}\n`);
      return null;
    }
  }
}

export function resolvePythonRuntimePaths(): PythonRuntimePaths {
  const platformKey = resolvePlatformKey();
  const runtimeRoot = resolveRuntimeRoot(platformKey);
  const venvRoot = path.join(runtimeRoot, "venv");
  const interpreter =
    process.platform === "win32"
      ? path.join(venvRoot, "Scripts", "python.exe")
      : path.join(venvRoot, "bin", "python3");
  const serverScript = resolveSidecarScript();
  const hfCacheDir = path.join(runtimeRoot, "hf-cache");
  return { interpreter, serverScript, hfCacheDir, runtimeRoot };
}

function resolveRuntimeRoot(platformKey: string): string {
  const resourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, "python-runtime", platformKey)
    : path.join(app.getAppPath(), "resources", "python-runtime", platformKey);
  return resourcesPath;
}

function resolveSidecarScript(): string {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "python-sidecar")
    : path.join(app.getAppPath(), "python-sidecar");
  return path.join(base, "server.py");
}

function resolvePlatformKey(): string {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "win32" && arch === "x64") return "win32-x64";
  throw new Error(`unsupported platform: ${platform}-${arch}`);
}
