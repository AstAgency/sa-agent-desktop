import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Message as PiMessage,
  type Model,
  type StreamOptions,
  type TextContent,
} from "@earendil-works/pi-ai";
import { streamChatCompletion } from "../lib/api";
import { buildPrompt } from "./prompt-builder";
import { getLiveMessages } from "./live-messages";
import { retrieveRelevantSummaries } from "./search";
import { maybeSummarize } from "./summarizer";
import { buildWorkspaceTools, describeToolsForPrompt } from "./tools";
import { appendMessage } from "../lib/api";
import type {
  Agent as AgentRecord,
  ChatMessage,
  Message,
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
 *   → stream LLM → append assistant msg → maybe summarize.
 */
export class SessionRuntime {
  private readonly agent: Agent;
  private readonly tools: AgentTool[];
  private state: SessionRuntimeState;
  private readonly listeners = new Set<RuntimeListener>();
  private currentTurnUserMessage: Message | null = null;
  private currentTurnAssistantText = "";
  private currentTurnTotalTokens = 0;
  private model: string;
  private inflightAbort: AbortController | null = null;

  constructor(private readonly input: SessionRuntimeInput) {
    this.model = input.model ?? DEFAULT_MODEL;
    this.tools = buildWorkspaceTools(input.scope);
    this.state = {
      messages: [...input.messages],
      summaries: [...input.summaries],
      streamingAssistantText: "",
      isStreaming: false,
    };

    this.agent = new Agent({
      initialState: {
        systemPrompt: "",
        model: BACKEND_MODEL,
        messages: [],
        tools: this.tools,
      },
      convertToLlm: (messages) => messages as PiMessage[],
      streamFn: (model, context, options) => this.streamFromBackend(model, context, options),
    });
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

  async sendUserMessage(content: string): Promise<{ assistant: Message }> {
    const trimmed = content.trim();
    if (trimmed.length === 0) throw new Error("Empty message");

    const userMessage = await appendMessage(this.input.sessionId, "user", content);
    this.state = {
      ...this.state,
      messages: [...this.state.messages, userMessage],
      streamingAssistantText: "",
      isStreaming: true,
    };
    this.notify();

    this.currentTurnUserMessage = userMessage;
    this.currentTurnAssistantText = "";
    this.currentTurnTotalTokens = 0;

    try {
      await this.agent.prompt(content);
    } catch (error) {
      this.state = { ...this.state, isStreaming: false };
      this.notify();
      throw error;
    }

    const assistantText = this.currentTurnAssistantText.trim();
    if (assistantText.length === 0) {
      this.state = { ...this.state, isStreaming: false, streamingAssistantText: "" };
      this.notify();
      throw new Error("Assistant returned empty response");
    }

    const assistantMessage = await appendMessage(this.input.sessionId, "assistant", assistantText);
    this.state = {
      ...this.state,
      messages: [...this.state.messages, assistantMessage],
      streamingAssistantText: "",
      isStreaming: false,
    };
    this.notify();

    await this.maybeRunSummarization();

    return { assistant: assistantMessage };
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

    try {
      const userText = this.currentTurnUserMessage?.content ?? "";
      const relevantSummaries = userText.length > 0
        ? await retrieveRelevantSummaries(userText, { sessionId: this.input.sessionId })
        : [];

      const liveMessages = getLiveMessages(this.state.messages, this.state.summaries);
      const promptMessages: ChatMessage[] = buildPrompt({
        agent: this.input.agent,
        profile: this.input.profile,
        project: this.input.project,
        relevantSummaries,
        liveMessages,
        toolsManifest: describeToolsForPrompt(this.tools),
      });

      stream.push({ type: "text_start", contentIndex: 0, partial });
      const textContent = ensureTextContent(partial);

      const result = await streamChatCompletion(
        { model: this.model, messages: promptMessages },
        {
          onDelta: (delta) => {
            textContent.text += delta;
            this.currentTurnAssistantText += delta;
            this.state = {
              ...this.state,
              streamingAssistantText: this.currentTurnAssistantText,
            };
            this.notify();
            stream.push({ type: "text_delta", contentIndex: 0, delta, partial });
          },
          onUsage: ({ total_tokens }) => {
            this.currentTurnTotalTokens = total_tokens;
          },
        },
        { signal: abortController.signal },
      );

      if (this.currentTurnAssistantText.length === 0 && result.content.length > 0) {
        this.currentTurnAssistantText = result.content;
        textContent.text = result.content;
      }

      stream.push({
        type: "text_end",
        contentIndex: 0,
        content: textContent.text,
        partial,
      });
      partial.stopReason = "stop";
      stream.push({ type: "done", reason: "stop", message: { ...partial } });
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

function ensureTextContent(message: AssistantMessage): TextContent {
  const existing = message.content[0];
  if (existing?.type === "text") return existing;
  const next: TextContent = { type: "text", text: "" };
  message.content[0] = next;
  return next;
}
