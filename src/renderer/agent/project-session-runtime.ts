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
import { agentMessagesToSessionMessages, sessionMessagesToAgentMessages } from "./transcript";
import { postLlmResponse, postProjectAgentMcp } from "../lib/api";
import { recordDebugAgentRuntimeEntry } from "../lib/debug";
import type { LlmRequestMessage, SessionMessage } from "../lib/types";
const GENERATION_MAX_STEPS = 4;

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
  private readonly listeners = new Set<() => void>();
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
    return new ProjectSessionRuntime(input);
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
    },
  ) {
    this.agent = new Agent({
      initialState: {
        systemPrompt: "",
        model: PROJECT_SESSION_MODEL,
        messages: sessionMessagesToAgentMessages(input.initialMessages, PROJECT_SESSION_MODEL),
        tools: [],
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

  getStreamingAssistantText() {
    return this.streamingAssistantText;
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
        await emitText(stream, partial, "Контекст проектного диалога пуст. Начните с сообщения пользователю.", options, this);
        return;
      }

      if (latestMessage.role !== "user") {
        await emitText(stream, partial, "Я готов продолжить работу по проекту. Опишите задачу или уточните контекст.", options, this);
        return;
      }

      const finalText = await runProjectAssistantLoop({
        workspaceId: this.input.workspaceId,
        projectId: this.input.projectId,
        sessionId: this.input.sessionId,
        projectAgentId: this.input.projectAgentId,
        capabilityKey: this.input.capabilityKey,
        projectName: this.input.projectName,
        messages: context.messages,
        onToolResult: (toolName, result) => {
          if (toolName === "project.bootstrap.complete" && !result.isError) {
            this.projectOnboardingCompleted = true;
          }
        },
      });

      await emitText(stream, partial, finalText, options, this);
    })().catch(async (error) => {
      await emitText(
        stream,
        partial,
        error instanceof Error ? error.message : "Не удалось продолжить проектный диалог.",
        options,
        this,
      );
    });

    return stream;
  }
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
    isError: Boolean(result.isError),
    content: Array.isArray(result.content) ? result.content : [],
    structuredContent: result.structuredContent ?? null,
  };
}

async function runProjectAssistantLoop(input: {
  workspaceId: string;
  projectId?: string | null;
  sessionId: string;
  projectAgentId: string;
  capabilityKey?: string | null;
  projectName?: string | null;
  messages: Message[];
  onToolResult: (
    toolName: string,
    result: { isError: boolean; content?: unknown[]; structuredContent?: unknown },
  ) => void;
}) {
  const loopMessages = [...input.messages];

  for (let step = 0; step < GENERATION_MAX_STEPS; step += 1) {
    const response = await postLlmResponse({
      workspace_id: input.workspaceId,
      project_id: input.projectId ?? null,
      session_id: input.sessionId,
      project_agent_id: input.projectAgentId,
      operation_kind: "generate_text",
      messages: buildProjectLlmMessages(input, loopMessages),
    });

    const outputText = response.output_text?.trim() ?? "";
    const toolCall = parseToolCall(outputText);

    if (!toolCall) {
      return outputText || "Сообщение сохранено. Продолжайте диалог по проекту.";
    }

    const toolResult = await callProjectAgentMcpTool(input.projectAgentId, toolCall.name, toolCall.arguments).catch(() => ({
      isError: true,
      content: [],
      structuredContent: null,
    }));
    input.onToolResult(toolCall.name, toolResult);
    loopMessages.push(buildToolResultMessage(toolCall.name, toolResult));
  }

  return "Я выполнил нужные действия по проекту. Продолжайте, если нужен следующий шаг.";
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
    "Если нужен инструмент, верни только JSON без markdown:",
    '{"tool_call":{"name":"tool.name","arguments":{}}}',
    "После TOOL_RESULT дай нормальный user-facing ответ.",
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
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    ...messages.map(mapProjectLlmMessage),
  ];
}

function mapProjectLlmMessage(message: Message): LlmRequestMessage {
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
  const normalized = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  const candidates = [normalized, ...extractJsonObjectCandidates(normalized)];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { tool_call?: { name?: unknown; arguments?: unknown } };
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

function buildToolResultMessage(
  toolName: string,
  result: { isError: boolean; structuredContent?: unknown },
): Extract<Message, { role: "toolResult" }> {
  return {
    role: "toolResult",
    toolCallId: `tool-result-${Date.now()}`,
    toolName,
    content: [],
    isError: result.isError,
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

async function emitText(
  stream: AssistantMessageEventStream,
  partial: AssistantMessage,
  text: string,
  options: StreamOptions | undefined,
  runtime: ProjectSessionRuntime,
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
    (runtime as any).streamingAssistantText = content.text;
    stream.push({ type: "text_delta", contentIndex: 0, delta: chunk, partial });
    await waitMs(14, options?.signal);
  }

  stream.push({ type: "text_end", contentIndex: 0, content: text, partial });
  stream.push({
    type: "done",
    reason: "stop",
    message: {
      ...partial,
      content: [{ type: "text", text }],
      stopReason: "stop",
    },
  });
  stream.end();
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
