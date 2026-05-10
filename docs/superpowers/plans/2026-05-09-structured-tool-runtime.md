# Structured Tool Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current text-parsing tool orchestration with a structured `pi-agent-core` runtime that consumes backend `tool_calls`, executes `backend.*` and `local.*` tools predictably, and exposes UI-facing runtime events instead of model promises.

**Architecture:** Introduce a renderer-side model adapter for `/v1/llm/responses` that converts structured backend `tool_calls` into the assistant message format expected by `pi-ai` / `pi-agent-core`. Remove `runConversationLoop()` as the orchestration owner; build real `AgentTool[]` from backend and local descriptors, let `pi-agent-core` execute them, and map raw runtime events into stable shell events for the UI. Use `beforeToolCall` as the approval boundary.

**Tech Stack:** React, TypeScript, Electron preload bridge, Vitest, `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`

---

## File Structure

### Create

- `src/renderer/agent/model-adapter/llm-response-model.ts` — adapter that calls `/v1/llm/responses` and converts backend `tool_calls` into `pi-ai` assistant content blocks
- `src/renderer/agent/model-adapter/tool-call-mapping.ts` — focused helpers for mapping backend `tool_calls` into `pi-ai` tool call blocks
- `src/renderer/agent/runtime-events.ts` — convert raw `pi-agent-core` events into shell-friendly runtime events
- `src/renderer/agent/agent-tools.ts` — build real `AgentTool[]` from runtime descriptors and executors
- `tests/unit/llm-response-model.test.ts`
- `tests/unit/runtime-events.test.ts`
- `tests/unit/agent-tools.test.ts`

### Modify

- `src/renderer/lib/types.ts` — add structured LLM tool call types and runtime UI event types
- `src/renderer/lib/api.ts` — extend `LlmResponseInput` / `LlmResponseRecord` payload and response types
- `src/renderer/agent/personal-assistant-runtime.ts` — remove manual conversation loop and use model adapter + `AgentTool[]`
- `src/renderer/agent/project-session-runtime.ts` — same migration for project runtime
- `src/renderer/components/workspace-shell/conversationTurns.ts` — subscribe to runtime events instead of only assistant text
- `src/renderer/lib/debug.ts` — record structured runtime event traces
- `tests/unit/personal-assistant-runtime.test.ts`
- `tests/unit/project-session-runtime.test.ts`
- `tests/renderer/app-personal-assistant.test.tsx`
- `tests/renderer/app-project-runtime.test.tsx`

### Delete

- `src/renderer/agent/conversation-loop.ts` — legacy owner of orchestration

---

## Task 1: Add Structured `/v1/llm/responses` Types and Model Adapter

**Files:**
- Create: `src/renderer/agent/model-adapter/llm-response-model.ts`
- Create: `src/renderer/agent/model-adapter/tool-call-mapping.ts`
- Modify: `src/renderer/lib/types.ts`
- Modify: `src/renderer/lib/api.ts`
- Test: `tests/unit/llm-response-model.test.ts`

- [ ] **Step 1: Write the failing unit test for structured tool call mapping**

```ts
import { describe, expect, it } from "vitest";
import { mapLlmResponseToAssistantContent } from "../../src/renderer/agent/model-adapter/tool-call-mapping";

describe("mapLlmResponseToAssistantContent", () => {
  it("maps backend tool_calls into pi-ai assistant toolCall blocks", () => {
    const content = mapLlmResponseToAssistantContent({
      output_text: null,
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          name: "backend.projects.create",
          arguments: { payload: { name: "AST Systems" } },
        },
      ],
    });

    expect(content).toEqual([
      {
        type: "toolCall",
        id: "call-1",
        name: "backend.projects.create",
        arguments: { payload: { name: "AST Systems" } },
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npx vitest run tests/unit/llm-response-model.test.ts`
Expected: FAIL because the model adapter and tool-call mapping helpers do not exist yet

- [ ] **Step 3: Add structured LLM types and the minimal mapping helper**

```ts
export type LlmResponseToolCall = {
  id: string;
  type: "function";
  name: string;
  arguments: Record<string, unknown>;
};

export type LlmResponseRecord = {
  output_text?: string | null;
  finish_reason?: string | null;
  tool_calls?: LlmResponseToolCall[] | null;
  usage?: Record<string, unknown> | null;
  audit?: Record<string, unknown> | null;
};
```

