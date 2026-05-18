import type { RuntimeTraceEvent } from "./types.js";

const PYTHON_STDLIB_MODULES = new Set([
  "__future__",
  "abc",
  "argparse",
  "array",
  "asyncio",
  "base64",
  "collections",
  "concurrent",
  "contextlib",
  "csv",
  "dataclasses",
  "datetime",
  "decimal",
  "enum",
  "functools",
  "glob",
  "hashlib",
  "heapq",
  "html",
  "http",
  "importlib",
  "inspect",
  "io",
  "itertools",
  "json",
  "logging",
  "math",
  "operator",
  "os",
  "pathlib",
  "random",
  "re",
  "shutil",
  "sqlite3",
  "statistics",
  "string",
  "subprocess",
  "sys",
  "tempfile",
  "textwrap",
  "time",
  "typing",
  "unittest",
  "urllib",
  "uuid",
  "xml",
  "zipfile",
]);

type ToolPolicyInput = {
  name: string;
  args: Record<string, unknown> | null | undefined;
};

export function getToolPolicyWarnings(
  trace: readonly RuntimeTraceEvent[],
  toolCall: ToolPolicyInput,
  currentTraceEventId?: string,
): string[] {
  if (toolCall.name !== "run_python") return [];
  if (hasPriorPythonPackageDiscovery(getPriorTraceEvents(trace, currentTraceEventId))) return [];

  const code = typeof toolCall.args?.code === "string" ? toolCall.args.code : "";
  const thirdPartyImports = findLikelyThirdPartyPythonImports(code);
  if (thirdPartyImports.length === 0) return [];

  return [
    `run_python imports likely third-party modules (${thirdPartyImports.join(", ")}) without prior list_python_packages discovery in this turn.`,
  ];
}

function getPriorTraceEvents(
  trace: readonly RuntimeTraceEvent[],
  currentTraceEventId?: string,
): readonly RuntimeTraceEvent[] {
  if (!currentTraceEventId) return trace;
  const currentIndex = trace.findIndex((event) => event.id === currentTraceEventId);
  if (currentIndex < 0) return trace;
  return trace.slice(0, currentIndex);
}

function hasPriorPythonPackageDiscovery(trace: readonly RuntimeTraceEvent[]): boolean {
  return trace.some(
    (event) =>
      event.kind === "tool_call" &&
      event.name === "list_python_packages" &&
      (event.status === "success" || event.status === "running" || event.status === "queued"),
  );
}

function findLikelyThirdPartyPythonImports(code: string): string[] {
  const modules = new Set<string>();
  const importPattern =
    /^\s*(?:from\s+([A-Za-z_][\w.]*)\s+import\b|import\s+([^#\n]+))/gm;

  for (const match of code.matchAll(importPattern)) {
    if (match[1]) {
      const rootModule = normalizeImportedModule(match[1]);
      if (isLikelyThirdPartyModule(rootModule)) modules.add(rootModule);
      continue;
    }

    const importList = match[2] ?? "";
    for (const importedModule of importList.split(",")) {
      const rootModule = normalizeImportedModule(importedModule);
      if (isLikelyThirdPartyModule(rootModule)) modules.add(rootModule);
    }
  }

  return [...modules];
}

function normalizeImportedModule(importTarget: string): string {
  return importTarget.trim().split(/\s+as\s+/i)[0].split(".")[0] ?? "";
}

function isLikelyThirdPartyModule(moduleName: string): boolean {
  if (!moduleName) return false;
  if (moduleName.startsWith(".")) return false;
  return !PYTHON_STDLIB_MODULES.has(moduleName);
}
