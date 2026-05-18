# Capability Registry Prompt Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace handwritten tool prompt inventory/guidance with a single capability registry, generated prompt blocks, and minimal advisory runtime policy checks for Python tool use.

**Architecture:** Add a structured registry under `src/renderer/agent/prompts/`, generate both the capability-awareness prompt and the short tools manifest from it, then wire runtime to consume those generated blocks. Add a small advisory policy module that can flag suspicious Python tool usage without blocking execution.

**Tech Stack:** TypeScript, Node test runner, React/Electron renderer runtime, existing `pi-agent-core` tool pipeline

---

### Task 1: Introduce the Capability Registry and Prompt Generators

**Files:**
- Create: `src/renderer/agent/prompts/capability-registry.ts`
- Create: `src/renderer/agent/prompts/capability-registry.test.ts`
- Create: `src/renderer/agent/prompts/build-capabilities-prompt.ts`
- Create: `src/renderer/agent/prompts/build-tools-manifest.ts`
- Modify: `src/renderer/agent/prompts/index.ts`
- Modify: `src/renderer/agent/prompts/capabilities.ts`
- Modify: `src/renderer/agent/prompts/tools-manifest.ts`
- Test: `src/renderer/agent/prompts/capability-registry.test.ts`

- [ ] **Step 1: Write the failing registry and generator tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY_REGISTRY,
  listAvailableCapabilityNames,
} from "./capability-registry.js";
import { buildCapabilitiesPrompt } from "./build-capabilities-prompt.js";
import { buildToolsManifest } from "./build-tools-manifest.js";

test("registry exposes list_python_packages and run_python", () => {
  const names = listAvailableCapabilityNames(CAPABILITY_REGISTRY);
  assert.deepEqual(
    names.includes("list_python_packages") && names.includes("run_python"),
    true,
  );
});

test("generated capabilities prompt lists available Python tools", () => {
  const prompt = buildCapabilitiesPrompt(CAPABILITY_REGISTRY);
  assert.match(prompt, /list_python_packages/);
  assert.match(prompt, /run_python/);
});

test("generated capabilities prompt does not contain workflow prose", () => {
  const prompt = buildCapabilitiesPrompt(CAPABILITY_REGISTRY);
  assert.doesNotMatch(prompt, /Before writing run_python code/);
});

test("generated tools manifest contains Python workflow guidance", () => {
  const manifest = buildToolsManifest(CAPABILITY_REGISTRY);
  assert.match(manifest, /list_python_packages/);
  assert.match(manifest, /third-party/);
});

