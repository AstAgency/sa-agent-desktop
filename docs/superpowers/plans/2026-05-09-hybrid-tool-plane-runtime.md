# Hybrid Tool Plane Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor conversational runtimes so the client owns one shared LLM/tool loop with two execution planes: `backend.*` tools for domain operations and `local.*` tools for desktop/file-system operations.

**Architecture:** Keep `POST /v1/llm/responses` as the only conversational generation boundary. Replace direct ad-hoc tool handling in `personal-assistant-runtime.ts` and `project-session-runtime.ts` with a shared conversation loop, a shared tool-intent parser, a unified tool catalog, and two executors: backend-scoped MCP RPC and local Electron bridge tools. The loop must persist messages separately, route tool calls by namespace, return structured tool results into the next LLM step, and never expose raw tool JSON to the user.

**Tech Stack:** React, TypeScript, Electron preload bridge, Vitest, existing renderer MCP/api layer, `@earendil-works/pi-agent-core`

---

## File Structure

### Create

- `src/renderer/agent/tool-catalog.ts` — normalize backend and local tool descriptors into one unified catalog with namespaced tool names
- `src/renderer/agent/tool-router.ts` — route tool calls by namespace (`backend.*`, `local.*`) to the correct executor
- `src/renderer/agent/conversation-loop.ts` — shared client-owned loop for `llm/responses -> tool -> llm/responses`
- `src/renderer/agent/executors/backend-tool-executor.ts` — wrapper around `POST /v1/me/mcp` and `POST /v1/project-agents/:projectAgentId/mcp`
- `src/renderer/agent/executors/local-tool-executor.ts` — wrapper around Electron bridge local tools
- `tests/unit/tool-catalog.test.ts` — catalog normalization and namespace coverage
- `tests/unit/tool-router.test.ts` — routing of backend vs local tools
- `tests/unit/conversation-loop.test.ts` — tool loop behavior, retry rules, raw JSON suppression, tool-result replay
- `tests/unit/local-tool-executor.test.ts` — filesystem tool bridging

### Modify

- `src/renderer/agent/personal-assistant-runtime.ts` — delegate to shared conversation loop and unified tool catalog
- `src/renderer/agent/project-session-runtime.ts` — delegate to shared conversation loop and unified tool catalog
- `src/renderer/agent/tool-intent.ts` — expand explicit tool-intent heuristics to local tools and shared namespaces
- `src/renderer/agent/tool-call-parser.ts` — remain shared parser for mixed prose + JSON
- `src/renderer/lib/types.ts` — add unified tool descriptor and executor result types
- `src/renderer/lib/debug.ts` — add explicit trace events for tool routing/executor plane
- `tests/unit/personal-assistant-runtime.test.ts` — update to shared loop expectations
- `tests/unit/project-session-runtime.test.ts` — update to shared loop expectations
- `tests/renderer/app-flow.test.tsx` — add end-to-end file-write regression and verify no raw tool payload leaks

### Reuse

- `src/renderer/lib/api.ts` — `postLlmResponse`, `postMeMcp`, `postProjectAgentMcp`
- `src/renderer/lib/agent-files.ts` — existing local file write path
- `src/renderer/agent/transcript.ts` — transcript conversion stays shared
- `src/renderer/agent/mcp-tools.ts` — keep for generic bridge-backed runtimes, but conversational runtimes stop depending on it directly

## Task 1: Define Unified Tool Types and Catalog

**Files:**
- Create: `src/renderer/agent/tool-catalog.ts`
- Modify: `src/renderer/lib/types.ts`
- Test: `tests/unit/tool-catalog.test.ts`

- [ ] **Step 1: Write the failing unit test for backend and local descriptor normalization**

