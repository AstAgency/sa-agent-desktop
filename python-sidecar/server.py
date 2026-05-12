"""SA-Agent Desktop python sidecar.

Long-running process spoken to by the Electron main process over stdin/stdout
using newline-delimited JSON-RPC. Provides:

- ``ping``: readiness check.
- ``embed_query`` / ``embed_passage``: produce normalized embeddings for the
  intfloat/multilingual-e5-large model with the appropriate prefix.
- ``run_python``: execute a python file at ``script_path`` using the sidecar's
  interpreter (which equals the bundled venv interpreter) with ``cwd`` set to
  the requested workspace directory and a per-call timeout. The agent writes
  the source via the FS tools before calling this command.

All responses are newline-terminated JSON objects with the shape
``{"id": <request-id>, "ok": true, "result": ...}`` or
``{"id": <request-id>, "ok": false, "error": <string>}``.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import traceback
from typing import Any

MODEL_ID = "intfloat/multilingual-e5-large"
EMBEDDING_DIMENSIONS = 1024


def _emit(response: dict) -> None:
    sys.stdout.write(json.dumps(response, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _log(message: str) -> None:
    sys.stderr.write(f"[sa-agent-sidecar] {message}\n")
    sys.stderr.flush()


def _load_model():
    from sentence_transformers import SentenceTransformer  # type: ignore

    cache_folder = os.environ.get("SA_AGENT_HF_CACHE") or None
    _log(f"loading model {MODEL_ID} (cache_folder={cache_folder!r})")
    started = time.time()
    model = SentenceTransformer(MODEL_ID, cache_folder=cache_folder)
    _log(f"model loaded in {time.time() - started:.2f}s")
    return model


_model = None


def _get_model():
    global _model
    if _model is None:
        _model = _load_model()
    return _model


def _embed(text: str, prefix: str) -> list[float]:
    model = _get_model()
    prepared = f"{prefix}{text}"
    vector = model.encode(
        prepared,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return [float(component) for component in vector.tolist()]


def _run_python(payload: dict) -> dict:
    script_path = payload.get("script_path")
    cwd = payload.get("cwd")
    timeout_ms = payload.get("timeout_ms")
    stdin_text = payload.get("stdin", "")
    if not isinstance(script_path, str) or not script_path:
        raise ValueError("script_path is required")
    if not isinstance(cwd, str) or not cwd:
        raise ValueError("cwd is required")
    if not os.path.isfile(script_path):
        raise FileNotFoundError(f"script not found: {script_path}")
    if not os.path.isdir(cwd):
        raise FileNotFoundError(f"cwd not found: {cwd}")

    timeout_seconds: float | None
    if timeout_ms is None:
        timeout_seconds = 30.0
    else:
        timeout_seconds = max(0.1, float(timeout_ms) / 1000.0)

    env = os.environ.copy()
    env.pop("SA_AGENT_HF_CACHE", None)

    started = time.time()
    timed_out = False
    try:
        completed = subprocess.run(
            [sys.executable, "-I", script_path],
            cwd=cwd,
            env=env,
            input=stdin_text if isinstance(stdin_text, str) else "",
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
        stdout = completed.stdout
        stderr = completed.stderr
        exit_code = completed.returncode
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout.decode() if isinstance(error.stdout, (bytes, bytearray)) else (error.stdout or "")
        stderr = error.stderr.decode() if isinstance(error.stderr, (bytes, bytearray)) else (error.stderr or "")
        exit_code = -1
        timed_out = True

    duration_ms = int((time.time() - started) * 1000)
    return {
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "timed_out": timed_out,
        "script_path": script_path,
    }


def _handle(message: dict) -> dict:
    request_id = message.get("id")
    command = message.get("command")
    params = message.get("params") or {}
    try:
        if command == "ping":
            return {"id": request_id, "ok": True, "result": {"ready": True}}
        if command == "model_info":
            _get_model()
            return {
                "id": request_id,
                "ok": True,
                "result": {
                    "model_id": MODEL_ID,
                    "dimensions": EMBEDDING_DIMENSIONS,
                },
            }
        if command == "embed_query":
            text = params.get("text")
            if not isinstance(text, str):
                raise ValueError("text must be a string")
            return {
                "id": request_id,
                "ok": True,
                "result": {"embedding": _embed(text, prefix="query: ")},
            }
        if command == "embed_passage":
            text = params.get("text")
            if not isinstance(text, str):
                raise ValueError("text must be a string")
            return {
                "id": request_id,
                "ok": True,
                "result": {"embedding": _embed(text, prefix="passage: ")},
            }
        if command == "run_python":
            return {"id": request_id, "ok": True, "result": _run_python(params)}
        raise ValueError(f"unknown command: {command!r}")
    except Exception as error:  # noqa: BLE001 - we forward errors as JSON
        return {
            "id": request_id,
            "ok": False,
            "error": str(error),
            "trace": traceback.format_exc(limit=4),
        }


def main() -> int:
    _log("sidecar starting")
    if os.environ.get("SA_AGENT_PRELOAD_MODEL") == "1":
        try:
            _get_model()
        except Exception as error:  # noqa: BLE001
            _log(f"failed to preload model: {error}")
    _emit({"event": "ready"})
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError as error:
            _emit({"id": None, "ok": False, "error": f"invalid JSON: {error}"})
            continue
        if not isinstance(message, dict):
            _emit({"id": None, "ok": False, "error": "message must be an object"})
            continue
        _emit(_handle(message))
    _log("sidecar exiting")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
