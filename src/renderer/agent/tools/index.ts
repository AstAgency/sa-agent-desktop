import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type TSchema } from "@earendil-works/pi-ai";
import { getBridge } from "../../lib/bridge";
import type { WorkspaceScope } from "../../lib/types";

type ToolDefinition = AgentTool;

const DEFAULT_PYTHON_TIMEOUT_MS = 60_000;
const MAX_LIST_ENTRIES = 200;

function textResult(text: string, details?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details: details ?? null,
  };
}

export function buildWorkspaceTools(scope: WorkspaceScope): ToolDefinition[] {
  const fs = getBridge().fs;
  const python = getBridge().python;

  const readFileTool: ToolDefinition = {
    name: "read_file",
    label: "Read file",
    description:
      "Read a UTF-8 text file from the workspace. The path must be relative to the workspace root.",
    parameters: Type.Object(
      {
        path: Type.String({ description: "Path relative to workspace root" }),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const path = pickString(args, "path");
      const content = await fs.read(scope, path);
      return textResult(content, { path, bytes: content.length });
    },
  };

  const writeFileTool: ToolDefinition = {
    name: "write_file",
    label: "Write file",
    description:
      "Create or overwrite a UTF-8 text file in the workspace. Parent directories are created automatically.",
    parameters: Type.Object(
      {
        path: Type.String({ description: "Path relative to workspace root" }),
        content: Type.String({ description: "File content" }),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const path = pickString(args, "path");
      const content = pickString(args, "content");
      const result = await fs.write(scope, path, content);
      return textResult(`Wrote ${result.path}`, result);
    },
  };

  const editFileTool: ToolDefinition = {
    name: "edit_file",
    label: "Edit file",
    description:
      "Replace text within an existing file. By default the substring must be unique; use replace_all to replace every occurrence.",
    parameters: Type.Object(
      {
        path: Type.String({ description: "Path relative to workspace root" }),
        old_string: Type.String({ description: "Text to find" }),
        new_string: Type.String({ description: "Replacement text" }),
        replace_all: Type.Optional(Type.Boolean({ description: "Replace every occurrence" })),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const path = pickString(args, "path");
      const oldString = pickString(args, "old_string");
      const newString = pickString(args, "new_string");
      const replaceAll = Boolean((args as Record<string, unknown>).replace_all);
      const result = await fs.edit(scope, path, oldString, newString, replaceAll);
      return textResult(`Replaced ${result.replacements} occurrence(s) in ${result.path}`, result);
    },
  };

  const listFilesTool: ToolDefinition = {
    name: "list_files",
    label: "List files",
    description: "List files and directories at the given workspace path (defaults to root).",
    parameters: Type.Object(
      {
        path: Type.Optional(
          Type.String({ description: "Path relative to workspace root, default is root" }),
        ),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const argRecord = (args ?? {}) as Record<string, unknown>;
      const path = typeof argRecord.path === "string" ? argRecord.path : ".";
      const entries = await fs.list(scope, path);
      const truncated = entries.slice(0, MAX_LIST_ENTRIES);
      const lines = truncated.map((entry) => {
        const sizeText = entry.size === null ? "" : ` (${entry.size}b)`;
        return `${entry.type === "directory" ? "d" : "-"} ${entry.path}${sizeText}`;
      });
      const text = lines.length === 0 ? "(empty)" : lines.join("\n");
      const overflow = entries.length > truncated.length ? `\n…${entries.length - truncated.length} more` : "";
      return textResult(`${text}${overflow}`, { count: entries.length, path });
    },
  };

  const runPythonTool: ToolDefinition = {
    name: "run_python",
    label: "Run python",
    description:
      "Execute Python code using the bundled interpreter. The code runs in the workspace as CWD, written to a temporary file under .tmp. Returns stdout, stderr and exit_code.",
    parameters: Type.Object(
      {
        code: Type.String({ description: "Python source code to execute" }),
        timeout_ms: Type.Optional(Type.Number({ description: "Timeout in milliseconds (default 60000)" })),
        stdin: Type.Optional(Type.String({ description: "Optional stdin payload" })),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const code = pickString(args, "code");
      const argRecord = (args ?? {}) as Record<string, unknown>;
      const timeoutMs = typeof argRecord.timeout_ms === "number" ? argRecord.timeout_ms : DEFAULT_PYTHON_TIMEOUT_MS;
      const stdin = typeof argRecord.stdin === "string" ? argRecord.stdin : "";
      const result = await python.run(scope, code, { timeoutMs, stdin });
      const lines: string[] = [];
      lines.push(`exit_code=${result.exit_code} duration_ms=${result.duration_ms}${result.timed_out ? " (timed out)" : ""}`);
      if (result.stdout.length > 0) {
        lines.push("--- stdout ---");
        lines.push(result.stdout);
      }
      if (result.stderr.length > 0) {
        lines.push("--- stderr ---");
        lines.push(result.stderr);
      }
      return textResult(lines.join("\n"), {
        exit_code: result.exit_code,
        duration_ms: result.duration_ms,
        timed_out: result.timed_out,
      });
    },
  };

  return [readFileTool, writeFileTool, editFileTool, listFilesTool, runPythonTool];
}

export function describeToolsForPrompt(tools: ToolDefinition[]): string {
  return tools
    .map((tool) => `- ${tool.name}: ${tool.description ?? ""}`)
    .join("\n");
}

function pickString(args: unknown, key: string): string {
  if (args && typeof args === "object" && key in args) {
    const value = (args as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  throw new Error(`Missing required string argument: ${key}`);
}
