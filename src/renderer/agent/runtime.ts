import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Message as PiMessage,
  type Model,
  type StopReason,
  type StreamOptions,
  type TextContent,
  type ToolCall as PiToolCall,
  type UserMessage,
} from "@earendil-works/pi-ai";
import { appendMessage, streamChatCompletion } from "../lib/api";
import { buildPrompt } from "./prompt-builder";
import { getLiveMessages } from "./live-messages";
import { retrieveRelevantSummaries } from "./search";
import { maybeSummarize } from "./summarizer";
import { buildWorkspaceTools, type WorkspaceToolActions } from "./tools";
import type {
  Agent as AgentRecord,
  ChatMessage,
  Message,
  OpenAIToolCallRecord,
  OpenAIToolDefinition,
  Profile,
  Project,
  Summary,
  WorkspaceScope,
} from "../lib/types";

export const DEFAULT_MODEL = "deepseek-chat";

const BACKEND_MODEL: Model<"openai-completions"> = {
  id: "sa-agent-backend",
  name: "SA-Agent Backend",
  api: "openai-completions",
  provider: "sa-agent-backend",
  baseUrl: "internal://sa-agent",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 8_192,
};

export type SessionRuntimeInput = {
  sessionId: string;
  scope: WorkspaceScope;
  profile: Profile;
  project: Project | null;
  agent: AgentRecord | null;
  messages: Message[];
  summaries: Summary[];
  toolActions: WorkspaceToolActions;
  model?: string;
};

export type SessionRuntimeState = {
  messages: Message[];
  summaries: Summary[];
  streamingAssistantText: string;
  isStreaming: boolean;
};

export type RuntimeListener = (state: SessionRuntimeState) => void;

/**
 * Per-session runtime. Owns:
 * - in-memory mirror of messages / summaries for the active session
 * - a pi-agent-core Agent instance configured with workspace tools
 * - the conversational loop: append user msg → embed → search → build prompt
 *   → stream LLM → execute tools → repeat until assistant stops → maybe summarize.
 *
 * Persistence is driven by Agent lifecycle events: every assistant message and
 * every tool-result message is appended to the backend through `message_end`.
 */
