import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type TSchema } from "@earendil-works/pi-ai";
import { analyzeImage } from "../../lib/api";
import { getBridge } from "../../lib/bridge";
import { VISION_ANALYSIS_PROMPT } from "../prompts";
import type { AgentRole, AgentSkill, Project, WorkspaceScope } from "../../lib/types";
import {
  formatGetRoleResult,
  formatGetSkillResult,
} from "./agent-content-tools";

type ToolDefinition = AgentTool;

const DEFAULT_PYTHON_TIMEOUT_MS = 60_000;
const LIST_PACKAGES_TIMEOUT_MS = 30_000;
const MAX_LIST_ENTRIES = 200;
const MAX_PACKAGE_ENTRIES = 500;

const LIST_PACKAGES_SCRIPT = `import importlib.metadata as md
seen = {}
for dist in md.distributions():
    try:
        name = dist.metadata["Name"] or getattr(dist, "name", None)
    except Exception:
        name = getattr(dist, "name", None)
    if not name:
        continue
    key = name.lower()
    if key not in seen:
        seen[key] = (name, dist.version or "?")
for n, v in sorted(seen.values(), key=lambda x: x[0].lower()):
    print(n + "==" + v)
print("__COUNT__=" + str(len(seen)))
`;

export type WorkspaceToolActions = {
  updateGlobalMemory: (content: string) => Promise<void>;
  updateProjectMemory: (projectId: string, content: string) => Promise<void>;
  // createProject: (input: { name: string; description?: string }) => Promise<Project>;
};

export type AgentContentLookups = {
  findSkill: (name: string) => AgentSkill | null;
  findRole: (name: string) => AgentRole | null;
  listSkillNames: () => string[];
  listRoleNames: () => string[];
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
};

function imageMetaFromPath(path: string): { fileName: string; mimeType: string } {
  const fileName = path.split(/[\\/]/).pop() || path;
  const ext = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase()
    : "";
  const mimeType = IMAGE_MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new Error(
      `Unsupported image extension ".${ext}". Supported: ${Object.keys(IMAGE_MIME_BY_EXT).join(", ")}`,
    );
  }
  return { fileName, mimeType };
}

function textResult(text: string, details?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details: details ?? null,
  };
}

