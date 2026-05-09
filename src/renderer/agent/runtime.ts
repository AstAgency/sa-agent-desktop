import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream, type AssistantMessage, type AssistantMessageEventStream, type Context, type ImageContent, type Message, type Model, type StreamOptions, type TextContent } from "@earendil-works/pi-ai";
import { createMcpAgentTools } from "./mcp-tools";
import { agentMessagesToSessionMessages, sessionMessagesToAgentMessages } from "./transcript";
import { streamSessionMessage } from "../lib/api";
import { recordDebugAgentRuntimeEntry } from "../lib/debug";
import type {
  AgentMcpLandscape,
  McpBridge,
  McpToolDescriptor,
  SessionMessage,
  SessionMessageInput,
  SessionMessageStreamEvent,
  StreamSessionMessageResult,
} from "../lib/types";

type StreamMessageFn = (
  sessionId: string,
  payload: SessionMessageInput,
  input?: {
    signal?: AbortSignal;
    onEvent?: (event: SessionMessageStreamEvent) => void;
  },
) => Promise<StreamSessionMessageResult>;

const BACKEND_MODEL: Model<"openai-completions"> = {
  id: "sa-agent-backend",
  name: "SA-Agent Backend",
  api: "openai-completions",
  provider: "sa-agent-backend",
  baseUrl: "http://backend.local",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 1_000_000,
  maxTokens: 32_000,
};

const MCP_TOOL_DISCOVERY_TIMEOUT_MS = 3_000;

export class BackendSessionAgentRuntime {
  private completionPayload: Record<string, unknown> | null = null;
  private executionCompleted = false;
  private readonly agent: Agent;
  private readonly listeners = new Set<Parameters<Agent["subscribe"]>[0]>();
  private streamingAssistantText = "";

  static async create(
    input: {
      sessionId: string;
      initialMessages: SessionMessage[];
      mcpLandscape?: AgentMcpLandscape | null;
      mcpBridge?: McpBridge | null;
      streamMessage?: StreamMessageFn;
    },
  ) {
    const runtimeId = createRuntimeId(input.sessionId);
    const bridge = input.mcpBridge ?? readMcpBridge();
    const descriptors = await resolveMcpToolDescriptors({
      bridge,
      mcpLandscape: input.mcpLandscape,
      runtimeId,
    });

    return new BackendSessionAgentRuntime({
      ...input,
      runtimeId,
      mcpBridge: bridge,
      mcpToolDescriptors: descriptors,
    });
  }

  private constructor(
    private readonly input: {
      runtimeId: string;
      sessionId: string;
      initialMessages: SessionMessage[];
      mcpLandscape?: AgentMcpLandscape | null;
      mcpBridge?: McpBridge | null;
      mcpToolDescriptors?: McpToolDescriptor[];
      streamMessage?: StreamMessageFn;
    },
  ) {
    const tools =
      input.mcpBridge && input.mcpToolDescriptors
        ? createMcpAgentTools({
            runtimeId: input.runtimeId,
            bridge: input.mcpBridge,
            descriptors: input.mcpToolDescriptors,
          })
        : [];

    this.agent = new Agent({
      initialState: {
        systemPrompt: "",
        model: BACKEND_MODEL,
        messages: sessionMessagesToAgentMessages(input.initialMessages, BACKEND_MODEL),
        tools,
      },
      convertToLlm: (messages) => messages as Message[],
      streamFn: (model, context, options) =>
        this.streamViaBackend(model, context, options),
    });

    recordDebugAgentRuntimeEntry({
      id: createRuntimeDebugId(),
      startedAt: new Date().toISOString(),
      type: "runtime.init",
      sessionId: input.sessionId,
      data: {
        mcpServers: Object.keys(input.mcpLandscape?.mcpServers ?? {}),
        toolCount: this.agent.state.tools.length,
        mode: "backend-proxy",
      },
    });

    this.agent.subscribe((event, signal) => {
      if (event.type === "message_end" && event.message.role === "assistant") {
        this.streamingAssistantText = "";
      }

      if (event.type === "agent_end") {
        this.streamingAssistantText = "";
      }

      recordDebugAgentRuntimeEntry({
        id: createRuntimeDebugId(),
        startedAt: new Date().toISOString(),
        type: event.type,
        sessionId: this.input.sessionId,
        data: readAgentEventDebugData(event),
      });

      void this.notifyListeners(event, signal);
    });
  }

  subscribe(listener: Parameters<Agent["subscribe"]>[0]) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getTranscript() {
    return this.agent.state.messages;
  }

