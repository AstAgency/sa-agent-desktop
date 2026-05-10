import { Agent } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Message,
  type Model,
  type StreamOptions,
  type TextContent,
  type ToolCall,
  type UserMessage,
} from "@earendil-works/pi-ai";
import { buildAgentTools } from "./agent-tools";
import { allowLocalFileWrite } from "./local-tool-policy";
import { completeWithStructuredTools } from "./model-adapter/llm-response-model";
import { resolveRuntimeApproval } from "./runtime-approvals";
import type { RuntimeStreamEvent } from "./runtime-events";
import { buildRuntimeToolCatalog } from "./tool-catalog";
import { mapToolResultToPromptMessage } from "./tool-result-prompt";
import { callLocalTool } from "./executors/local-tool-executor";
import { sessionMessagesToAgentMessages } from "./transcript";
import { postProjectAgentMcp } from "../lib/api";
import { recordDebugAgentRuntimeEntry } from "../lib/debug";
import type { LlmRequestMessage, McpToolCallResult, McpToolDescriptor, RuntimeToolDescriptor, SessionMessage } from "../lib/types";
const PROJECT_MCP_DISCOVERY_TIMEOUT_MS = 3_000;

const PROJECT_SESSION_MODEL: Model<"openai-completions"> = {
  id: "sa-agent-project-session",
  name: "SA-Agent Project Session",
  api: "openai-completions",
  provider: "sa-agent-project-session",
  baseUrl: "http://project-session.local",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 128_000,
  maxTokens: 8_000,
};

type ProjectSessionTurnResult = {
  assistantText: string;
  projectOnboardingCompleted: boolean;
};

export class ProjectSessionRuntime {
  private readonly agent: Agent;
  private readonly listeners = new Set<(event: RuntimeStreamEvent, signal?: AbortSignal) => Promise<void> | void>();
  private readonly runtimeDescriptors: RuntimeToolDescriptor[];
  private streamingAssistantText = "";
  private projectOnboardingCompleted = false;

  static async create(input: {
    workspaceId: string;
    projectId?: string | null;
    sessionId: string;
    initialMessages: SessionMessage[];
    projectAgentId: string;
    capabilityKey?: string | null;
    projectName?: string | null;
  }) {
    const descriptors = await resolveProjectMcpTools(input.projectAgentId);
    return new ProjectSessionRuntime({ ...input, descriptors });
  }

  private constructor(
    private readonly input: {
      workspaceId: string;
      projectId?: string | null;
      sessionId: string;
      initialMessages: SessionMessage[];
      projectAgentId: string;
      capabilityKey?: string | null;
      projectName?: string | null;
      descriptors: McpToolDescriptor[];
    },
  ) {
    this.runtimeDescriptors = buildProjectRuntimeDescriptors(input.descriptors, allowLocalFileWrite(input.initialMessages));
    this.agent = new Agent({
      initialState: {
        systemPrompt: "",
        model: PROJECT_SESSION_MODEL,
        messages: sessionMessagesToAgentMessages(input.initialMessages, PROJECT_SESSION_MODEL),
        tools: buildAgentTools({
          descriptors: this.runtimeDescriptors,
          executeBackendTool: (toolName, args) => callProjectAgentMcpTool(input.projectAgentId, toolName, args),
          executeLocalTool: callLocalTool,
        }),
      },
      convertToLlm: (messages) => messages as Message[],
      streamFn: (_model, context, options) => this.streamTurn(context, options),
      toolExecution: "sequential",
      beforeToolCall: async ({ toolCall }) => resolveRuntimeApproval({
        toolName: toolCall.name,
        emit: (event) => this.notifyListeners(event),
      }),
      afterToolCall: async ({ toolCall, result, isError }) => {
        if (toolCall.name === "backend.project.bootstrap.complete" && !isError) {
          this.projectOnboardingCompleted = true;
        }

        return {
          content: result.content,
          details: result.details,
          isError,
        };
      },
    });

    this.agent.subscribe((event, signal) => this.notifyListeners(event, signal));
  }