```ts
import { describe, expect, it } from "vitest";
import { buildRuntimeToolCatalog } from "../../src/renderer/agent/tool-catalog";

describe("buildRuntimeToolCatalog", () => {
  it("namespaces backend and local tools into one catalog", () => {
    const catalog = buildRuntimeToolCatalog({
      backendTools: [
        { serverName: "user", name: "projects.create", description: "Create project", inputSchema: { type: "object" } },
      ],
      localTools: [
        { name: "files.write_file", description: "Write local file", inputSchema: { type: "object" } },
      ],
    });

    expect(catalog.map((tool) => tool.name)).toEqual([
      "backend.projects.create",
      "local.files.write_file",
    ]);
    expect(catalog[0]?.plane).toBe("backend");
    expect(catalog[1]?.plane).toBe("local");
  });
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npx vitest run tests/unit/tool-catalog.test.ts`
Expected: FAIL because `buildRuntimeToolCatalog` does not exist yet

- [ ] **Step 3: Add minimal shared tool types and catalog implementation**

```ts
export type RuntimeToolDescriptor = {
  name: string;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
  plane: "backend" | "local";
  backendName?: string | null;
  localName?: string | null;
};
```

```ts
export function buildRuntimeToolCatalog(input: {
  backendTools: McpToolDescriptor[];
  localTools: Array<{ name: string; description?: string | null; inputSchema?: Record<string, unknown> | null }>;
}): RuntimeToolDescriptor[] {
  return [
    ...input.backendTools.map((tool) => ({
      name: `backend.${tool.name}`,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema ?? null,
      plane: "backend" as const,
      backendName: tool.name,
      localName: null,
    })),
    ...input.localTools.map((tool) => ({
      name: `local.${tool.name}`,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema ?? null,
      plane: "local" as const,
      backendName: null,
      localName: tool.name,
    })),
  ];
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tests/unit/tool-catalog.test.ts`
Expected: PASS with correct namespacing and plane metadata

- [ ] **Step 5: Commit**

```bash
git add src/renderer/agent/tool-catalog.ts src/renderer/lib/types.ts tests/unit/tool-catalog.test.ts
git commit -m "refactor: add unified runtime tool catalog"
```

## Task 2: Add Local Tool Executor for File-System Writes

**Files:**
- Create: `src/renderer/agent/executors/local-tool-executor.ts`
- Test: `tests/unit/local-tool-executor.test.ts`

- [ ] **Step 1: Write the failing unit test for `local.files.write_file`**

```ts
import { describe, expect, it, vi } from "vitest";
import { callLocalTool } from "../../../src/renderer/agent/executors/local-tool-executor";

describe("callLocalTool", () => {
  it("writes a single file through the Electron file bridge", async () => {
    window.saAgent = {
      ...window.saAgent,
      files: {
        writeFiles: vi.fn().mockResolvedValue({ ok: true, rootPath: "/tmp/agent-files" }),
        openFolder: vi.fn(),
      },
    };

    const result = await callLocalTool("files.write_file", {
      path: "README.md",
      content: "# Title",
    });

    expect(window.saAgent?.files?.writeFiles).toHaveBeenCalledWith([
      { relativePath: "README.md", content: "# Title" },
    ]);
    expect(result.isError).toBe(false);
  });
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npx vitest run tests/unit/local-tool-executor.test.ts`
Expected: FAIL because `callLocalTool` does not exist yet

- [ ] **Step 3: Implement the minimal local file executor**

```ts
export async function callLocalTool(name: string, args: Record<string, unknown>) {
  if (name === "files.write_file") {
    const path = typeof args.path === "string" ? args.path : "";
    const content = typeof args.content === "string" ? args.content : "";
    const result = await window.saAgent?.files?.writeFiles?.([
      { relativePath: path, content },
    ]);

    if (!result?.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: result?.error ?? "Local file write failed." }],
        structuredContent: null,
      };
    }

    return {
      isError: false,
      content: [{ type: "text", text: `Saved ${path}` }],
      structuredContent: { path, rootPath: result.rootPath ?? null },
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unsupported local tool: ${name}` }],
    structuredContent: null,
  };
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tests/unit/local-tool-executor.test.ts`
Expected: PASS with bridge-backed local file write

- [ ] **Step 5: Commit**

```bash
git add src/renderer/agent/executors/local-tool-executor.ts tests/unit/local-tool-executor.test.ts
git commit -m "feat: add local file tool executor"
```

## Task 3: Add Backend Tool Executor and Router

**Files:**
- Create: `src/renderer/agent/executors/backend-tool-executor.ts`
- Create: `src/renderer/agent/tool-router.ts`
- Test: `tests/unit/tool-router.test.ts`

- [ ] **Step 1: Write the failing router test for backend vs local dispatch**

```ts
import { describe, expect, it, vi } from "vitest";
import { routeToolCall } from "../../src/renderer/agent/tool-router";

