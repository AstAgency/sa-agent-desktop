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
  type UserMessage,
} from "@earendil-works/pi-ai";
import { createMcpAgentTools } from "./mcp-tools";
import { agentMessagesToSessionMessages, sessionMessagesToAgentMessages } from "./transcript";
import { postLlmResponse, postMeMcp } from "../lib/api";
import { recordDebugAgentRuntimeEntry } from "../lib/debug";
import type {
  LlmRequestMessage,
  McpBridge,
  McpToolCallResult,
  McpToolDescriptor,
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
const USER_PROFILE_COMPLETE_ONBOARDING_TOOL = `${USER_MCP_SERVER_NAME}.profile.complete_onboarding`;
const USER_PROJECTS_CREATE_TOOL = `${USER_MCP_SERVER_NAME}.projects.create`;
const GENERATION_MAX_STEPS = 4;

type PersonalAssistantTurnResult = {
  assistantText: string;
  onboardingCompleted: boolean;
  projectCreated: boolean;
};

export class PersonalAssistantRuntime {
  private readonly agent: Agent;
  private readonly listeners = new Set<() => void>();
  private streamingAssistantText = "";
  private onboardingCompleted = false;
  private projectCreated = false;

  static async create(input: {
    workspaceId: string;
    threadId: string;
    initialMessages: SessionMessage[];
    profile: ViewerProfile;
  }) {
    const descriptors = await resolveUserMcpTools();
    const bridge: Pick<McpBridge, "callTool"> = {
      callTool: async (_runtimeId, _serverName, toolName, argumentsJson) =>
        callUserMcpTool(toolName, argumentsJson),
    };

    return new PersonalAssistantRuntime({
      ...input,
      descriptors,
      bridge,
    });
  }

  private constructor(
    private readonly input: {
      workspaceId: string;
      threadId: string;
      initialMessages: SessionMessage[];
      profile: ViewerProfile;
      descriptors: McpToolDescriptor[];
      bridge: Pick<McpBridge, "callTool">;
    },
  ) {
    const tools = createMcpAgentTools({
      runtimeId: USER_MCP_RUNTIME_ID,
      bridge: input.bridge,
      descriptors: input.descriptors,
    });

    this.agent = new Agent({
      initialState: {
        systemPrompt: "",
        model: PERSONAL_ASSISTANT_MODEL,
        messages: sessionMessagesToAgentMessages(input.initialMessages, PERSONAL_ASSISTANT_MODEL),
        tools,
      },
      convertToLlm: (messages) => messages as Message[],
      streamFn: (_model, context, options) => this.streamTurn(context, options),
      toolExecution: "sequential",
    });

    this.agent.subscribe(() => {
      this.listeners.forEach((listener) => listener());
    });
  }

  subscribe(listener: () => void) {
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

  isStreaming() {
    return this.agent.state.isStreaming;
  }

  getTranscriptAsSessionMessages() {
    return agentMessagesToSessionMessages(this.agent.state.messages, this.input.threadId);
  }

  async continueFromTranscript(): Promise<PersonalAssistantTurnResult> {
    this.streamingAssistantText = "";
    this.onboardingCompleted = false;
    this.projectCreated = false;
    await this.agent.continue();

    const lastAssistant = [...this.agent.state.messages].reverse().find((message) => message.role === "assistant") as AssistantMessage | undefined;
    const assistantText = lastAssistant ? readAssistantText(lastAssistant) : "";

    return {
      assistantText,
      onboardingCompleted: this.onboardingCompleted,
      projectCreated: this.projectCreated,
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

      if (latestMessage.role !== "user") {
        await emitText(stream, partial, "Я готов продолжить. Напишите, что нужно сделать дальше.", options);
        return;
      }

      const transcript = context.messages;
      const finalText = await runPersonalAssistantLoop({
        workspaceId: this.input.workspaceId,
        threadId: this.input.threadId,
        profile: this.input.profile,
        descriptors: this.input.descriptors,
        messages: transcript,
        onToolResult: (toolName, result) => {
          if (toolName === "profile.complete_onboarding" && !result.isError) {
            this.onboardingCompleted = true;
          }
          if (toolName === "projects.create" && !result.isError) {
            this.projectCreated = true;
          }
        },
      });

      await emitText(stream, partial, finalText, options);
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
    structuredContent: result.structuredContent,
    isError: Boolean(result.isError),
  };
}

async function runPersonalAssistantLoop(input: {
  workspaceId: string;
  threadId: string;
  profile: ViewerProfile;
  descriptors: McpToolDescriptor[];
  messages: Message[];
  onToolResult: (toolName: string, result: McpToolCallResult) => void;
}) {
  const loopMessages = [...input.messages];

  for (let step = 0; step < GENERATION_MAX_STEPS; step += 1) {
    const response = await postLlmResponse({
      workspace_id: input.workspaceId,
      thread_id: input.threadId,
      operation_kind: "generate_text",
      messages: buildPersonalLlmMessages(input.profile, input.descriptors, input.workspaceId, loopMessages),
    });

    const outputText = response.output_text?.trim() ?? "";
    const toolCall = parseToolCall(outputText);

    if (!toolCall) {
      return outputText || "Я готов продолжить. Напишите, что нужно сделать дальше.";
    }

    const toolArguments = injectWorkspaceId(toolCall.name, toolCall.arguments, input.workspaceId);
    const toolResult = await callUserMcpTool(toolCall.name, toolArguments);
    input.onToolResult(toolCall.name, toolResult);
    loopMessages.push(buildToolResultMessage(toolCall.name, toolResult));
  }

  return "Я выполнил необходимые действия через инструменты. Уточните следующий шаг, если нужно продолжить.";
}

function buildPersonalLlmMessages(
  profile: ViewerProfile,
  descriptors: McpToolDescriptor[],
  workspaceId: string,
  messages: Message[],
): LlmRequestMessage[] {
  const systemPrompt = [
    "Ты SA-Agent, персональный ассистент рабочего пространства.",
    "Отвечай на языке пользователя, обычно на русском.",
    "Если для ответа нужен инструмент, верни только JSON без markdown и без пояснений в формате:",
    '{"tool_call":{"name":"tool.name","arguments":{}}}',
    "После получения результата инструмента дай нормальный user-facing ответ и не показывай сырой JSON.",
    `Для projects.create всегда подставляй payload.workspace_id = "${workspaceId}".`,
    `Профиль пользователя: ${JSON.stringify({
      display_name: profile.display_name,
      preferred_user_name: profile.preferred_user_name,
      preferred_agent_name: profile.preferred_agent_name,
      activity_domain: profile.activity_domain,
      onboarding_completed: profile.onboarding_completed,
      onboarding_payload: profile.onboarding_payload,
    })}`,
    `Доступные инструменты: ${JSON.stringify(descriptors.map((item) => ({
      name: item.name,
      description: item.description,
      inputSchema: item.inputSchema,
    })))}`,
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    ...messages.map(mapLlmMessage),
  ];
}

function mapLlmMessage(message: Message): LlmRequestMessage {
  if (message.role === "user") {
    return { role: "user", content: readUserText(message) };
  }

  if (message.role === "assistant") {
    return { role: "assistant", content: readAssistantText(message) };
  }

  if (message.role === "toolResult") {
    return {
      role: "system",
      content: `TOOL_RESULT ${message.toolName} success=${String(!message.isError)} ${JSON.stringify(message.details ?? null)}`,
    };
  }

  return { role: "system", content: JSON.stringify(message) };
}

function parseToolCall(text: string) {
  const normalized = stripJsonFences(text);
  const candidates = [normalized, ...extractJsonObjectCandidates(normalized)];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        tool_call?: {
          name?: unknown;
          arguments?: unknown;
        };
      };
      if (!parsed.tool_call || typeof parsed.tool_call.name !== "string") {
        continue;
      }

      return {
        name: parsed.tool_call.name,
        arguments:
          typeof parsed.tool_call.arguments === "object" && parsed.tool_call.arguments !== null
            ? (parsed.tool_call.arguments as Record<string, unknown>)
            : {},
      };
    } catch {
      continue;
    }
  }

  return null;
}

function stripJsonFences(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractJsonObjectCandidates(text: string) {
  const candidates: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let end = index; end < text.length; end += 1) {
      const char = text[end];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(index, end + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

function injectWorkspaceId(toolName: string, argumentsJson: Record<string, unknown>, workspaceId: string) {
  if (toolName !== "projects.create") {
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

function buildToolResultMessage(toolName: string, result: McpToolCallResult): Extract<Message, { role: "toolResult" }> {
  return {
    role: "toolResult",
    toolCallId: `tool-result-${Date.now()}`,
    toolName: `${USER_MCP_SERVER_NAME}.${toolName}`,
    content: [],
    isError: Boolean(result.isError),
    details: {
      structuredContent: result.structuredContent ?? null,
    },
    timestamp: Date.now(),
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

async function emitText(
  stream: AssistantMessageEventStream,
  partial: AssistantMessage,
  text: string,
  options?: StreamOptions,
  stopReason: "stop" | "length" = "stop",
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

function matchFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
    if (match?.[0]) {
      return match[0].trim();
    }
  }
  return null;
}

function splitTextForReveal(value: string) {
  const parts = value.match(/.{1,12}(\s|$)|\S+/g);
  return parts && parts.length > 0 ? parts : [value];
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