  subscribe(listener: (event: RuntimeStreamEvent, signal?: AbortSignal) => Promise<void> | void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStreamingAssistantText() {
    return this.streamingAssistantText;
  }

  private notifyListeners(event: RuntimeStreamEvent, signal?: AbortSignal) {
    this.listeners.forEach((listener) => {
      void listener(event, signal);
    });
  }

  isStreaming() {
    return this.agent.state.isStreaming;
  }

  async continueFromTranscript(): Promise<ProjectSessionTurnResult> {
    this.streamingAssistantText = "";
    this.projectOnboardingCompleted = false;
    await this.agent.continue();

    const lastAssistant = [...this.agent.state.messages].reverse().find((message) => message.role === "assistant") as AssistantMessage | undefined;
    return {
      assistantText: lastAssistant ? readAssistantText(lastAssistant) : "",
      projectOnboardingCompleted: this.projectOnboardingCompleted,
    };
  }

  private streamTurn(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    const stream = createAssistantMessageEventStream();
    const partial = buildPartialAssistantMessage();
    const latestMessage = context.messages[context.messages.length - 1];

    void (async () => {
      if (!latestMessage) {
        await emitText(stream, partial, "Контекст проектного диалога пуст. Начните с сообщения пользователю.", options);
        return;
      }

      if (latestMessage.role !== "user" && latestMessage.role !== "toolResult") {
        await emitText(stream, partial, "Я готов продолжить работу по проекту. Опишите задачу или уточните контекст.", options);
        return;
      }

      const response = await completeWithStructuredTools({
        workspaceId: this.input.workspaceId,
        projectId: this.input.projectId,
        sessionId: this.input.sessionId,
        projectAgentId: this.input.projectAgentId,
        messages: buildProjectLlmMessages({
          workspaceId: this.input.workspaceId,
          projectId: this.input.projectId,
          sessionId: this.input.sessionId,
          projectAgentId: this.input.projectAgentId,
          capabilityKey: this.input.capabilityKey,
          projectName: this.input.projectName,
        }, context.messages),
        tools: this.runtimeDescriptors,
      });

      await emitAssistantResponse(stream, partial, response.content, normalizeAssistantStopReason(response.finishReason), options, (value) => {
        this.streamingAssistantText = value;
      });
    })().catch(async (error) => {
      await emitText(
        stream,
        partial,
        error instanceof Error ? error.message : "Не удалось продолжить проектный диалог.",
        options,
      );
    });

    return stream;
  }
}

async function resolveProjectMcpTools(projectAgentId: string) {
  try {
    return await Promise.race([
      listProjectMcpTools(projectAgentId),
      new Promise<McpToolDescriptor[]>((resolve) => {
        window.setTimeout(() => resolve([]), PROJECT_MCP_DISCOVERY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return [];
  }
}

async function listProjectMcpTools(projectAgentId: string) {
  const response = await postProjectAgentMcp(projectAgentId, {
    jsonrpc: "2.0",
    id: `project-tools-list-${Date.now()}`,
    method: "tools/list",
    params: {},
  });

  const tools = Array.isArray((response as { result?: { tools?: unknown[] } }).result?.tools)
    ? (response as { result: { tools: Array<Record<string, unknown>> } }).result.tools
    : [];

  return tools.map((tool) => ({
    serverName: "project",
    name: typeof tool.name === "string" ? tool.name : "unknown",
    title: typeof tool.title === "string" ? tool.title : null,
    description: typeof tool.description === "string" ? tool.description : null,
    inputSchema: typeof tool.inputSchema === "object" && tool.inputSchema !== null ? tool.inputSchema as Record<string, unknown> : null,
  }));
}

async function callProjectAgentMcpTool(projectAgentId: string, toolName: string, argumentsJson: Record<string, unknown>) {
  recordDebugAgentRuntimeEntry({
    id: `project-mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    type: "mcp.tools.call",
    sessionId: projectAgentId,
    data: {
      toolName,
      arguments: argumentsJson,
    },
  });
  const response = await postProjectAgentMcp(projectAgentId, {
    jsonrpc: "2.0",
    id: `project-tool-call-${Date.now()}`,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: argumentsJson,
    },
  });

  const result = (response as { result?: Record<string, unknown> }).result ?? {};
  recordDebugAgentRuntimeEntry({
    id: `project-mcp-result-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    type: "mcp.tools.result",
    sessionId: projectAgentId,
    data: {
      toolName,
      isError: Boolean(result.isError),
    },
  });
  return {
    serverName: "project",
    toolName,
    isError: Boolean(result.isError),
    content: Array.isArray(result.content) ? result.content as McpToolCallResult["content"] : [],
    structuredContent: result.structuredContent ?? null,
  };
}

function buildProjectLlmMessages(
  input: {
    workspaceId: string;
    projectId?: string | null;
    sessionId: string;
    projectAgentId: string;
    capabilityKey?: string | null;
    projectName?: string | null;
  },
  messages: Message[],
): LlmRequestMessage[] {
  const systemPrompt = [
    "Ты SA-Agent, проектный ассистент рабочего пространства.",
    "Отвечай пользователю на его языке.",
    "Если нужен инструмент, вызывай подходящий tool из доступного каталога.",
    "После получения результата инструмента дай нормальный user-facing ответ и не показывай внутренние payload.",
    "Локальную запись файла выполняй только когда пользователь явно попросил сохранить файл.",
    `Текущий проект: ${JSON.stringify({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      session_id: input.sessionId,
      project_agent_id: input.projectAgentId,
      capability_key: input.capabilityKey,
      project_name: input.projectName,
    })}`,
    "Для project_onboarding используй project.bootstrap.complete, когда собран достаточный контекст.",
    "Для сохранения контекста используй project.context.upsert.",
  ].filter(Boolean).join("\n");

  return [
    { role: "system", content: systemPrompt },
    ...messages.flatMap((message) => {
      const mapped = mapProjectLlmMessage(message);
      return mapped ? [mapped] : [];
    }),
  ];
}

function mapProjectLlmMessage(message: Message): LlmRequestMessage | null {
  if (message.role === "user") {
    return { role: "user", content: readUserText(message) };
  }
  if (message.role === "assistant") {
    return { role: "assistant", content: readAssistantText(message) };
  }
  if (message.role === "toolResult") {
    return mapToolResultToPromptMessage(message, {
      normalizeToolName: normalizeToolResultName,
    });
  }

  return { role: "system", content: JSON.stringify(message) };
}

function readUserText(message: UserMessage) {
  return typeof message.content === "string"
    ? message.content
    : message.content.map((item) => ("text" in item ? item.text : "")).join("");
}

function readAssistantText(message: AssistantMessage) {
  return message.content.map((item) => (item.type === "text" ? item.text : "")).join("");
}

function buildPartialAssistantMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: PROJECT_SESSION_MODEL.api,
    provider: PROJECT_SESSION_MODEL.provider,
    model: PROJECT_SESSION_MODEL.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

async function emitAssistantResponse(
  stream: AssistantMessageEventStream,
  partial: AssistantMessage,
  content: Array<TextContent | ToolCall>,
  stopReason: "stop" | "length" | "toolUse",
  options: StreamOptions | undefined,
  setStreamingAssistantText: (value: string) => void,
) {
  const toolCalls = content.filter((item): item is ToolCall => item.type === "toolCall");

  if (toolCalls.length === 0) {
    const text = content
      .filter((item): item is TextContent => item.type === "text")
      .map((item) => item.text)
      .join("");
    await emitText(stream, partial, text, options, stopReason === "length" ? "length" : "stop", setStreamingAssistantText);
    return;
  }

  setStreamingAssistantText("");
  stream.push({ type: "start", partial });
  partial.content = content;

  for (const [contentIndex, item] of content.entries()) {
    if (item.type !== "toolCall") {
      continue;
    }

    stream.push({ type: "toolcall_start", contentIndex, partial });
    stream.push({ type: "toolcall_end", contentIndex, toolCall: item, partial });
  }

  partial.stopReason = stopReason;
  stream.push({
    type: "done",
    reason: stopReason,
    message: {
      ...partial,
      content,
      stopReason,
    },
  });
  stream.end();
}

async function emitText(
  stream: AssistantMessageEventStream,
  partial: AssistantMessage,
  text: string,
  options?: StreamOptions,
  stopReason: "stop" | "length" = "stop",
  setStreamingAssistantText?: (value: string) => void,
) {
  stream.push({ type: "start", partial });
  const content: TextContent = { type: "text", text: "" };
  partial.content = [content];
  stream.push({ type: "text_start", contentIndex: 0, partial });

  for (const chunk of splitTextForReveal(text)) {
    if (options?.signal?.aborted) {
      break;
    }
    content.text += chunk;
    if (setStreamingAssistantText) {
      setStreamingAssistantText(content.text);
    }
    stream.push({ type: "text_delta", contentIndex: 0, delta: chunk, partial });
    await waitMs(14, options?.signal);
  }

  partial.stopReason = stopReason;
  stream.push({ type: "text_end", contentIndex: 0, content: text, partial });
  stream.push({
    type: "done",
    reason: stopReason,
    message: {
      ...partial,
      content: [{ type: "text", text }],
      stopReason,
    },
  });
  stream.end();
}

function splitTextForReveal(value: string) {
  const parts = value.match(/.{1,12}(\s|$)|\S+/g);
  return parts && parts.length > 0 ? parts : [value];
}

function normalizeToolResultName(toolName: string) {
  if (toolName.startsWith("project.")) {
    return `backend.${toolName.slice("project.".length)}`;
  }

  return toolName;
}

function normalizeAssistantStopReason(stopReason: string) {
  return stopReason === "length" || stopReason === "toolUse" ? stopReason : "stop";
}

function buildProjectRuntimeDescriptors(descriptors: McpToolDescriptor[], includeLocalFileWrite: boolean): RuntimeToolDescriptor[] {
  return buildRuntimeToolCatalog({
    backendTools: descriptors,
    localTools: includeLocalFileWrite ? [
      {
        name: "files.write_file",
        description: "Write a local file in the desktop workspace",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    ] : [],
  });
}

function waitMs(durationMs: number, signal?: AbortSignal) {
  if (durationMs <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
