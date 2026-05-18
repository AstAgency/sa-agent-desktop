import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { type Message as PiMessage } from "@earendil-works/pi-ai";
import type { Summary } from "../../lib/types";
import { buildWorkspaceTools } from "../tools";
import { DEFAULT_MODEL, BACKEND_MODEL } from "./constants";
import { hydrateAgentMessages } from "./converters";
import { sendUserMessage } from "./message-flow";
import { streamFromBackend } from "./stream";
import { handleAgentEvent } from "./trace";
import type {
  ActiveRound,
  RuntimeInternals,
  RuntimeListener,
  SessionRuntimeInput,
  SessionRuntimeState,
} from "./types";

/**
 * Per-session runtime. Owns:
 * - in-memory mirror of messages / summaries for the active session
 * - a pi-agent-core Agent instance configured with workspace tools
 * - the conversational loop: append user msg → embed → search → build prompt
 *   → stream LLM → execute tools → repeat until assistant stops → maybe summarize.
 *
 * Persistence is driven by Agent lifecycle events: every assistant message and
 * every tool-result message is appended to the backend through `message_end`.
 *
 * The conversational loop is split by responsibility across sibling modules
 * (message-flow / stream / persistence / trace); this class owns the shared
 * state and orchestration and exposes it through {@link RuntimeInternals}.
 */
export class SessionRuntime implements RuntimeInternals {
  readonly tools: AgentTool[];
  readonly agent: Agent;
  readonly persistedMessageIds = new Set<string>();
  state: SessionRuntimeState;
  model: string;
  inflightAbort: AbortController | null = null;
  currentTurnUserText = "";
  currentTurnId = "";
  persistenceChain: Promise<unknown> = Promise.resolve();
  activeRound: ActiveRound | null = null;
  roundIndex = 0;
  currentTurnToolResults: RuntimeInternals["currentTurnToolResults"] = [];

  private readonly listeners = new Set<RuntimeListener>();
  private readonly agentEventUnsubscribe: () => void;

  constructor(readonly input: SessionRuntimeInput) {
    this.model = input.model ?? DEFAULT_MODEL;
    const skills = input.agentSkills ?? [];
    const roles = input.agentRoles ?? [];
    this.tools = buildWorkspaceTools(input.scope, input.toolActions, {
      findSkill: (name) => skills.find((skill) => skill.name === name) ?? null,
      findRole: (name) => roles.find((role) => role.name === name) ?? null,
      listSkillNames: () => skills.map((skill) => skill.name),
      listRoleNames: () => roles.map((role) => role.name),
    });
    this.state = {
      messages: [...input.messages],
      summaries: [...input.summaries],
      streamingFinalText: "",
      trace: [],
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
      streamFn: (model, context, options) =>
        streamFromBackend(this, model, context, options),
    });

    this.agentEventUnsubscribe = this.agent.subscribe((event) =>
      handleAgentEvent(this, event),
    );
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
    return sendUserMessage(this, content);
  }

  /**
   * Drop the in-memory trace for the active session. Intended to be called
   * by the controller when the user navigates away — the trace is local UI
   * state, not persisted.
   */
  clearTrace(): void {
    if (this.state.trace.length === 0 && this.state.streamingFinalText.length === 0) return;
    this.state = { ...this.state, trace: [], streamingFinalText: "" };
    this.notify();
  }

  replaceSummaries(summaries: Summary[]) {
    this.state = { ...this.state, summaries };
    this.notify();
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (error) {
        console.error("[runtime listener]", error);
      }
    }
  }
}