  getStreamingAssistantText() {
    if (this.streamingAssistantText.length > 0) {
      return this.streamingAssistantText;
    }

    const streamingMessage = this.agent.state.streamingMessage;

    if (!streamingMessage || streamingMessage.role !== "assistant") {
      return "";
    }

    return readAssistantText(streamingMessage);
  }

  isStreaming() {
    return this.agent.state.isStreaming;
  }

  replaceTranscript(messages: SessionMessage[]) {
    this.agent.state.messages = sessionMessagesToAgentMessages(messages, BACKEND_MODEL);
  }

  async sendUserMessage(contentMarkdown: string) {
    this.completionPayload = null;
    this.executionCompleted = false;
    this.streamingAssistantText = "";
    await this.agent.prompt(contentMarkdown);
    return {
      completionPayload: this.completionPayload,
      executionCompleted: this.executionCompleted,
    };
  }

  abort() {
    this.agent.abort();
  }

  dispose() {
    void this.input.mcpBridge?.closeRuntime(this.input.runtimeId);
    this.agent.abort();
  }

  getToolCount() {
    return this.agent.state.tools.length;
  }

  private streamViaBackend(
    model: Model<any>,
    context: Context,
    options?: StreamOptions,
  ): AssistantMessageEventStream {
    const stream = createAssistantMessageEventStream();
    const payload = extractBackendPayload(context.messages);

    if (!payload) {
      const errorMessage = buildErrorAssistantMessage(model, "No user message available for backend execution.", "error");
      stream.push({
        type: "error",
        reason: "error",
        error: errorMessage,
      });
      stream.end();
      return stream;
    }

    const partial = buildPartialAssistantMessage(model);
    let hasReceivedDelta = false;
    let progressiveRevealPromise: Promise<void> | null = null;

    void (this.input.streamMessage ?? streamSessionMessage)(this.input.sessionId, payload, {
      signal: options?.signal,
      onEvent: (event) => {
        if (event.event === "message.delta") {
          hasReceivedDelta = true;
          this.streamingAssistantText += event.data.delta;
          const textContent = ensureTextContent(partial);
          if (textContent.text.length === 0) {
            stream.push({
              type: "text_start",
              contentIndex: 0,
              partial,
            });
          }
          textContent.text += event.data.delta;
          stream.push({
            type: "text_delta",
            contentIndex: 0,
            delta: event.data.delta,
            partial,
          });
          void this.notifyListeners();
          return;
        }

        if (event.event === "message.completed") {
          if (!hasReceivedDelta) {
            progressiveRevealPromise = emitTextProgressively(
              stream,
              partial,
              event.data.content_markdown,
              options?.signal,
              (nextText) => {
                this.streamingAssistantText = nextText;
                void this.notifyListeners();
              },
            );
            return;
          }

          this.streamingAssistantText = event.data.content_markdown;
          const textContent = ensureTextContent(partial);
          textContent.text = event.data.content_markdown;
          stream.push({
            type: "text_end",
            contentIndex: 0,
            content: event.data.content_markdown,
            partial,
          });
          void this.notifyListeners();
          return;
        }

        if (event.event === "execution.completed") {
          this.completionPayload = event.data.completion_payload ?? null;
          this.executionCompleted = true;
        }
      },
      })
      .then((result) => {
        if (result.completionPayload) {
          this.completionPayload = result.completionPayload;
        }
        if (result.executionCompleted) {
          this.executionCompleted = true;
        }

        if (result.mode === "json") {
          const text = result.accepted.assistant_content_markdown ?? "";
          if (text.length > 0) {
            progressiveRevealPromise = emitTextProgressively(stream, partial, text, options?.signal);
          }
        }

        return (progressiveRevealPromise ?? Promise.resolve()).then(() => {
          finalizeStream();
        });
      })
      .catch((error) => {
        this.streamingAssistantText = "";
        const message = error instanceof Error ? error.message : "Backend streaming failed.";
        const errorMessage = buildErrorAssistantMessage(model, message, options?.signal?.aborted ? "aborted" : "error");
        stream.push({
          type: "error",
          reason: options?.signal?.aborted ? "aborted" : "error",
          error: errorMessage,
        });
        stream.end();
      });

    stream.push({
      type: "start",
      partial,
    });

    return stream;

    function finalizeStream() {
      partial.stopReason = "stop";
      stream.push({
        type: "done",
        reason: "stop",
        message: {
          ...partial,
          content: partial.content.map((content) => ({ ...content })),
        },
      });
      stream.end();
    }
  }