export class SessionRuntime {
  private readonly agent: Agent;
  private readonly tools: AgentTool[];
  private state: SessionRuntimeState;
  private readonly listeners = new Set<RuntimeListener>();
  private model: string;
  private inflightAbort: AbortController | null = null;
  private currentTurnUserText = "";
  private streamingAssistantText = "";
  private readonly persistedMessageIds = new Set<string>();
  private readonly agentEventUnsubscribe: () => void;
  private persistenceChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly input: SessionRuntimeInput) {
    this.model = input.model ?? DEFAULT_MODEL;
    this.tools = buildWorkspaceTools(input.scope, input.toolActions);
    this.state = {
      messages: [...input.messages],
      summaries: [...input.summaries],
      streamingAssistantText: "",
      isStreaming: false,
    };
    for (const message of input.messages) this.persistedMessageIds.add(message.id);

    this.agent = new Agent({
      initialState: {
        systemPrompt: "",
        model: BACKEND_MODEL,
        messages: hydrateAgentMessages(input.messages),
        tools: this.tools,
      },
      convertToLlm: (messages) => messages as PiMessage[],
      streamFn: (model, context, options) => this.streamFromBackend(model, context, options),
    });

    this.agentEventUnsubscribe = this.agent.subscribe((event) => this.onAgentEvent(event));
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): SessionRuntimeState {
    return this.state;
  }

  getToolNames(): string[] {
    return this.tools.map((tool) => tool.name);
  }

  abort() {
    this.inflightAbort?.abort();
    this.agent.abort();
  }

  dispose() {
    this.agentEventUnsubscribe();
    this.abort();
  }

  async sendUserMessage(content: string): Promise<void> {
    const trimmed = content.trim();
    if (trimmed.length === 0) throw new Error("Empty message");

    const userMessage = await appendMessage(this.input.sessionId, "user", content);
    this.persistedMessageIds.add(userMessage.id);
    this.state = {
      ...this.state,
      messages: [...this.state.messages, userMessage],
      streamingAssistantText: "",
      isStreaming: true,
    };
    this.streamingAssistantText = "";
    this.currentTurnUserText = content;
    this.notify();

    const piUserMessage: UserMessage = {
      role: "user",
      content,
      timestamp: Date.now(),
    };
    this.agent.state.messages = [...this.agent.state.messages, piUserMessage];

    try {
      await this.agent.continue();
    } finally {
      this.state = { ...this.state, isStreaming: false, streamingAssistantText: "" };
      this.streamingAssistantText = "";
      this.notify();
    }

    await this.maybeRunSummarization();
  }

  replaceSummaries(summaries: Summary[]) {
    this.state = { ...this.state, summaries };
    this.notify();
  }

  private async maybeRunSummarization() {
    const live = getLiveMessages(this.state.messages, this.state.summaries);
    if (live.length < 20) return;
    try {
      const result = await maybeSummarize({
        sessionId: this.input.sessionId,
        liveMessages: live,
        model: this.model,
      });
      if (result.summary) {
        this.state = {
          ...this.state,
          summaries: [...this.state.summaries, result.summary],
        };
        this.notify();
      }
    } catch (error) {
      console.error("[summarizer]", error);
    }
  }

  private onAgentEvent(event: { type: string } & Record<string, unknown>) {
    if (event.type !== "message_end") return;
    const message = event.message as PiMessage | undefined;
    if (!message) return;
    if (message.role === "user") return;
    this.enqueuePersistence(() => this.persistAgentMessage(message));
  }

  private enqueuePersistence(work: () => Promise<void>) {
    this.persistenceChain = this.persistenceChain
      .then(work)
      .catch((error) => {
        console.error("[runtime persist]", error);
      });
  }

  private async persistAgentMessage(message: PiMessage) {
    try {
      if (message.role === "assistant") {
        const text = extractAssistantText(message);
        const toolCalls = extractAssistantToolCalls(message);
        if (text.trim().length === 0 && toolCalls.length === 0) return;
        const saved = await appendMessage(this.input.sessionId, "assistant", text, {
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });
        this.appendPersistedMessage(saved);
        return;
      }
      if (message.role === "toolResult") {
        const text = extractToolResultText(message);
        if (text.trim().length === 0) return;
        const saved = await appendMessage(this.input.sessionId, "tool", text, {
          tool_call_id: message.toolCallId,
        });
        this.appendPersistedMessage(saved);
      }
    } catch (error) {
      console.error("[runtime persist]", error);
    }
  }

  private appendPersistedMessage(message: Message) {
    if (this.persistedMessageIds.has(message.id)) return;
    this.persistedMessageIds.add(message.id);
    this.state = {
      ...this.state,
      messages: [...this.state.messages, message],
    };
    this.notify();
  }

  private streamFromBackend(
    model: Model<Api>,
    _context: Context,
    options?: StreamOptions,
  ): AssistantMessageEventStream {
    const stream = createAssistantMessageEventStream();
    void this.runStream(model, stream, options?.signal);
    return stream;
  }

  private async runStream(
    model: Model<Api>,
    stream: AssistantMessageEventStream,
    signal?: AbortSignal,
  ) {
    const partial = buildPartialAssistantMessage(model);
    stream.push({ type: "start", partial });

    const abortController = new AbortController();
    this.inflightAbort = abortController;
    const onParentAbort = () => abortController.abort();
    signal?.addEventListener("abort", onParentAbort, { once: true });

    let textContentIndex: number | null = null;
    let textContent: TextContent | null = null;
    this.streamingAssistantText = "";

    try {
      // Ensure prior tool/assistant persistence has settled before reading
      // state.messages — otherwise the next round trip can omit (or reorder)
      // a tool result that just executed.
      await this.persistenceChain;

      const relevantSummaries =
        this.currentTurnUserText.length > 0
          ? await retrieveRelevantSummaries(this.currentTurnUserText, {
              sessionId: this.input.sessionId,
            })
          : [];

      const liveMessages = getLiveMessages(this.state.messages, this.state.summaries);
      const transcriptForLlm = transcriptToChatMessages(liveMessages);
      const promptMessages: ChatMessage[] = buildPrompt({
        agent: this.input.agent,
        profile: this.input.profile,
        project: this.input.project,
        relevantSummaries,
        liveMessages: [],
        toolsManifest: null,
      }).concat(transcriptForLlm);

      const toolDefinitions = toolsToOpenAIDefinitions(this.tools);

      const toolCallContentIndices = new Map<number, number>();
      const result = await streamChatCompletion(
        {
          model: this.model,
          messages: promptMessages,
          tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
        },
        {
          onDelta: (delta) => {
            if (textContent === null) {
              textContentIndex = partial.content.length;
              textContent = { type: "text", text: "" };
              partial.content.push(textContent);
              stream.push({ type: "text_start", contentIndex: textContentIndex, partial });
            }
            textContent.text += delta;
            this.streamingAssistantText += delta;
            this.state = { ...this.state, streamingAssistantText: this.streamingAssistantText };
            this.notify();
            stream.push({
              type: "text_delta",
              contentIndex: textContentIndex!,
              delta,
              partial,
            });
          },
          onToolCallStart: (index, id, name) => {
            const contentIndex = partial.content.length;
            toolCallContentIndices.set(index, contentIndex);
            const placeholder: PiToolCall = {
              type: "toolCall",
              id,
              name,
              arguments: {},
            };
            partial.content.push(placeholder);
            stream.push({ type: "toolcall_start", contentIndex, partial });
          },
          onToolCallDelta: (index, argumentsDelta) => {
            const contentIndex = toolCallContentIndices.get(index);
            if (contentIndex === undefined) return;
            stream.push({
              type: "toolcall_delta",
              contentIndex,
              delta: argumentsDelta,
              partial,
            });
          },
        },
        { signal: abortController.signal },
      );

      const finalText = textContent as TextContent | null;
      if (finalText !== null && textContentIndex !== null) {
        stream.push({
          type: "text_end",
          contentIndex: textContentIndex,
          content: finalText.text,
          partial,
        });
      }

      if (result.tool_calls.length > 0) {
        for (const toolCall of result.tool_calls) {
          const index = result.tool_calls.indexOf(toolCall);
          const contentIndex = toolCallContentIndices.get(index);
          if (contentIndex === undefined) continue;
          const parsedArgs = parseToolArguments(toolCall.function.arguments);
          const finalized: PiToolCall = {
            type: "toolCall",
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: parsedArgs,
          };
          partial.content[contentIndex] = finalized;
          stream.push({
            type: "toolcall_end",
            contentIndex,
            toolCall: finalized,
            partial,
          });
        }
      }

      const stopReason: Extract<StopReason, "stop" | "length" | "toolUse"> =
        result.tool_calls.length > 0
          ? "toolUse"
          : result.finish_reason === "length"
            ? "length"
            : "stop";
      partial.stopReason = stopReason;
      stream.push({ type: "done", reason: stopReason, message: { ...partial } });
      stream.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aborted = abortController.signal.aborted;
      stream.push({
        type: "error",
        reason: aborted ? "aborted" : "error",
        error: buildErrorAssistantMessage(model, message, aborted ? "aborted" : "error"),
      });
      stream.end();
    } finally {
      signal?.removeEventListener("abort", onParentAbort);
      this.inflightAbort = null;
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (error) {
        console.error("[runtime listener]", error);
      }
    }
  }
}

