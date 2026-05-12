import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type TSchema } from "@earendil-works/pi-ai";
import { getBridge } from "../../lib/bridge";
import type { Project, WorkspaceScope } from "../../lib/types";

type ToolDefinition = AgentTool;

const DEFAULT_PYTHON_TIMEOUT_MS = 60_000;
const MAX_LIST_ENTRIES = 200;

export type WorkspaceToolActions = {
  updateGlobalMemory: (content: string) => Promise<void>;
  updateProjectMemory: (projectId: string, content: string) => Promise<void>;
  createProject: (input: { name: string; description?: string }) => Promise<Project>;
};

function textResult(text: string, details?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details: details ?? null,
  };
}

export function buildWorkspaceTools(
  scope: WorkspaceScope,
  actions: WorkspaceToolActions,
): ToolDefinition[] {
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

  const updateGlobalMemoryTool: ToolDefinition = {
    name: "update_global_memory",
    label: "Update global memory",
    description:
      "Overwrite the user's global memory note that is injected into every prompt. Use this to persist long-lived facts about the user (preferences, role, tools, current focus).",
    parameters: Type.Object(
      {
        content: Type.String({ description: "New full content of the global memory" }),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const content = pickString(args, "content");
      await actions.updateGlobalMemory(content);
      return textResult(`Updated global_memory (${content.length} chars)`, {
        bytes: content.length,
      });
    },
  };

  const createProjectTool: ToolDefinition = {
    name: "create_project",
    label: "Create project",
    description:
      "Create a new project belonging to the current profile. Returns the project id and key. Only available in global sessions — in a project session this tool is not registered.",
    parameters: Type.Object(
      {
        name: Type.String({ description: "Human-readable project name" }),
        description: Type.Optional(
          Type.String({ description: "Optional short description" }),
        ),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const name = pickString(args, "name");
      const argRecord = (args ?? {}) as Record<string, unknown>;
      const description =
        typeof argRecord.description === "string" ? argRecord.description : undefined;
      const project = await actions.createProject({ name, description });
      return textResult(
        `Created project ${project.name} (id=${project.id})`,
        { id: project.id, name: project.name },
      );
    },
  };

  const updateProjectMemoryTool: ToolDefinition = {
    name: "update_project_memory",
    label: "Update project memory",
    description:
      "Overwrite the project_memory of the current project. Only available inside a project session.",
    parameters: Type.Object(
      {
        content: Type.String({ description: "New full content of the project memory" }),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      if (scope.kind !== "project") {
        throw new Error("update_project_memory is only available in a project session");
      }
      const content = pickString(args, "content");
      await actions.updateProjectMemory(scope.projectId, content);
      return textResult(`Updated project_memory (${content.length} chars)`, {
        project_id: scope.projectId,
        bytes: content.length,
      });
    },
  };

  const tools: ToolDefinition[] = [
    readFileTool,
    writeFileTool,
    editFileTool,
    listFilesTool,
    runPythonTool,
    updateGlobalMemoryTool,
  ];
  if (scope.kind === "global") tools.push(createProjectTool);
  if (scope.kind === "project") tools.push(updateProjectMemoryTool);
  return tools;
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