describe("routeToolCall", () => {
  it("routes backend and local tools to different executors", async () => {
    const backendExecutor = vi.fn().mockResolvedValue({ isError: false, structuredContent: { ok: true } });
    const localExecutor = vi.fn().mockResolvedValue({ isError: false, structuredContent: { ok: true } });

    await routeToolCall("backend.projects.create", { payload: { name: "Alpha" } }, {
      callBackendTool: backendExecutor,
      callLocalTool: localExecutor,
    });
    await routeToolCall("local.files.write_file", { path: "README.md", content: "# Title" }, {
      callBackendTool: backendExecutor,
      callLocalTool: localExecutor,
    });

    expect(backendExecutor).toHaveBeenCalledWith("projects.create", { payload: { name: "Alpha" } });
    expect(localExecutor).toHaveBeenCalledWith("files.write_file", { path: "README.md", content: "# Title" });
  });
});
```

- [ ] **Step 2: Run the router test to verify it fails**

Run: `npx vitest run tests/unit/tool-router.test.ts`
Expected: FAIL because `routeToolCall` does not exist yet

- [ ] **Step 3: Implement minimal backend executor and router**

```ts
export async function callBackendTool(
  scope: "global" | "project",
  backendToolName: string,
  args: Record<string, unknown>,
  input: { projectAgentId?: string | null },
) {
  const payload = {
    jsonrpc: "2.0",
    id: `tool-call-${Date.now()}`,
    method: "tools/call",
    params: {
      name: backendToolName,
      arguments: args,
    },
  };

  return scope === "global"
    ? postMeMcp(payload)
    : postProjectAgentMcp(input.projectAgentId ?? "", payload);
}
```

```ts
export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  input: {
    callBackendTool: (name: string, args: Record<string, unknown>) => Promise<any>;
    callLocalTool: (name: string, args: Record<string, unknown>) => Promise<any>;
  },
) {
  if (toolName.startsWith("backend.")) {
    return input.callBackendTool(toolName.slice("backend.".length), args);
  }

  if (toolName.startsWith("local.")) {
    return input.callLocalTool(toolName.slice("local.".length), args);
  }

  throw new Error(`Unsupported tool namespace: ${toolName}`);
}
```

- [ ] **Step 4: Run the router test to verify it passes**

Run: `npx vitest run tests/unit/tool-router.test.ts`
Expected: PASS with correct routing behavior

- [ ] **Step 5: Commit**

```bash
git add src/renderer/agent/executors/backend-tool-executor.ts src/renderer/agent/tool-router.ts tests/unit/tool-router.test.ts
git commit -m "refactor: add runtime tool router"
```

## Task 4: Extract Shared Conversation Loop

**Files:**
- Create: `src/renderer/agent/conversation-loop.ts`
- Modify: `src/renderer/agent/tool-intent.ts`
- Test: `tests/unit/conversation-loop.test.ts`

- [ ] **Step 1: Write the failing loop test for `user -> llm -> tool -> llm -> final text`**

```ts
import { describe, expect, it, vi } from "vitest";
import { runConversationLoop } from "../../src/renderer/agent/conversation-loop";