function buildPartialAssistantMessage(model: Model<Api>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
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

function buildErrorAssistantMessage(
  model: Model<Api>,
  errorMessage: string,
  stopReason: "error" | "aborted",
): AssistantMessage {
  return {
    ...buildPartialAssistantMessage(model),
    stopReason,
    errorMessage,
  };
}

function hydrateAgentMessages(messages: Message[]): PiMessage[] {
  const result: PiMessage[] = [];
  for (const message of messages) {
    const timestamp = Date.parse(message.created_at) || Date.now();
    if (message.role === "user") {
      result.push({ role: "user", content: message.content, timestamp });
      continue;
    }
    if (message.role === "assistant") {
      const content: AssistantMessage["content"] = [];
      if (message.content.length > 0) {
        content.push({ type: "text", text: message.content });
      }
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          content.push({
            type: "toolCall",
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: parseToolArguments(toolCall.function.arguments),
          });
        }
      }
      result.push({
        role: "assistant",
        content,
        api: BACKEND_MODEL.api,
        provider: BACKEND_MODEL.provider,
        model: BACKEND_MODEL.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp,
      });
      continue;
    }
    if (message.role === "tool") {
      result.push({
        role: "toolResult",
        toolCallId: message.tool_call_id ?? "",
        toolName: "",
        content: [{ type: "text", text: message.content }],
        isError: false,
        timestamp,
      });
    }
  }
  return result;
}

/**
 * Convert the persisted transcript to the shape we send to /v1/chat/completions.
 *
 * Contract (deliberately different from OpenAI's strict tool-calls protocol):
 *   - user / assistant messages flow through as plain text
 *   - assistant messages with empty content are skipped (their tool_calls
 *     are recorded locally but not exposed to the LLM)
 *   - tool_calls metadata is stripped from outgoing assistant messages
 *   - tool result messages are folded into synthetic user messages of the form
 *
 *       <tool_result name="...">{content}</tool_result>
 *
 *     This sidesteps OpenAI's "tool must follow tool_calls" pairing rule and
 *     drives the LLM to interpret the tool output for the user in its next turn.
 */
function transcriptToChatMessages(messages: Message[]): ChatMessage[] {
  const toolNameById = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !message.tool_calls) continue;
    for (const call of message.tool_calls) {
      if (call?.id && call.function?.name) {
        toolNameById.set(call.id, call.function.name);
      }
    }
  }

  const result: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      if (message.content.length === 0) continue;
      result.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      if (message.content.trim().length === 0) continue;
      result.push({ role: "assistant", content: message.content });
      continue;
    }
    if (message.role === "tool") {
      if (message.content.trim().length === 0) continue;
      const toolName =
        (message.tool_call_id ? toolNameById.get(message.tool_call_id) : undefined) ?? "tool";
      result.push({
        role: "user",
        content: `<tool_result name="${escapeAttribute(toolName)}">\n${message.content}\n</tool_result>`,
      });
    }
  }
  return result;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function toolsToOpenAIDefinitions(tools: AgentTool[]): OpenAIToolDefinition[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as Record<string, unknown>,
    },
  }));
}

function extractAssistantText(message: PiMessage): string {
  if (message.role !== "assistant") return "";
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function extractAssistantToolCalls(message: PiMessage): OpenAIToolCallRecord[] {
  if (message.role !== "assistant") return [];
  return message.content
    .filter((block): block is PiToolCall => block.type === "toolCall")
    .map((block) => ({
      id: block.id,
      type: "function" as const,
      function: { name: block.name, arguments: JSON.stringify(block.arguments ?? {}) },
    }));
}

function extractToolResultText(message: PiMessage): string {
  if (message.role !== "toolResult") return "";
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

function parseToolArguments(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
