import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { resolvePythonRuntimePaths } from "./python-runtime.js";

const STARTUP_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 250;

export type SearxngStatus =
  | { state: "stopped" }
  | { state: "starting" }
  | { state: "running"; port: number; pid: number | null }
  | { state: "failed"; error: string };

type ResolvedPaths = {
  interpreter: string;
  templateSettingsPath: string;
  effectiveSettingsPath: string;
  runtimeDir: string;
};

export class SearxngRuntime {
  private process: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private startPromise: Promise<{ port: number }> | null = null;
  private port: number | null = null;
  private statusState: SearxngStatus = { state: "stopped" };
  private readonly paths: ResolvedPaths;

  constructor(paths?: Partial<ResolvedPaths>) {
    this.paths = { ...resolveSearxngPaths(), ...(paths ?? {}) };
  }

  getStatus(): SearxngStatus {
    return this.statusState;
  }

  getPort(): number | null {
    return this.port;
  }

  async ensureRunning(): Promise<{ port: number }> {
    if (this.process && this.port !== null) {
      return { port: this.port };
    }
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._start().catch((error) => {
      this.startPromise = null;
      const message = error instanceof Error ? error.message : String(error);
      this.statusState = { state: "failed", error: message };
      throw error;
    });
    return this.startPromise;
  }

  async stop(): Promise<void> {
    const child = this.process;
    this.process = null;
    this.port = null;
    this.startPromise = null;
    this.statusState = { state: "stopped" };
    if (!child) return;
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }

  private async _start(): Promise<{ port: number }> {
    this.statusState = { state: "starting" };

    if (!existsSync(this.paths.interpreter)) {
      throw new Error(`Python interpreter not found at ${this.paths.interpreter}`);
    }
    if (!existsSync(this.paths.templateSettingsPath)) {
      throw new Error(`SearXNG settings template not found at ${this.paths.templateSettingsPath}`);
    }

    const port = await pickEphemeralPort();
    const secret = randomBytes(32).toString("hex");

    await fs.mkdir(this.paths.runtimeDir, { recursive: true });
    const template = await fs.readFile(this.paths.templateSettingsPath, "utf8");
    const effective = applySettingsOverrides(template, { port, secret });
    await fs.writeFile(this.paths.effectiveSettingsPath, effective, "utf8");

    const child = spawn(this.paths.interpreter, ["-m", "searx.webapp"], {
      cwd: this.paths.runtimeDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        SEARXNG_SETTINGS_PATH: this.paths.effectiveSettingsPath,
        SEARXNG_PORT: String(port),
        SEARXNG_BIND_ADDRESS: "127.0.0.1",
        SEARXNG_SECRET: secret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      process.stdout.write(`[searxng] ${chunk}`);
    });
    child.stderr.on("data", (chunk: string) => {
      process.stderr.write(`[searxng] ${chunk}`);
    });

    const exitWaiter = new Promise<never>((_, reject) => {
      child.once("exit", (code, signal) => {
        const reason = signal ? `signal=${signal}` : `code=${code}`;
        const error = new Error(`SearXNG exited unexpectedly (${reason})`);
        this.process = null;
        this.port = null;
        this.statusState = { state: "failed", error: error.message };
        reject(error);
      });
    });

    try {
      await Promise.race([waitForHealth(port, STARTUP_TIMEOUT_MS), exitWaiter]);
    } catch (error) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      this.process = null;
      throw error;
    }

    this.port = port;
    this.statusState = { state: "running", port, pid: child.pid ?? null };
    return { port };
  }
}

export function resolveSearxngPaths(): ResolvedPaths {
  const { interpreter } = resolvePythonRuntimePaths();
  const sidecarBase = app.isPackaged
    ? path.join(process.resourcesPath, "python-sidecar")
    : path.join(app.getAppPath(), "python-sidecar");
  const runtimeDir = path.join(app.getPath("userData"), "searxng");
  return {
    interpreter,
    templateSettingsPath: path.join(sidecarBase, "searxng-settings.yml"),
    effectiveSettingsPath: path.join(runtimeDir, "settings.yml"),
    runtimeDir,
  };
}

export function applySettingsOverrides(
  template: string,
  overrides: { port: number; secret: string },
): string {
  let next = template;
  next = next.replace(/^(\s*port:\s*).*$/m, `$1${overrides.port}`);
  next = next.replace(/^(\s*bind_address:\s*).*$/m, `$1"127.0.0.1"`);
  next = next.replace(/^(\s*secret_key:\s*).*$/m, `$1"${overrides.secret}"`);
  return next;
}

async function pickEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to acquire ephemeral port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) return;
      lastError = new Error(`healthz returned ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await sleep(HEALTH_POLL_INTERVAL_MS);
  }
  throw new Error(
    `SearXNG did not become healthy within ${timeoutMs}ms${
      lastError ? `: ${lastError.message}` : ""
    }`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