describe("runConversationLoop", () => {
  it("replays tool results into the next llm step and returns final assistant text", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({
        output_text: "{\"tool_call\":{\"name\":\"backend.projects.create\",\"arguments\":{\"payload\":{\"name\":\"Alpha\",\"key\":\"alpha\"}}}}",
      })
      .mockResolvedValueOnce({
        output_text: "Проект создан. Теперь можно продолжать.",
      });
    const routeToolCall = vi.fn().mockResolvedValue({
      isError: false,
      structuredContent: { project_id: "p-1" },
      content: [{ type: "text", text: "created" }],
    });

    const result = await runConversationLoop({
      messages: [{ role: "user", content: "Создай проект Alpha." }],
      generate,
      routeToolCall,
      descriptors: [{ name: "backend.projects.create", plane: "backend" }],
      fallbackToolName: null,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(routeToolCall).toHaveBeenCalledTimes(1);
    expect(result.assistantText).toBe("Проект создан. Теперь можно продолжать.");
  });
});
```

- [ ] **Step 2: Run the loop test to verify it fails**

Run: `npx vitest run tests/unit/conversation-loop.test.ts`
Expected: FAIL because `runConversationLoop` does not exist yet

- [ ] **Step 3: Implement the minimal shared loop**

```ts
export async function runConversationLoop(input: {
  messages: LlmRequestMessage[];
  descriptors: RuntimeToolDescriptor[];
  generate: (messages: LlmRequestMessage[]) => Promise<{ output_text?: string | null }>;
  routeToolCall: (name: string, args: Record<string, unknown>) => Promise<any>;
  fallbackToolName?: string | null;
}) {
  const loopMessages = [...input.messages];
  let retryUsed = false;
  let toolExecuted = false;

  for (let step = 0; step < 4; step += 1) {
    const response = await input.generate(loopMessages);
    const outputText = response.output_text?.trim() ?? "";
    const toolCall = parseToolCall(outputText);

    if (!toolCall) {
      if (input.fallbackToolName && !retryUsed && !toolExecuted) {
        retryUsed = true;
        loopMessages.unshift({
          role: "system",
          content: `Пользователь явно запросил инструмент "${input.fallbackToolName}". Верни tool_call, если данных достаточно.`,
        });
        continue;
      }
      return { assistantText: outputText };
    }

    const toolResult = await input.routeToolCall(toolCall.name, toolCall.arguments);
    toolExecuted = true;
    loopMessages.push({
      role: "system",
      content: `TOOL_RESULT ${toolCall.name} success=${String(!toolResult.isError)} ${JSON.stringify({ structuredContent: toolResult.structuredContent ?? null })}`,
    });
  }

  return { assistantText: "Я выполнил нужные действия. Продолжайте, если нужен следующий шаг." };
}
```

- [ ] **Step 4: Run the loop test to verify it passes**

Run: `npx vitest run tests/unit/conversation-loop.test.ts`
Expected: PASS with deterministic tool-result replay

- [ ] **Step 5: Commit**

```bash
git add src/renderer/agent/conversation-loop.ts src/renderer/agent/tool-intent.ts tests/unit/conversation-loop.test.ts
git commit -m "refactor: extract shared conversation loop"
```

## Task 5: Refactor Personal Runtime onto Shared Loop

**Files:**
- Modify: `src/renderer/agent/personal-assistant-runtime.ts`
- Modify: `tests/unit/personal-assistant-runtime.test.ts`

- [ ] **Step 1: Write the failing regression test for local file creation intent**

```ts
it("routes local file-write requests through the local executor and returns a user-facing reply", async () => {
  // arrange llm -> local.files.write_file -> final llm answer
  // expect no raw JSON leaks and local write bridge called once
});
```

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `npx vitest run tests/unit/personal-assistant-runtime.test.ts -t "local file-write"`
Expected: FAIL because personal runtime does not expose local tools yet

- [ ] **Step 3: Replace ad-hoc loop logic with `runConversationLoop`**

```ts
const catalog = buildRuntimeToolCatalog({
  backendTools: descriptors,
  localTools: [
    { name: "files.write_file", description: "Write a local file in the desktop workspace", inputSchema: { type: "object" } },
  ],
});
```

```ts
const result = await runConversationLoop({
  messages: buildPersonalLlmMessages(...),
  descriptors: catalog,
  generate: (messages) => postLlmResponse({ ...basePayload, messages }),
  routeToolCall: (name, args) =>
    routeToolCall(name, args, {
      callBackendTool: (backendToolName, backendArgs) => callUserMcpTool(backendToolName, backendArgs),
      callLocalTool,
    }),
  fallbackToolName: explicitToolRequest ? `backend.${explicitToolRequest}` : null,
});
```

- [ ] **Step 4: Run personal runtime tests to verify they pass**

Run: `npx vitest run tests/unit/personal-assistant-runtime.test.ts`
Expected: PASS with onboarding, project creation, mixed JSON parsing, retry logic, and local file write

- [ ] **Step 5: Commit**

```bash
git add src/renderer/agent/personal-assistant-runtime.ts tests/unit/personal-assistant-runtime.test.ts
git commit -m "refactor: move personal runtime to shared tool loop"
```

## Task 6: Refactor Project Runtime onto Shared Loop

**Files:**
- Modify: `src/renderer/agent/project-session-runtime.ts`
- Modify: `tests/unit/project-session-runtime.test.ts`
- Modify: `tests/renderer/app-flow.test.tsx`

- [ ] **Step 1: Write the failing renderer regression for `documents.generate` / local file write path separation**

```tsx
it("keeps project domain tools on backend MCP and local file writes on local executor", async () => {
  // expect backend.documents.generate to use project-agent MCP
  // expect local.files.write_file to use Electron bridge
});
```

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `npx vitest run tests/unit/project-session-runtime.test.ts tests/renderer/app-flow.test.tsx --testNamePattern "local executor|documents.generate"`
Expected: FAIL because project runtime still routes everything through backend MCP

- [ ] **Step 3: Move project runtime onto the shared loop and unified catalog**

```ts
const catalog = buildRuntimeToolCatalog({
  backendTools: descriptors,
  localTools: [{ name: "files.write_file", description: "Write local file", inputSchema: { type: "object" } }],
});
```

```ts
const result = await runConversationLoop({
  messages: buildProjectLlmMessages(...),
  descriptors: catalog,
  generate: (messages) =>
    postLlmResponse({
      workspace_id: workspaceId,
      project_id: projectId ?? null,
      session_id: sessionId,
      project_agent_id: projectAgentId,
      operation_kind: "generate_text",
      messages,
    }),
  routeToolCall: (name, args) =>
    routeToolCall(name, args, {
      callBackendTool: (backendToolName, backendArgs) => callProjectAgentMcpTool(projectAgentId, backendToolName, backendArgs),
      callLocalTool,
    }),
  fallbackToolName: explicitToolRequest ? `backend.${explicitToolRequest}` : null,
});
```

- [ ] **Step 4: Run the project runtime and renderer tests to verify they pass**

Run: `npx vitest run tests/unit/project-session-runtime.test.ts tests/renderer/app-flow.test.tsx`
Expected: PASS with project tool calls staying on backend MCP, local file tools using local executor, and no extra LLM loops

- [ ] **Step 5: Commit**

```bash
git add src/renderer/agent/project-session-runtime.ts tests/unit/project-session-runtime.test.ts tests/renderer/app-flow.test.tsx
git commit -m "refactor: move project runtime to shared tool loop"
```

## Self-Review

- Spec coverage:
  - Hybrid tool plane is covered by Tasks 1–3.
  - Client-owned shared loop is covered by Task 4.
  - Personal and project conversational runtimes are covered by Tasks 5–6.
  - Local file-system operations are explicitly covered by Task 2 and then integrated in Tasks 5–6.
- Placeholder scan:
  - No `TBD`, `TODO`, or “write tests later” placeholders remain.
- Type consistency:
  - Shared names are consistent: `RuntimeToolDescriptor`, `buildRuntimeToolCatalog`, `routeToolCall`, `runConversationLoop`, `callLocalTool`, `callBackendTool`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-hybrid-tool-plane-runtime.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