```ts
export function mapLlmResponseToAssistantContent(
  response: Pick<LlmResponseRecord, "output_text" | "tool_calls">,
) {
  if (Array.isArray(response.tool_calls) && response.tool_calls.length > 0) {
    return response.tool_calls.map((toolCall) => ({
      type: "toolCall" as const,
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments ?? {},
    }));
  }

  return [
    {
      type: "text" as const,
      text: response.output_text ?? "",
    },
  ];
}
```

- [ ] **Step 4: Add the minimal `/v1/llm/responses` model adapter**

```ts
export async function completeWithStructuredTools(input: {
  workspaceId: string;
  projectId?: string | null;
  threadId?: string | null;
  sessionId?: string | null;
  projectAgentId?: string | null;
  messages: LlmRequestMessage[];
  tools: RuntimeToolDescriptor[];
}) {
  const response = await postLlmResponse({
    workspace_id: input.workspaceId,
    project_id: input.projectId ?? null,
    thread_id: input.threadId ?? null,
    session_id: input.sessionId ?? null,
    project_agent_id: input.projectAgentId ?? null,
    operation_kind: "generate_text",
    messages: input.messages,
    tools: input.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema ?? { type: "object", additionalProperties: true },
      },
    })),
    tool_choice: "auto",
  });

  return {
    content: mapLlmResponseToAssistantContent(response),
    finishReason: response.tool_calls?.length ? "toolUse" : (response.finish_reason ?? "stop"),
  };
}
```

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `npx vitest run tests/unit/llm-response-model.test.ts`
Expected: PASS with structured tool calls mapped into assistant content blocks

- [ ] **Step 6: Commit**

```bash
git add src/renderer/agent/model-adapter/llm-response-model.ts src/renderer/agent/model-adapter/tool-call-mapping.ts src/renderer/lib/types.ts src/renderer/lib/api.ts tests/unit/llm-response-model.test.ts
git commit -m "refactor: add structured llm response adapter"
```

## Task 2: Build Real `AgentTool[]` and Remove Manual Tool Routing Ownership

**Files:**
- Create: `src/renderer/agent/agent-tools.ts`
- Modify: `src/renderer/agent/executors/backend-tool-executor.ts`
- Modify: `src/renderer/agent/executors/local-tool-executor.ts`
- Modify: `src/renderer/lib/types.ts`
- Test: `tests/unit/agent-tools.test.ts`

- [ ] **Step 1: Write the failing unit test for runtime tools**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildAgentTools } from "../../src/renderer/agent/agent-tools";

