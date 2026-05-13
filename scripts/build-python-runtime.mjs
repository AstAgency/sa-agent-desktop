#!/usr/bin/env node
// Builds the bundled python runtime for the current platform.
// Output: resources/python-runtime/<platform>/{python,venv,hf-cache}
//
// Steps:
//   1) Download python-build-standalone tarball for current platform/arch.
//   2) Extract it under resources/python-runtime/<platform>/python.
//   3) Create a venv at resources/python-runtime/<platform>/venv that uses
//      the bundled interpreter.
//   4) pip install python-sidecar/requirements.txt into that venv.
//   5) pip install python-sidecar/searxng-requirements.txt into that venv
//      (SearXNG metasearch bundled for the web_search tool).
//   6) Pre-download the intfloat/multilingual-e5-large model weights into
//      resources/python-runtime/<platform>/hf-cache so first run is offline.
//
// The script is idempotent for a given target: if the runtime already exists
// and ``SA_AGENT_REBUILD_PYTHON=1`` is not set, it does nothing.

import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

// python-build-standalone release pinned via env or default below.
const PBS_TAG = process.env.SA_AGENT_PBS_TAG ?? "20240909";
const PBS_PYTHON_VERSION = process.env.SA_AGENT_PYTHON_VERSION ?? "3.11.10";

const platformKey = resolvePlatformKey();
const runtimeRoot = join(projectRoot, "resources", "python-runtime", platformKey);
const pythonRoot = join(runtimeRoot, "python");
const venvRoot = join(runtimeRoot, "venv");
const hfCacheRoot = join(runtimeRoot, "hf-cache");

if (existsSync(venvRoot) && existsSync(hfCacheRoot) && process.env.SA_AGENT_REBUILD_PYTHON !== "1") {
  console.log(`python runtime already exists at ${runtimeRoot}, skipping (set SA_AGENT_REBUILD_PYTHON=1 to force).`);
  process.exit(0);
}

mkdirSync(runtimeRoot, { recursive: true });

const tarballUrl = buildTarballUrl();
const tarballPath = join(runtimeRoot, "python-build-standalone.tar.gz");

console.log(`[python-runtime] downloading ${tarballUrl}`);
await download(tarballUrl, tarballPath);

console.log(`[python-runtime] extracting interpreter`);
if (existsSync(pythonRoot)) rmSync(pythonRoot, { recursive: true, force: true });
mkdirSync(pythonRoot, { recursive: true });
execFileSync("tar", ["-xzf", tarballPath, "--strip-components=1", "-C", pythonRoot], { stdio: "inherit" });
rmSync(tarballPath);

const interpreter = resolveInterpreterPath(pythonRoot);
if (!existsSync(interpreter)) {
  throw new Error(`bundled interpreter not found at ${interpreter}`);
}

console.log(`[python-runtime] creating venv at ${venvRoot}`);
if (existsSync(venvRoot)) rmSync(venvRoot, { recursive: true, force: true });
execFileSync(interpreter, ["-m", "venv", venvRoot], { stdio: "inherit" });

const venvPython = resolveInterpreterPath(venvRoot);
if (!existsSync(venvPython)) {
  throw new Error(`venv interpreter not found at ${venvPython}`);
}

console.log(`[python-runtime] upgrading pip`);
execFileSync(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools"], { stdio: "inherit" });

console.log(`[python-runtime] installing requirements`);
execFileSync(
  venvPython,
  ["-m", "pip", "install", "-r", join(projectRoot, "python-sidecar", "requirements.txt")],
  { stdio: "inherit" },
);

console.log(`[python-runtime] installing searxng`);
execFileSync(
  venvPython,
  ["-m", "pip", "install", "-r", join(projectRoot, "python-sidecar", "searxng-requirements.txt")],
  { stdio: "inherit" },
);

console.log(`[python-runtime] pre-downloading model weights`);
mkdirSync(hfCacheRoot, { recursive: true });
execFileSync(
  venvPython,
  [
    "-c",
    [
      "import os",
      "from sentence_transformers import SentenceTransformer",
      `SentenceTransformer('intfloat/multilingual-e5-large', cache_folder=os.environ['HF_HOME'])`,
    ].join("\n"),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, HF_HOME: hfCacheRoot, HUGGINGFACE_HUB_CACHE: hfCacheRoot },
  },
);

console.log(`[python-runtime] done. runtime at ${runtimeRoot}`);

// ---------------------------------------------------------------------------
function resolvePlatformKey() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "win32" && arch === "x64") return "win32-x64";
  throw new Error(`unsupported platform: ${platform}-${arch}`);
}

function buildTarballUrl() {
  const triple = {
    "linux-x64": "x86_64-unknown-linux-gnu-install_only",
    "darwin-arm64": "aarch64-apple-darwin-install_only",
    "darwin-x64": "x86_64-apple-darwin-install_only",
    "win32-x64": "x86_64-pc-windows-msvc-shared-install_only",
  }[platformKey];
  return `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/cpython-${PBS_PYTHON_VERSION}+${PBS_TAG}-${triple}.tar.gz`;
}

function resolveInterpreterPath(root) {
  if (process.platform === "win32") return join(root, "python.exe");
  return join(root, "bin", "python3");
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

// Avoid noisy unused warnings from imports we keep for clarity.
void readFileSync;