test("generated tools manifest does not re-list full capability inventory", () => {
  const manifest = buildToolsManifest(CAPABILITY_REGISTRY);
  assert.doesNotMatch(manifest, /Available capabilities \(and only these\):/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer`
Expected: FAIL with module-not-found errors for `capability-registry`, `build-capabilities-prompt`, or `build-tools-manifest`

- [ ] **Step 3: Write minimal registry implementation**

```ts
export type CapabilityCategory =
  | "filesystem"
  | "python"
  | "network"
  | "memory"
  | "agent_content";

export type CapabilityTool = {
  name: string;
  kind: "local_runtime" | "function_tool";
  category: CapabilityCategory;
  description: string;
  availability: { type: "always" };
  capabilityFacts: string[];
  usagePolicy: string[];
  preconditions: string[];
  postconditions: string[];
  manifestPriority: "high" | "normal" | "low";
  runtimeChecks: string[];
};

export type CapabilityRegistry = {
  tools: CapabilityTool[];
  categories: Record<
    CapabilityCategory,
    {
      usagePolicy: string[];
      antiPatterns: string[];
    }
  >;
};

export const CAPABILITY_REGISTRY: CapabilityRegistry = {
  tools: [
    {
      name: "list_python_packages",
      kind: "local_runtime",
      category: "python",
      description:
        "List installed Python packages in the bundled interpreter, optionally filtered by substring.",
      availability: { type: "always" },
      capabilityFacts: [
        "Returns installed package names with versions.",
        "Reflects packages available to run_python.",
        "Does not install packages.",
      ],
      usagePolicy: [
        "Use before run_python when third-party imports may be needed.",
      ],
      preconditions: [],
      postconditions: ["The agent knows what packages are available."],
      manifestPriority: "high",
      runtimeChecks: ["python_package_discovery"],
    },
    {
      name: "run_python",
      kind: "local_runtime",
      category: "python",
      description:
        "Execute Python code using the bundled interpreter in the workspace.",
      availability: { type: "always" },
      capabilityFacts: [
        "Runs with the workspace as CWD.",
        "Returns stdout, stderr, and exit_code.",
      ],
      usagePolicy: [
        "Prefer stdlib when sufficient.",
        "Use relative workspace paths.",
      ],
      preconditions: ["Verify third-party package availability first if needed."],
      postconditions: ["Execution result is available through stdout/stderr/exit_code."],
      manifestPriority: "high",
      runtimeChecks: ["python_package_discovery"],
    },
  ],
  categories: {
    filesystem: { usagePolicy: [], antiPatterns: [] },
    python: {
      usagePolicy: [
        "Prefer stdlib when sufficient.",
        "Verify package availability before relying on third-party imports.",
      ],
      antiPatterns: [
        "Do not assume pip install capability unless a real install tool exists.",
      ],
    },
    network: { usagePolicy: [], antiPatterns: [] },
    memory: { usagePolicy: [], antiPatterns: [] },
    agent_content: { usagePolicy: [], antiPatterns: [] },
  },
};

export function listAvailableCapabilityNames(registry: CapabilityRegistry): string[] {
  return registry.tools.map((tool) => tool.name);
}
```

- [ ] **Step 4: Write minimal prompt generators**

```ts
import type { CapabilityRegistry } from "./capability-registry.js";

export function buildCapabilitiesPrompt(registry: CapabilityRegistry): string {
  const lines = [
    "Capability awareness:",
    "Available capabilities (and only these):",
  ];
  for (const tool of registry.tools) {
    lines.push(`- ${tool.name}: ${tool.description}`);
  }
  return lines.join("\n");
}
```

```ts
import type { CapabilityRegistry } from "./capability-registry.js";

export function buildToolsManifest(registry: CapabilityRegistry): string {
  const pythonTools = registry.tools.filter((tool) => tool.category === "python");
  const lines = ["Tool usage best practices. Follow these to avoid wasted turns:"];
  if (pythonTools.length > 0) {
    lines.push("");
    lines.push("Python:");
    lines.push(
      "- Before writing run_python code that imports any third-party library, call list_python_packages and rely only on packages that are actually installed.",
    );
    lines.push("- Prefer the standard library when a task does not clearly need a third-party package.");
  }
  return lines.join("\n");
}
```

- [ ] **Step 5: Replace handwritten exports with generated prompt blocks**

```ts
// capabilities.ts
import { CAPABILITY_REGISTRY } from "./capability-registry.js";
import { buildCapabilitiesPrompt } from "./build-capabilities-prompt.js";

export const CAPABILITIES_PROMPT = buildCapabilitiesPrompt(CAPABILITY_REGISTRY);
```

```ts
// tools-manifest.ts
import { CAPABILITY_REGISTRY } from "./capability-registry.js";
import { buildToolsManifest } from "./build-tools-manifest.js";

export const TOOLS_MANIFEST_PROMPT = buildToolsManifest(CAPABILITY_REGISTRY);
```

- [ ] **Step 6: Export the new helpers from the prompt index**

```ts
export { CAPABILITY_REGISTRY, listAvailableCapabilityNames } from "./capability-registry";
export { buildCapabilitiesPrompt } from "./build-capabilities-prompt";
export { buildToolsManifest } from "./build-tools-manifest";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:renderer`
Expected: PASS, including the new prompt registry tests

- [ ] **Step 8: Run renderer typecheck**

Run: `npm run typecheck:renderer`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/renderer/agent/prompts/capability-registry.ts \
  src/renderer/agent/prompts/capability-registry.test.ts \
  src/renderer/agent/prompts/build-capabilities-prompt.ts \
  src/renderer/agent/prompts/build-tools-manifest.ts \
  src/renderer/agent/prompts/index.ts \
  src/renderer/agent/prompts/capabilities.ts \
  src/renderer/agent/prompts/tools-manifest.ts
git commit -m "refactor: generate tool prompt blocks from capability registry"
```

### Task 2: Align Runtime Consumption with the Generated Prompt Model

**Files:**
- Modify: `src/renderer/agent/runtime/stream.ts`
- Modify: `src/renderer/agent/prompt-builder.ts`
- Create: `src/renderer/agent/prompt-builder.test.ts`
- Test: `src/renderer/agent/prompt-builder.test.ts`

- [ ] **Step 1: Write a failing prompt-builder integration test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "./prompt-builder.js";
import { TOOLS_MANIFEST_PROMPT, CAPABILITIES_PROMPT } from "./prompts/index.js";

test("buildPrompt includes generated capabilities and available_tools blocks", () => {
  const result = buildPrompt({
    agent: null,
    agentSkills: [],
    agentRoles: [],
    profile: { global_memory: "", id: "p", email: "", full_name: "", created_at: "" },
    project: null,
    relevantSummaries: [],
    liveMessages: [],
    toolsManifest: TOOLS_MANIFEST_PROMPT,
  });
  const system = result[0];
  assert.equal(system?.role, "system");
  assert.match(system?.content ?? "", new RegExp(CAPABILITIES_PROMPT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(system?.content ?? "", /<available_tools>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer`
Expected: FAIL if prompt builder tests do not yet cover the generated path or if fixture types are incomplete

- [ ] **Step 3: Make prompt-builder fixtures and runtime usage explicit**

```ts
// runtime/stream.ts
const promptMessages: ChatMessage[] = buildPrompt({
  agent: rt.input.agent,
  agentSkills: rt.input.agentSkills ?? [],
  agentRoles: rt.input.agentRoles ?? [],
  profile: rt.input.profile,
  project: rt.input.project,
  relevantSummaries,
  liveMessages: [],
  toolsManifest: TOOLS_MANIFEST_PROMPT,
}).concat(transcriptForLlm);
```

```ts
// prompt-builder.test.ts
const profile = {
  id: "profile-1",
  email: "agent@example.com",
  full_name: "Agent",
  global_memory: "",
  created_at: "2026-05-18T00:00:00Z",
};
```

- [ ] **Step 4: Run tests to verify prompt composition passes**

Run: `npm run test:renderer`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/agent/runtime/stream.ts \
  src/renderer/agent/prompt-builder.ts \
  src/renderer/agent/prompt-builder.test.ts
git commit -m "test: cover generated prompt block composition"
```

### Task 3: Add Minimal Advisory Runtime Policy Checks for Python

**Files:**
- Create: `src/renderer/agent/runtime/tool-policy.ts`
- Create: `src/renderer/agent/runtime/tool-policy.test.ts`
- Modify: `src/renderer/agent/runtime/trace.ts`
- Modify: `src/renderer/agent/runtime/types.ts`
- Test: `src/renderer/agent/runtime/tool-policy.test.ts`

- [ ] **Step 1: Write failing advisory policy tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { detectPythonPolicyWarnings } from "./tool-policy.js";

test("warns when run_python appears to import third-party modules without discovery", () => {
  const warnings = detectPythonPolicyWarnings({
    toolName: "run_python",
    argsJson: JSON.stringify({
      code: "import pandas\nprint('ok')",
    }),
    priorToolNames: [],
  });
  assert.match(warnings.join("\n"), /list_python_packages/);
});

test("does not warn when package discovery happened earlier in the turn", () => {
  const warnings = detectPythonPolicyWarnings({
    toolName: "run_python",
    argsJson: JSON.stringify({
      code: "import pandas\nprint('ok')",
    }),
    priorToolNames: ["list_python_packages"],
  });
  assert.equal(warnings.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer`
Expected: FAIL with module-not-found for `tool-policy`

- [ ] **Step 3: Implement the minimal advisory detector**

```ts
const STDLIB_ALLOWLIST = new Set([
  "json",
  "csv",
  "math",
  "pathlib",
  "re",
  "statistics",
  "itertools",
  "collections",
  "datetime",
  "typing",
  "os",
  "sys",
]);

export function detectPythonPolicyWarnings(input: {
  toolName: string;
  argsJson: string;
  priorToolNames: string[];
}): string[] {
  if (input.toolName !== "run_python") return [];
  if (input.priorToolNames.includes("list_python_packages")) return [];

  const parsed = JSON.parse(input.argsJson || "{}") as { code?: string };
  const code = parsed.code ?? "";
  const imported = Array.from(
    code.matchAll(/^(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm),
  ).map((match) => match[1]);

  const suspicious = imported.filter((name) => !STDLIB_ALLOWLIST.has(name));
  if (suspicious.length === 0) return [];
  return [
    `run_python imports possible third-party modules (${suspicious.join(", ")}) without prior list_python_packages discovery.`,
  ];
}
```

- [ ] **Step 4: Attach warnings to tool trace events without blocking execution**

```ts
// in trace.ts, when recording a tool_call event
const warnings = detectPythonPolicyWarnings({
  toolName: name,
  argsJson: JSON.stringify(parsedArgs ?? {}),
  priorToolNames: rt.state.trace
    .filter((event) => event.kind === "tool_call")
    .map((event) => event.name),
});
```

```ts
// in types.ts
warnings?: string[];
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run test:renderer`
Expected: PASS

Run: `npm run typecheck:renderer`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/agent/runtime/tool-policy.ts \
  src/renderer/agent/runtime/tool-policy.test.ts \
  src/renderer/agent/runtime/trace.ts \
  src/renderer/agent/runtime/types.ts
git commit -m "feat: add advisory Python tool policy checks"
```

### Task 4: Final Verification and Documentation Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-05-18-python-tooling-capability-registry-design.md` (only if implementation diverged)
- Modify: `README.md` (only if runtime wording is now outdated or misleading)

- [ ] **Step 1: Run the full renderer test suite**

Run: `npm run test:renderer`
Expected: PASS

- [ ] **Step 2: Run renderer typecheck**

Run: `npm run typecheck:renderer`
Expected: PASS

- [ ] **Step 3: Check for stale wording around Python runtime prompt behavior**

Run: `rg -n "venv|available_tools|tools manifest|list_python_packages" README.md src/renderer/agent`
Expected: no stale wording that contradicts the implemented registry model

- [ ] **Step 4: Update docs only if implementation materially changed the contract**

```md
- describe capability registry as the single source of truth
- describe generated capability/tool guidance blocks
- describe advisory policy checks as non-blocking
```

- [ ] **Step 5: Create final commit**

```bash
git add README.md docs/superpowers/specs/2026-05-18-python-tooling-capability-registry-design.md
git commit -m "docs: align Python tooling architecture wording"
```