describe("buildAgentTools", () => {
  it("builds executable AgentTool instances for backend and local tools", async () => {
    const tools = buildAgentTools({
      descriptors: [
        { name: "backend.projects.create", plane: "backend", backendName: "projects.create" },
        { name: "local.files.write_file", plane: "local", localName: "files.write_file" },
      ],
      executeBackendTool: vi.fn().mockResolvedValue({ isError: false, structuredContent: { ok: true } }),
      executeLocalTool: vi.fn().mockResolvedValue({ isError: false, structuredContent: { ok: true } }),
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "backend.projects.create",
      "local.files.write_file",
    ]);
  });
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npx vitest run tests/unit/agent-tools.test.ts`
Expected: FAIL because `buildAgentTools` does not exist yet

- [ ] **Step 3: Implement the minimal `AgentTool[]` builder**

```ts
export function buildAgentTools(input: {
  descriptors: RuntimeToolDescriptor[];
  executeBackendTool: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>;
  executeLocalTool: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>;
}) {
  return input.descriptors.map((descriptor) => ({
    name: descriptor.name,
    description: descriptor.description ?? "",
    parameters: descriptor.inputSchema ?? { type: "object", additionalProperties: true },
    execute: async (_toolCallId: string, args: Record<string, unknown>) => {
      return descriptor.plane === "backend"
        ? input.executeBackendTool(descriptor.backendName ?? descriptor.name, args)
        : input.executeLocalTool(descriptor.localName ?? descriptor.name, args);
    },
  }));
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tests/unit/agent-tools.test.ts`
Expected: PASS with both tool planes represented as executable runtime tools

- [ ] **Step 5: Commit**

```bash
git add src/renderer/agent/agent-tools.ts src/renderer/lib/types.ts tests/unit/agent-tools.test.ts
git commit -m "refactor: build runtime agent tools"
```

## Task 3: Migrate Personal Assistant Runtime to Runtime-Native Tool Execution

**Files:**
- Modify: `src/renderer/agent/personal-assistant-runtime.ts`
- Modify: `tests/unit/personal-assistant-runtime.test.ts`
- Modify: `tests/renderer/app-personal-assistant.test.tsx`

- [ ] **Step 1: Write the failing personal runtime test for structured tool calls**

```ts
it("executes structured backend tool_calls without parsing output_text", async () => {
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    if (input.endsWith("/v1/llm/responses")) {
      return jsonResponse({
        output_text: null,
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            name: "backend.profile.update",
            arguments: { payload: { preferred_user_name: "Мкртчян" } },
          },
        ],
      });
    }

    return jsonResponse({ jsonrpc: "2.0", id: "tool-call-1", result: { isError: false, structuredContent: { ok: true } } });
  });

  const runtime = await PersonalAssistantRuntime.create({
    workspaceId: "ws-1",
    threadId: "thread-1",
    initialMessages: [buildMessage("user", "Обнови профиль")],
    profile: buildProfile(),
  });

  const result = await runtime.continueFromTranscript();
  expect(result.onboardingCompleted).toBe(false);
});
```

- [ ] **Step 2: Run the personal runtime tests to verify they fail**

Run: `npx vitest run tests/unit/personal-assistant-runtime.test.ts tests/renderer/app-personal-assistant.test.tsx`
Expected: FAIL because the runtime still depends on `runConversationLoop()`

- [ ] **Step 3: Remove manual loop ownership from `personal-assistant-runtime.ts`**

```ts
this.agent = new Agent({
  initialState: {
    systemPrompt: "",
    model: PERSONAL_ASSISTANT_MODEL,
    messages: sessionMessagesToAgentMessages(input.initialMessages, PERSONAL_ASSISTANT_MODEL),
    tools: buildAgentTools({
      descriptors: buildRuntimeToolCatalog({
        backendTools: input.descriptors,
        localTools: [{ name: "files.write_file", description: "Write a local file", inputSchema: { type: "object" } }],
      }),
      executeBackendTool: (toolName, args) => callUserMcpTool(toolName, injectWorkspaceId(toolName, args, input.workspaceId)),
      executeLocalTool: callLocalTool,
    }),
  },
  convertToLlm: (messages) => messages as Message[],
  streamFn: (_model, context, _options) =>
    completeWithStructuredTools({
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      messages: buildPersonalLlmMessages(input.profile, context.messages),
      tools: buildRuntimeToolCatalog({
        backendTools: input.descriptors,
        localTools: [{ name: "files.write_file", description: "Write a local file", inputSchema: { type: "object" } }],
      }),
    }),
  toolExecution: "sequential",
});
```

- [ ] **Step 4: Remove `runConversationLoop()` usage and delete fallback parsing assertions from the tests**

```ts
expect(screen.queryByText(/"tool_call"/)).toBeNull();
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringMatching(/\/v1\/llm\/responses$/),
  expect.objectContaining({
    method: "POST",
    body: expect.stringContaining("\"tool_choice\":\"auto\""),
  }),
);
```

- [ ] **Step 5: Run the personal runtime tests to verify they pass**

Run: `npx vitest run tests/unit/personal-assistant-runtime.test.ts tests/renderer/app-personal-assistant.test.tsx`
Expected: PASS with structured `tool_calls` driving tool execution

- [ ] **Step 6: Commit**

```bash
git add src/renderer/agent/personal-assistant-runtime.ts tests/unit/personal-assistant-runtime.test.ts tests/renderer/app-personal-assistant.test.tsx
git commit -m "refactor: move personal runtime to structured tool calls"
```

## Task 4: Migrate Project Runtime to Runtime-Native Tool Execution

**Files:**
- Modify: `src/renderer/agent/project-session-runtime.ts`
- Modify: `tests/unit/project-session-runtime.test.ts`
- Modify: `tests/renderer/app-project-runtime.test.tsx`
- Modify: `tests/renderer/app-project-agent-switch.test.tsx`

- [ ] **Step 1: Write the failing project runtime test for structured tool calls**

```ts
it("executes structured project tool calls without parsing assistant text", async () => {
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    if (input.endsWith("/v1/llm/responses")) {
      return jsonResponse({
        output_text: null,
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            name: "backend.project.context.upsert",
            arguments: { key: "ctx-1", title: "Context", content_markdown: "Save context" },
          },
        ],
      });
    }

    return jsonResponse({ jsonrpc: "2.0", id: "tool-call-1", result: { isError: false, structuredContent: { item_id: "ctx-1" } } });
  });

  const runtime = await ProjectSessionRuntime.create({
    workspaceId: "ws-1",
    projectId: "p-1",
    sessionId: "session-p1",
    initialMessages: [buildMessage("user", "Сохрани контекст")],
    projectAgentId: "project-agent-1",
  });

  const result = await runtime.continueFromTranscript();
  expect(result.assistantText).toBeTruthy();
});
```

- [ ] **Step 2: Run the project runtime tests to verify they fail**

Run: `npx vitest run tests/unit/project-session-runtime.test.ts tests/renderer/app-project-runtime.test.tsx tests/renderer/app-project-agent-switch.test.tsx`
Expected: FAIL because project runtime still owns parts of the loop manually

- [ ] **Step 3: Mirror the personal runtime migration in `project-session-runtime.ts`**

```ts
tools: buildAgentTools({
  descriptors: buildRuntimeToolCatalog({
    backendTools: input.descriptors,
    localTools: [{ name: "files.write_file", description: "Write a local file", inputSchema: { type: "object" } }],
  }),
  executeBackendTool: (toolName, args) => callProjectAgentMcpTool(input.projectAgentId, toolName, args),
  executeLocalTool: callLocalTool,
}),
```

```ts
streamFn: (_model, context, _options) =>
  completeWithStructuredTools({
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    sessionId: input.sessionId,
    projectAgentId: input.projectAgentId,
    messages: buildProjectLlmMessages(input, context.messages),
    tools: buildRuntimeToolCatalog({
      backendTools: input.descriptors,
      localTools: [{ name: "files.write_file", description: "Write a local file", inputSchema: { type: "object" } }],
    }),
  }),