export function buildWorkspaceTools(
  scope: WorkspaceScope,
  actions: WorkspaceToolActions,
  agentContent: AgentContentLookups,
): ToolDefinition[] {
  const fs = getBridge().fs;
  const net = getBridge().net;
  const python = getBridge().python;

  const readFileTool: ToolDefinition = {
    name: "read_file",
    label: "Read file",
    description:
      "Read a UTF-8 text file. Use paths relative to the current workspace, or read-only namespace paths from list_files such as global/<session-folder>/... and projects/<project-folder>/....",
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
      "Create or overwrite a UTF-8 text file in the current workspace. Parent directories are created automatically. Namespace paths are read-only.",
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
      "Replace text within an existing file in the current workspace. By default the substring must be unique; use replace_all to replace every occurrence. Namespace paths are read-only.",
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
    description:
      "List files and directories at the given path (defaults to current workspace root). Also supports read-only namespace roots: global and projects.",
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

  const listPythonPackagesTool: ToolDefinition = {
    name: "list_python_packages",
    label: "List python packages",
    description:
      "List Python packages installed in the bundled interpreter (name==version). Call this before writing run_python code that imports third-party libraries, so you only rely on packages that are actually available. Optionally filter by a case-insensitive substring of the package name.",
    parameters: Type.Object(
      {
        filter: Type.Optional(
          Type.String({ description: "Case-insensitive substring to match package names" }),
        ),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const argRecord = (args ?? {}) as Record<string, unknown>;
      const filter =
        typeof argRecord.filter === "string" ? argRecord.filter.trim().toLowerCase() : "";
      const result = await python.run(scope, LIST_PACKAGES_SCRIPT, {
        timeoutMs: LIST_PACKAGES_TIMEOUT_MS,
      });
      if (result.exit_code !== 0) {
        return textResult(
          `Failed to list packages (exit_code=${result.exit_code})\n${result.stderr}`.trim(),
          { exit_code: result.exit_code, timed_out: result.timed_out },
        );
      }
      let total = 0;
      const packages: string[] = [];
      for (const rawLine of result.stdout.split("\n")) {
        const line = rawLine.trim();
        if (line.length === 0) continue;
        if (line.startsWith("__COUNT__=")) {
          total = Number.parseInt(line.slice("__COUNT__=".length), 10) || 0;
          continue;
        }
        if (filter.length > 0 && !line.toLowerCase().includes(filter)) continue;
        packages.push(line);
      }
      const matched = packages.length;
      const shown = packages.slice(0, MAX_PACKAGE_ENTRIES);
      const overflow =
        matched > shown.length ? `\n…${matched - shown.length} more` : "";
      const header =
        filter.length > 0
          ? `${matched} package(s) matching "${filter}" (of ${total} installed)`
          : `${total} package(s) installed`;
      const body = shown.length === 0 ? "(none)" : shown.join("\n");
      return textResult(`${header}\n${body}${overflow}`, {
        total,
        matched,
        filter: filter || null,
      });
    },
  };

  const fetchUrlTool: ToolDefinition = {
    name: "fetch_url",
    label: "Fetch URL",
    description:
      "Fetch a URL (http/https only) and return its readable text content. HTML is converted via @mozilla/readability, JSON is pretty-printed, plain text is passed through. Private and loopback addresses are blocked.",
    parameters: Type.Object(
      {
        url: Type.String({ description: "HTTP or HTTPS URL to fetch" }),
        timeout_ms: Type.Optional(
          Type.Number({ description: "Timeout in milliseconds (1000..30000, default 15000)" }),
        ),
        max_chars: Type.Optional(
          Type.Number({ description: "Maximum output characters (100..200000, default 32000)" }),
        ),
        mode: Type.Optional(
          Type.String({ description: 'Output mode: "readable" (default) or "raw"' }),
        ),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const url = pickString(args, "url");
      const argRecord = (args ?? {}) as Record<string, unknown>;
      const text = await net.fetchUrl(url, {
        timeoutMs: typeof argRecord.timeout_ms === "number" ? argRecord.timeout_ms : undefined,
        maxChars: typeof argRecord.max_chars === "number" ? argRecord.max_chars : undefined,
        mode: argRecord.mode === "raw" ? "raw" : "readable",
      });
      return textResult(text, { url });
    },
  };

  const webSearchTool: ToolDefinition = {
    name: "web_search",
    label: "Web search",
    description:
      "Run a web search via local SearXNG. Returns top results with title, URL, and snippet.",
    parameters: Type.Object(
      {
        query: Type.String({ description: "Search query (1..256 chars)" }),
        limit: Type.Optional(Type.Number({ description: "Result count (1..10, default 5)" })),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const query = pickString(args, "query");
      const argRecord = (args ?? {}) as Record<string, unknown>;
      const text = await net.webSearch(query, typeof argRecord.limit === "number" ? argRecord.limit : undefined);
      return textResult(text, { query });
    },
  };

  const analyzeImageTool: ToolDefinition = {
    name: "analyze_image",
    label: "Analyze image",
    description:
      "Analyze an image file and return a textual description of what it depicts. Any text present in the image (signs, documents, screenshots, tables) is transcribed verbatim. Pass only a path to an image in the workspace (use list_files to discover real paths); the analysis prompt is fixed.",
    parameters: Type.Object(
      {
        path: Type.String({ description: "Path to an image file relative to workspace root" }),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const path = pickString(args, "path");
      const { fileName, mimeType } = imageMetaFromPath(path);
      const { base64, bytes } = await fs.readBinary(scope, path);
      const description = await analyzeImage({
        imageBase64: base64,
        fileName,
        mimeType,
        prompt: VISION_ANALYSIS_PROMPT,
      });
      return textResult(description, { path, bytes, mime_type: mimeType });
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

  // const createProjectTool: ToolDefinition = {
  //   name: "create_project",
  //   label: "Create project",
  //   description:
  //     "Create a new project belonging to the current profile. Returns the project id and key. Only available in global sessions — in a project session this tool is not registered.",
  //   parameters: Type.Object(
  //     {
  //       name: Type.String({ description: "Human-readable project name" }),
  //       description: Type.Optional(
  //         Type.String({ description: "Optional short description" }),
  //       ),
  //     },
  //     { additionalProperties: false },
  //   ) as TSchema,
  //   execute: async (_id, args) => {
  //     const name = pickString(args, "name");
  //     const argRecord = (args ?? {}) as Record<string, unknown>;
  //     const description =
  //       typeof argRecord.description === "string" ? argRecord.description : undefined;
  //     const project = await actions.createProject({ name, description });
  //     return textResult(
  //       `Created project ${project.name} (id=${project.id})`,
  //       { id: project.id, name: project.name },
  //     );
  //   },
  // };

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

  const getSkillTool: ToolDefinition = {
    name: "get_skill",
    label: "Get skill",
    description:
      "Load the full SKILL.md and any bundled templates for one of the skills listed in the <skills> block of the system prompt. Use this after picking a skill by name from <skills> — do NOT use list_files to look for skills.",
    parameters: Type.Object(
      {
        name: Type.String({ description: "Skill name as listed in <skills>" }),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const name = pickString(args, "name");
      const formatted = formatGetSkillResult({
        skill: agentContent.findSkill(name),
        requestedName: name,
        available: agentContent.listSkillNames(),
      });
      return textResult(formatted.text, { name, ok: formatted.ok });
    },
  };

  const getRoleTool: ToolDefinition = {
    name: "get_role",
    label: "Get role",
    description:
      "Load the full role prompt for one of the roles listed in the <roles> block of the system prompt. Use this after picking a role by name from <roles> — do NOT use list_files to look for roles.",
    parameters: Type.Object(
      {
        name: Type.String({ description: "Role name as listed in <roles>" }),
      },
      { additionalProperties: false },
    ) as TSchema,
    execute: async (_id, args) => {
      const name = pickString(args, "name");
      const formatted = formatGetRoleResult({
        role: agentContent.findRole(name),
        requestedName: name,
        available: agentContent.listRoleNames(),
      });
      return textResult(formatted.text, { name, ok: formatted.ok });
    },
  };

  const tools: ToolDefinition[] = [
    readFileTool,
    writeFileTool,
    editFileTool,
    listFilesTool,
    runPythonTool,
    listPythonPackagesTool,
    fetchUrlTool,
    webSearchTool,
    analyzeImageTool,
    updateGlobalMemoryTool,
  ];
  if (agentContent.listSkillNames().length > 0) tools.push(getSkillTool);
  if (agentContent.listRoleNames().length > 0) tools.push(getRoleTool);
  // if (scope.kind === "global") tools.push(createProjectTool);
  if (scope.kind === "project") tools.push(updateProjectMemoryTool);
  return tools;
}

// export function describeToolsForPrompt(tools: ToolDefinition[]): string {
//   return tools
//     .map((tool) => `- ${tool.name}: ${tool.description ?? ""}`)
//     .join("\n");
// }

function pickString(args: unknown, key: string): string {
  if (args && typeof args === "object" && key in args) {
    const value = (args as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  throw new Error(`Missing required string argument: ${key}`);
}
