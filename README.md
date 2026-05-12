# sa-agent-desktop

Desktop client for SA-Agent. Implements the contract from
`sa-agent-backend/CLIENT_USAGE_SCENARIO.md`:

- Backend is a deterministic store. All agent orchestration is local.
- Embeddings are produced locally using the bundled Python runtime and the
  `intfloat/multilingual-e5-large` model.
- Conversational loop is deterministic: save user message → embed → semantic
  search of summaries → build prompt → stream `/v1/chat/completions` →
  save assistant message → maybe summarize.
- Agent loop and tool execution go through `@earendil-works/pi-agent-core`.
  Built-in tools: `read_file`, `write_file`, `edit_file`, `list_files`,
  `run_python` (executes via the bundled venv inside a per-scope `.tmp` dir).

## Requirements

- Node.js 22+
- npm 11+
- For the python runtime build: working `tar` and internet access on first
  `npm run python:build`. After build everything works offline.

## Layout

```
electron/                main process (window, IPC, python runtime, FS sandbox)
python-sidecar/          long-running python process (embeddings + run_python)
resources/python-runtime/<platform>/
  python/                bundled python-build-standalone interpreter
  venv/                  pre-built venv with sentence-transformers + torch (cpu)
  hf-cache/              pre-downloaded model weights for offline use
scripts/build-python-runtime.mjs   builds the runtime above for current platform
src/renderer/            React/Vite renderer (state, API client, agent runtime, UI)
```

## Workspace directories

Workspace files are kept in the OS userData directory:

- `<userData>/projects/<projectId>/` — files visible to every session in that project.
- `<userData>/global/<sessionId>/` — files for a global (project-less) session.

Each scope has a `.tmp/` subdirectory where the `run_python` tool writes
generated scripts before executing them through the bundled venv. The agent's
FS tools cannot escape the chosen scope.

## Scripts

- `npm run python:build` — download `python-build-standalone` for the current
  platform, create a venv, install Python dependencies, and pre-download the
  embedding model weights into `resources/python-runtime/<platform>/`.
- `npm run python:rebuild` — same, but forces a clean rebuild.
- `npm run dev` — start Vite + tsc in watch + Electron pointing at the dev URL.
- `npm run typecheck` — TypeScript checks for renderer, main process, tooling.
- `npm run build` — production build (typecheck + tsc for main + Vite for renderer).

## First-run flow

1. Run `npm install`.
2. Run `npm run python:build` (creates `resources/python-runtime/<platform>/`).
3. Run the backend at `http://127.0.0.1:3000` (see `sa-agent-backend`).
4. `npm run dev` to launch.

## Security notes

- `contextIsolation: true`, `nodeIntegration: false`.
- The renderer talks to the main process only through the
  `window.saAgent` bridge exposed in `electron/preload.cts`.
- All FS operations are resolved against the active scope root with a
  `path-escape` check; symlink traversal is not allowed by `path.resolve`.

---

Part of the [SA-Agent](https://github.com/AstAgency/astagency-docs) product ecosystem.