```

- [ ] **Step 4: Update the renderer tests to assert on real runtime-backed success**

```ts
expect(mcpBodies.some((payload) => payload.method === "tools/call")).toBe(true);
expect(llmBodies.some((payload) => String(payload.body ?? payload.messages ?? "").includes("tool_choice"))).toBe(true);
expect(screen.queryByText(/"tool_call"/)).toBeNull();
```

- [ ] **Step 5: Run the project runtime tests to verify they pass**

Run: `npx vitest run tests/unit/project-session-runtime.test.ts tests/renderer/app-project-runtime.test.tsx tests/renderer/app-project-agent-switch.test.tsx`
Expected: PASS with structured tool execution in project scope

- [ ] **Step 6: Commit**

```bash
git add src/renderer/agent/project-session-runtime.ts tests/unit/project-session-runtime.test.ts tests/renderer/app-project-runtime.test.tsx tests/renderer/app-project-agent-switch.test.tsx
git commit -m "refactor: move project runtime to structured tool calls"
```

## Task 5: Add Runtime Event Mapping and Shell Rendering Guards

**Files:**
- Create: `src/renderer/agent/runtime-events.ts`
- Modify: `src/renderer/components/workspace-shell/conversationTurns.ts`
- Modify: `src/renderer/lib/debug.ts`
- Test: `tests/unit/runtime-events.test.ts`

- [ ] **Step 1: Write the failing unit test for runtime event mapping**

```ts
import { describe, expect, it } from "vitest";
import { mapAgentEventToRuntimeEvent } from "../../src/renderer/agent/runtime-events";

