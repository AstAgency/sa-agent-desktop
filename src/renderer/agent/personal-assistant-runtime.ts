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
import { completeWithStructuredTools } from "./model-adapter/llm-response-model";
import { allowLocalFileWrite } from "./local-tool-policy";
import {
  buildSkippedProfileMutationResult,
  isSkippedMutationResult,
  preparePersonalBackendToolCall,
} from "./personal-profile-tool-state";
import { resolveRuntimeApproval } from "./runtime-approvals";
import type { RuntimeStreamEvent } from "./runtime-events";
import { buildRuntimeToolCatalog } from "./tool-catalog";
import { mapToolResultToPromptMessage } from "./tool-result-prompt";
import { callLocalTool } from "./executors/local-tool-executor";
import { agentMessagesToSessionMessages, sessionMessagesToAgentMessages } from "./transcript";
import { postMeMcp } from "../lib/api";
import { recordDebugAgentRuntimeEntry } from "../lib/debug";
import type {
  LlmRequestMessage,
  McpToolCallResult,
  McpToolDescriptor,
  RuntimeToolDescriptor,
  SessionMessage,
  ViewerProfile,
} from "../lib/types";

const PERSONAL_ASSISTANT_MODEL: Model<"openai-completions"> = {
  id: "sa-agent-personal-assistant",
  name: "SA-Agent Personal Assistant",
  api: "openai-completions",
  provider: "sa-agent-personal-assistant",
  baseUrl: "http://assistant.local",
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

const USER_MCP_SERVER_NAME = "user";
const USER_MCP_RUNTIME_ID = "personal-assistant";
const MCP_TOOL_DISCOVERY_TIMEOUT_MS = 3_000;

type PersonalAssistantTurnResult = {
  assistantText: string;
  onboardingCompleted: boolean;
  projectCreated: boolean;
  createdProjectId: string | null;
  profileUpdated: boolean;
};

export class PersonalAssistantRuntime {
  private readonly agent: Agent;
  private readonly listeners = new Set<(event: RuntimeStreamEvent, signal?: AbortSignal) => Promise<void> | void>();
  private streamingAssistantText = "";
  private onboardingCompleted = false;
  private projectCreated = false;
  private createdProjectId: string | null = null;
  private profileUpdated = false;
  private currentProfile: ViewerProfile;
  private readonly successfulToolCallKeys = new Set<string>();
  private readonly appliedProfileMutationKeys = new Set<string>();
  private readonly runtimeDescriptors: RuntimeToolDescriptor[];

  static async create(input: {
    workspaceId: string;
    threadId: string;
    initialMessages: SessionMessage[];
    profile: ViewerProfile;
  }) {
    const descriptors = await resolveUserMcpTools();

    return new PersonalAssistantRuntime({
      ...input,
      descriptors,
    });
  }

  private constructor(
    private readonly input: {
      workspaceId: string;
      threadId: string;
      initialMessages: SessionMessage[];
      profile: ViewerProfile;
      descriptors: McpToolDescriptor[];
    },
  ) {
    this.currentProfile = input.profile;
    const runtimeDescriptors = buildPersonalRuntimeDescriptors(input.descriptors, allowLocalFileWrite(input.initialMessages));
    this.runtimeDescriptors = runtimeDescriptors;
    this.agent = new Agent({
      initialState: {
        systemPrompt: "",
        model: PERSONAL_ASSISTANT_MODEL,
        messages: sessionMessagesToAgentMessages(input.initialMessages, PERSONAL_ASSISTANT_MODEL),
        tools: buildAgentTools({
          descriptors: runtimeDescriptors,
          executeBackendTool: (toolName, args) => this.executeBackendTool(toolName, args),
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
        const toolCallKey = createToolCallKey(toolCall.name, toolCall.arguments);
        if (!isError) {
          this.successfulToolCallKeys.add(toolCallKey);
        }
        if (toolCall.name === "backend.profile.complete_onboarding" && !isError && !isSkippedMutationResult(result.details)) {
          this.onboardingCompleted = true;
          this.profileUpdated = true;
          this.currentProfile = applyProfileMutation(this.currentProfile, result.details, {
            onboarding_completed: true,
            ...(readProfilePayload(toolCall.arguments) ?? {}),
          });
        }
        if (toolCall.name === "backend.profile.update" && !isError && !isSkippedMutationResult(result.details)) {
          this.profileUpdated = true;
          this.currentProfile = applyProfileMutation(this.currentProfile, result.details, readProfilePayload(toolCall.arguments));
        }
        if ((toolCall.name === "backend.projects.create" || toolCall.name === "backend.projects_create") && !isError) {
          this.projectCreated = true;
          this.createdProjectId = readCreatedProjectId(result.details);
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

  replaceTranscript(messages: SessionMessage[]) {
    this.agent.state.messages = sessionMessagesToAgentMessages(messages, PERSONAL_ASSISTANT_MODEL);
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

  private async executeBackendTool(toolName: string, args: Record<string, unknown>) {
    const workspaceArgs = injectWorkspaceId(toolName, args, this.input.workspaceId);
    const prepared = preparePersonalBackendToolCall({
      toolName,
      args: workspaceArgs,
      currentProfile: this.currentProfile,
      appliedMutationKeys: this.appliedProfileMutationKeys,
    });

    if (prepared.skip) {
      return buildSkippedProfileMutationResult(toolName, this.currentProfile);
    }

    const result = await callUserMcpTool(toolName, prepared.args);
    if (!result.isError && prepared.dedupeKey) {
      this.appliedProfileMutationKeys.add(prepared.dedupeKey);
    }

    return result;
  }

  getTranscriptAsSessionMessages() {
    return agentMessagesToSessionMessages(this.agent.state.messages, this.input.threadId);
  }

  async continueFromTranscript(): Promise<PersonalAssistantTurnResult> {
    this.streamingAssistantText = "";
    this.onboardingCompleted = false;
    this.projectCreated = false;
    this.createdProjectId = null;
    this.profileUpdated = false;
    this.successfulToolCallKeys.clear();
    await this.agent.continue();

    const lastAssistant = [...this.agent.state.messages].reverse().find((message) => message.role === "assistant") as AssistantMessage | undefined;
    const assistantText = lastAssistant ? readAssistantText(lastAssistant) : "";

    return {
      assistantText,
      onboardingCompleted: this.onboardingCompleted,
      projectCreated: this.projectCreated,
      createdProjectId: this.createdProjectId,
      profileUpdated: this.profileUpdated,
    };
  }

  private streamTurn(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    const stream = createAssistantMessageEventStream();
    const partial = buildPartialAssistantMessage();
    const latestMessage = context.messages[context.messages.length - 1];

    void (async () => {
      if (!latestMessage) {
        await emitText(stream, partial, "Контекст диалога пуст. Начните с сообщения пользователю.", options);
        return;
      }

      if (latestMessage.role !== "user" && latestMessage.role !== "toolResult") {
        await emitText(stream, partial, "Я готов продолжить. Напишите, что нужно сделать дальше.", options);
        return;
      }

      const response = await completeWithStructuredTools({
        workspaceId: this.input.workspaceId,
        threadId: this.input.threadId,
        messages: buildPersonalLlmMessages(this.input.workspaceId, this.currentProfile, context.messages),
        tools: this.runtimeDescriptors,
      });

      if (shouldUseNarrationInsteadOfRepeatedToolCall(response.toolCalls, response.outputText, this.successfulToolCallKeys)) {
        await emitText(stream, partial, response.outputText, options);
        return;
      }

      await emitAssistantResponse(stream, partial, response.content, normalizeAssistantStopReason(response.finishReason), options, (value) => {
        this.streamingAssistantText = value;
      });
    })()
      .catch(async (error) => {
        await emitText(
          stream,
          partial,
          error instanceof Error ? error.message : "Не удалось продолжить диалог ассистента.",
          options,
        );
      });

    return stream;
  }
}

async function resolveUserMcpTools() {
  try {
    return await Promise.race([
      listUserMcpTools(),
      new Promise<McpToolDescriptor[]>((resolve) => {
        window.setTimeout(() => resolve([]), MCP_TOOL_DISCOVERY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return [];
  }
}

async function listUserMcpTools() {
  const response = await postMeMcp({
    jsonrpc: "2.0",
    id: `tools-list-${Date.now()}`,
    method: "tools/list",
    params: {},
  });

  const tools = Array.isArray((response as { result?: { tools?: unknown[] } }).result?.tools)
    ? (response as { result: { tools: Array<Record<string, unknown>> } }).result.tools
    : [];

  return tools.map((tool) => ({
    serverName: USER_MCP_SERVER_NAME,
    name: typeof tool.name === "string" ? tool.name : "unknown",
    title: typeof tool.title === "string" ? tool.title : null,
    description: typeof tool.description === "string" ? tool.description : null,
    inputSchema: typeof tool.inputSchema === "object" && tool.inputSchema !== null ? tool.inputSchema as Record<string, unknown> : null,
  }));
}

async function callUserMcpTool(toolName: string, argumentsJson: Record<string, unknown>): Promise<McpToolCallResult> {
  recordDebugAgentRuntimeEntry({
    id: `personal-mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    type: "mcp.tools.call",
    sessionId: USER_MCP_RUNTIME_ID,
    data: {
      server: USER_MCP_SERVER_NAME,
      toolName,
      arguments: argumentsJson,
    },
  });
  const response = await postMeMcp({
    jsonrpc: "2.0",
    id: `tool-call-${Date.now()}`,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: argumentsJson,
    },
  });

  const result = (response as { result?: Record<string, unknown> }).result ?? {};
  recordDebugAgentRuntimeEntry({
    id: `personal-mcp-result-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    type: "mcp.tools.result",
    sessionId: USER_MCP_RUNTIME_ID,
    data: {
      server: USER_MCP_SERVER_NAME,
      toolName,
      isError: Boolean(result.isError),
    },
  });

  return {
    serverName: USER_MCP_SERVER_NAME,
    toolName,
    content: Array.isArray(result.content) ? result.content as McpToolCallResult["content"] : [],
    structuredContent: result.structuredContent ?? null,
    isError: Boolean(result.isError),
  };
}

function buildPersonalLlmMessages(
  workspaceId: string,
  profile: ViewerProfile,
  messages: Message[],
): LlmRequestMessage[] {
  const systemPrompt = [
    "Ты SA-Agent, персональный ассистент рабочего пространства.",
    "Отвечай на языке пользователя, обычно на русском.",
    "Если для ответа нужен инструмент, вызывай подходящий tool из доступного каталога.",
    "После получения результата инструмента дай нормальный user-facing ответ и не показывай внутренние payload.",
    "Локальную запись файла выполняй только когда пользователь явно попросил сохранить файл.",
    `Используй active workspace_id=${workspaceId} для операций рабочего пространства и создания проектов.`,
    `Активное рабочее пространство: ${JSON.stringify({ workspace_id: workspaceId })}`,
    `Профиль пользователя: ${JSON.stringify({
      display_name: profile.display_name,
      preferred_user_name: profile.preferred_user_name,
      preferred_agent_name: profile.preferred_agent_name,
      activity_domain: profile.activity_domain,
      onboarding_completed: profile.onboarding_completed,
      onboarding_payload: profile.onboarding_payload,
    })}`,
  ].filter(Boolean).join("\n");

  return [
    { role: "system", content: systemPrompt },
    ...messages.flatMap((message) => {
      const mapped = mapLlmMessage(message);
      return mapped ? [mapped] : [];
    }),
  ];
}

function mapLlmMessage(message: Message): LlmRequestMessage | null {
  if (message.role === "user") {
    return { role: "user", content: readUserText(message) };
  }

  if (message.role === "assistant") {
    const text = readAssistantText(message);
    return text.trim().length > 0 ? { role: "assistant", content: text } : null;
  }

  if (message.role === "toolResult") {
    return mapToolResultToPromptMessage(message, {
      normalizeToolName: normalizeToolResultName,
      omitToolNames: new Set(["backend.profile.update", "backend.profile.complete_onboarding"]),
    });
  }

  return { role: "system", content: JSON.stringify(message) };
}

function injectWorkspaceId(toolName: string, argumentsJson: Record<string, unknown>, workspaceId: string) {
  if (
    toolName !== "projects.create" &&
    toolName !== "projects_create" &&
    toolName !== "backend.projects.create" &&
    toolName !== "backend.projects_create"
  ) {
    return argumentsJson;
  }

  const payload =
    typeof argumentsJson.payload === "object" && argumentsJson.payload !== null
      ? { ...(argumentsJson.payload as Record<string, unknown>) }
      : {};

  payload.workspace_id = workspaceId;

  return {
    ...argumentsJson,
    payload,
  };
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
    api: PERSONAL_ASSISTANT_MODEL.api,
    provider: PERSONAL_ASSISTANT_MODEL.provider,
    model: PERSONAL_ASSISTANT_MODEL.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
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
  if (toolName.startsWith(`${USER_MCP_SERVER_NAME}.`)) {
    return `backend.${toolName.slice(`${USER_MCP_SERVER_NAME}.`.length)}`;
  }

  return toolName;
}

function normalizeAssistantStopReason(stopReason: string) {
  return stopReason === "length" || stopReason === "toolUse" ? stopReason : "stop";
}

function shouldUseNarrationInsteadOfRepeatedToolCall(
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> | null | undefined,
  outputText: string,
  successfulToolCallKeys: Set<string>,
) {
  return Boolean(
    outputText.trim().length > 0
    && Array.isArray(toolCalls)
    && toolCalls.length > 0
    && toolCalls.every((toolCall) => successfulToolCallKeys.has(createToolCallKey(toolCall.name, toolCall.arguments))),
  );
}

function createToolCallKey(toolName: string, args: unknown) {
  return `${toolName}:${stableJson(args)}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function readProfilePayload(args: unknown) {
  if (!args || typeof args !== "object") {
    return null;
  }
  const payload = (args as Record<string, unknown>).payload;
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
}

function applyProfileMutation(
  currentProfile: ViewerProfile,
  details: unknown,
  fallbackPatch?: Record<string, unknown> | null,
): ViewerProfile {
  const canonical = readCanonicalProfile(details);
  if (canonical) {
    return {
      ...currentProfile,
      ...canonical,
      updated_at: canonical.updated_at ?? currentProfile.updated_at,
    };
  }

  if (!fallbackPatch) {
    return currentProfile;
  }

  return {
    ...currentProfile,
    display_name: readOptionalString(fallbackPatch.display_name, currentProfile.display_name),
    preferred_user_name: readOptionalString(fallbackPatch.preferred_user_name, currentProfile.preferred_user_name),
    preferred_agent_name: readOptionalString(fallbackPatch.preferred_agent_name, currentProfile.preferred_agent_name),
    activity_domain: readOptionalString(fallbackPatch.activity_domain, currentProfile.activity_domain),
    onboarding_completed: typeof fallbackPatch.onboarding_completed === "boolean" ? fallbackPatch.onboarding_completed : currentProfile.onboarding_completed,
    onboarding_payload: readOptionalRecord(fallbackPatch.onboarding_payload, currentProfile.onboarding_payload ?? null),
  };
}

function readCanonicalProfile(details: unknown) {
  if (!details || typeof details !== "object") {
    return null;
  }
  const result = (details as Record<string, unknown>).result;
  return result && typeof result === "object" ? result as Partial<ViewerProfile> : null;
}

function readOptionalString(value: unknown, fallback: string | null) {
  return typeof value === "string" ? value : fallback;
}

function readOptionalRecord(
  value: unknown,
  fallback: Record<string, unknown> | null,
) {
  return value && typeof value === "object" ? value as Record<string, unknown> : fallback;
}

function buildPersonalRuntimeDescriptors(descriptors: McpToolDescriptor[], includeLocalFileWrite: boolean) {
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

function readCreatedProjectId(details: unknown) {
  if (!details || typeof details !== "object") {
    return null;
  }
  if (typeof (details as { project_id?: unknown }).project_id === "string") {
    return (details as { project_id: string }).project_id;
  }
  const result = (details as { result?: unknown }).result;
  if (result && typeof result === "object" && typeof (result as { project_id?: unknown }).project_id === "string") {
    return (result as { project_id: string }).project_id;
  }
  return null;
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
