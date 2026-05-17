import type { Agent, AgentTool } from "@earendil-works/pi-agent-core";
import type { EphemeralToolResult } from "../transcript";
import type {
  Agent as AgentRecord,
  AgentRole,
  AgentSkill,
  Message,
  Profile,
  Project,
  Summary,
  WorkspaceScope,
} from "../../lib/types";
import type { WorkspaceToolActions } from "../tools";

export type SessionRuntimeInput = {
  sessionId: string;
  scope: WorkspaceScope;
  profile: Profile;
  project: Project | null;
  agent: AgentRecord | null;
  agentSkills?: AgentSkill[];
  agentRoles?: AgentRole[];
  messages: Message[];
  summaries: Summary[];
  toolActions: WorkspaceToolActions;
  model?: string;
};

export type ToolCallStatus = "queued" | "running" | "success" | "error";

export type RuntimeTraceEvent =
  | {
      kind: "reasoning";
      id: string;
      round: number;
      text: string;
      at: number;
    }
  | {
      kind: "tool_call";
      id: string;
      round: number;
      toolCallId: string;
      name: string;
      argsJson: string;
      status: ToolCallStatus;
      result?: string;
      error?: string;
      at: number;
    };

export type SessionRuntimeState = {
  messages: Message[];
  summaries: Summary[];
  // Text streaming as the model's final answer. Populated only when the
  // active round has produced text without tool_calls. Cleared on turn end.
  streamingFinalText: string;
  // In-memory trace of the in-flight turn (reasoning + tool events).
  // Reset on every sendUserMessage. Not persisted.
  trace: RuntimeTraceEvent[];
  isStreaming: boolean;
};

export type RuntimeListener = (state: SessionRuntimeState) => void;

export type ActiveRound = {
  index: number;
  textBuffer: string;
  hasToolCalls: boolean;
  reasoningEventId: string | null;
  toolCallEventIds: Map<string, string>;
};

/**
 * Internal surface of {@link SessionRuntime} shared with the feature modules
 * (message-flow / stream / persistence / trace). Lets the orchestration class
 * stay in one file while the conversational loop is split by responsibility,
 * without exposing these members on the public API.
 */
export interface RuntimeInternals {
  readonly input: SessionRuntimeInput;
  readonly tools: AgentTool[];
  readonly agent: Agent;
  readonly persistedMessageIds: Set<string>;
  state: SessionRuntimeState;
  model: string;
  inflightAbort: AbortController | null;
  currentTurnUserText: string;
  persistenceChain: Promise<unknown>;
  activeRound: ActiveRound | null;
  roundIndex: number;
  currentTurnToolResults: EphemeralToolResult[];
  notify(): void;
}