describe("mapAgentEventToRuntimeEvent", () => {
  it("maps tool_execution_end to a confirmed tool completion event", () => {
    const mapped = mapAgentEventToRuntimeEvent({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "backend.projects.create",
      result: { isError: false, structuredContent: { project_id: "p-1" } },
    } as never);

    expect(mapped).toEqual({
      type: "tool_call_completed",
      tool: "backend.projects.create",
      title: "backend.projects.create",
      resultSummary: expect.any(String),
    });
  });
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npx vitest run tests/unit/runtime-events.test.ts`
Expected: FAIL because `runtime-events.ts` does not exist yet

- [ ] **Step 3: Implement the minimal event mapper**

```ts
export function mapAgentEventToRuntimeEvent(event: Record<string, unknown>) {
  if (event.type === "tool_execution_start") {
    return {
      type: "tool_call_started" as const,
      tool: String(event.toolName),
      title: String(event.toolName),
    };
  }

  if (event.type === "tool_execution_end") {
    const result = (event.result ?? {}) as { isError?: boolean; structuredContent?: unknown };
    return result.isError
      ? {
          type: "tool_call_failed" as const,
          tool: String(event.toolName),
          title: String(event.toolName),
          error: "Tool execution failed.",
          retryable: true,
        }
      : {
          type: "tool_call_completed" as const,
          tool: String(event.toolName),
          title: String(event.toolName),
          resultSummary: JSON.stringify(result.structuredContent ?? null),
        };
  }

  return null;
}
```

- [ ] **Step 4: Use the mapper in `conversationTurns.ts` and stop treating assistant copy as proof of tool success**

```ts
const unsubscribe = runtime.subscribe((event) => {
  const mapped = mapAgentEventToRuntimeEvent(event as never);
  if (mapped) {
    recordDebugAgentRuntimeEntry({
      id: createSessionFlowDebugId(),
      startedAt: new Date().toISOString(),
      type: mapped.type,
      sessionId: input.session.id,
      data: mapped,
    });
  }
});
```

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `npx vitest run tests/unit/runtime-events.test.ts`
Expected: PASS with tool execution events mapped into shell-friendly runtime events

- [ ] **Step 6: Commit**

```bash
git add src/renderer/agent/runtime-events.ts src/renderer/components/workspace-shell/conversationTurns.ts src/renderer/lib/debug.ts tests/unit/runtime-events.test.ts
git commit -m "feat: expose structured runtime events"
```

## Task 6: Add Approval Foundation Through `beforeToolCall`

**Files:**
- Modify: `src/renderer/lib/types.ts`
- Modify: `src/renderer/agent/personal-assistant-runtime.ts`
- Modify: `src/renderer/agent/project-session-runtime.ts`
- Modify: `src/renderer/components/workspace-shell/conversationTurns.ts`
- Modify: `tests/unit/personal-assistant-runtime.test.ts`
- Modify: `tests/unit/project-session-runtime.test.ts`

- [ ] **Step 1: Write the failing test for approval-required local file writes**

```ts
it("emits approval_required before executing a high-risk local file tool", async () => {
  const approvals: unknown[] = [];
  const runtime = await PersonalAssistantRuntime.create({
    workspaceId: "ws-1",
    threadId: "thread-1",
    initialMessages: [buildMessage("user", "Запиши файл в корень проекта")],
    profile: buildProfile(),
  });

  runtime.subscribe((event) => {
    if ((event as { type?: string }).type === "approval_required") approvals.push(event);
  });

  expect(approvals).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/personal-assistant-runtime.test.ts tests/unit/project-session-runtime.test.ts`
Expected: FAIL because approval events do not exist yet

- [ ] **Step 3: Add minimal approval policy state and `beforeToolCall` hook**

```ts
beforeToolCall: async ({ toolCall }) => {
  if (toolCall.name === "local.files.write_file") {
    throw Object.assign(new Error("approval_required"), {
      runtimeEvent: {
        type: "approval_required",
        approvalId: `approval-${Date.now()}`,
        tool: toolCall.name,
        title: toolCall.name,
        reason: "Local file write requires confirmation.",
        risk: "medium",
      },
    });
  }

  return undefined;
},
```

- [ ] **Step 4: Surface approval events into shell state without executing the tool**

```ts
if (error instanceof Error && (error as { runtimeEvent?: unknown }).runtimeEvent) {
  return {
    assistantText: "",
    pendingApproval: (error as { runtimeEvent: unknown }).runtimeEvent,
  };
}
```

- [ ] **Step 5: Run the approval tests to verify they pass**

Run: `npx vitest run tests/unit/personal-assistant-runtime.test.ts tests/unit/project-session-runtime.test.ts`
Expected: PASS with approval-required events emitted before risky tool execution

- [ ] **Step 6: Commit**

```bash
git add src/renderer/lib/types.ts src/renderer/agent/personal-assistant-runtime.ts src/renderer/agent/project-session-runtime.ts src/renderer/components/workspace-shell/conversationTurns.ts tests/unit/personal-assistant-runtime.test.ts tests/unit/project-session-runtime.test.ts
git commit -m "feat: add runtime approval foundation"
```

## Self-Review

### Spec coverage

- Structured `/v1/llm/responses` tool call contract -> Task 1
- `pi-agent-core` owns loop -> Tasks 3 and 4
- `backend.*` and `local.*` execution planes -> Task 2
- UI renders runtime events -> Task 5
- approval boundary -> Task 6
- removal of text parsing as primary mechanism -> Tasks 1, 3, 4

No spec gaps remain.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Every task includes exact file paths, commands, and concrete code.

### Type consistency

- `LlmResponseToolCall`, `RuntimeToolDescriptor`, and `McpToolCallResult` remain the shared types across adapter and runtime tasks.
- `backend.*` / `local.*` naming stays consistent in adapter, tool builder, and event mapper.