  private async notifyListeners(
    event?: Parameters<Parameters<Agent["subscribe"]>[0]>[0],
    signal?: Parameters<Parameters<Agent["subscribe"]>[0]>[1],
  ) {
    const listenerSignal = signal ?? new AbortController().signal;
    for (const listener of this.listeners) {
      await listener(event as never, listenerSignal);
    }
  }
}

async function resolveMcpToolDescriptors(input: {
  bridge: McpBridge | null;
  mcpLandscape?: AgentMcpLandscape | null;
  runtimeId: string;
}) {
  if (!input.bridge || !input.mcpLandscape) {
    return [];
  }

  try {
    return await Promise.race([
      input.bridge.listTools(input.runtimeId, input.mcpLandscape.mcpServers),
      waitForMcpToolDiscoveryTimeout(),
    ]);
  } catch (error) {
    recordDebugAgentRuntimeEntry({
      id: createRuntimeDebugId(),
      startedAt: new Date().toISOString(),
      type: "runtime.mcp_tool_discovery_failed",
      sessionId: input.runtimeId,
      data: {
        error: error instanceof Error ? error.message : "Unknown MCP discovery error.",
      },
    });
    return [];
  }
}

function waitForMcpToolDiscoveryTimeout() {
  return new Promise<McpToolDescriptor[]>((resolve) => {
    window.setTimeout(() => resolve([]), MCP_TOOL_DISCOVERY_TIMEOUT_MS);
  });
}

function createRuntimeDebugId() {
  return `runtime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createRuntimeId(sessionId: string) {
  return `session:${sessionId}`;
}

function readMcpBridge() {
  return window.saAgent?.mcp ?? null;
}

function readAgentEventDebugData(event: Parameters<Parameters<Agent["subscribe"]>[0]>[0]) {
  switch (event.type) {
    case "message_update":
      return {
        assistantEventType: event.assistantMessageEvent.type,
        delta:
          event.assistantMessageEvent.type === "text_delta"
            ? event.assistantMessageEvent.delta
            : undefined,
      };
    case "tool_execution_start":
      return {
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        args: event.args,
      };
    case "tool_execution_update":
      return {
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        partialResult: event.partialResult,
      };
    case "tool_execution_end":
      return {
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        result: event.result,
        isError: event.isError,
      };
    case "message_start":
    case "message_end":
      return {
        role: event.message.role,
      };
    default:
      return undefined;
  }
}

function extractBackendPayload(messages: Message[]): SessionMessageInput | null {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!userMessage) {
    return null;
  }

  return {
    content_markdown:
      typeof userMessage.content === "string" ? userMessage.content : userMessage.content.map(readTextFromContent).join(""),
  };
}

function readTextFromContent(content: TextContent | ImageContent) {
  if (content.type === "text" && typeof content.text === "string") {
    return content.text;
  }

  return "";
}

function readAssistantText(message: AssistantMessage) {
  return message.content.map((content) => (content.type === "text" ? content.text : "")).join("");
}

function buildPartialAssistantMessage(model: Model<any>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: zeroUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function buildErrorAssistantMessage(model: Model<any>, errorMessage: string, stopReason: "error" | "aborted"): AssistantMessage {
  return {
    ...buildPartialAssistantMessage(model),
    stopReason,
    errorMessage,
  };
}

function ensureTextContent(partial: AssistantMessage) {
  const current = partial.content[0];

  if (current?.type === "text") {
    return current;
  }

  const nextContent: TextContent = {
    type: "text",
    text: "",
  };
  partial.content[0] = nextContent;
  return nextContent;
}

function zeroUsage(): AssistantMessage["usage"] {
  return {
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
  };
}

async function emitTextProgressively(
  stream: AssistantMessageEventStream,
  partial: AssistantMessage,
  fullText: string,
  signal?: AbortSignal,
  onTextUpdate?: (nextText: string) => void,
) {
  const textContent = ensureTextContent(partial);
  stream.push({
    type: "text_start",
    contentIndex: 0,
    partial,
  });

  let current = "";
  for (const chunk of splitTextForReveal(fullText)) {
    if (signal?.aborted) {
      return;
    }

    current += chunk;
    textContent.text = current;
    onTextUpdate?.(current);
    stream.push({
      type: "text_delta",
      contentIndex: 0,
      delta: chunk,
      partial,
    });
    await waitMs(16, signal);
  }

  textContent.text = fullText;
  onTextUpdate?.(fullText);
  stream.push({
    type: "text_end",
    contentIndex: 0,
    content: fullText,
    partial,
  });
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

export { agentMessagesToSessionMessages, sessionMessagesToAgentMessages };
